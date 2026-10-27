import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {canonicalK,IdentityConsentService} from './identity-consent.mjs';
import {createW24DurableProofVerifier} from './durable-identity.mjs';
import {createW24NativeOwnerReadPorts} from './native-owner-reads.mjs';
import {createW24ModeApprovalPort} from './native-mode-approval.mjs';

const root=process.env.YANCE_W44_ROOT||process.env.YANCE_PR32_ROOT;
if(!root)throw Error('ORIGINAL_W44_SOURCE_ROOT_REQUIRED');
const {openEligibilityStore}=await import(pathToFileURL(resolve(root,
 'services/api/src/domains/grant-custody-budget/index.mjs')).href);
/* The W24 PR17 CI currently mounts original PR32-era W44, which predates
 * W44's independent PR102 three-mode owner SHA e7d50cdb.
 * Never simulate the absent method or falsely count an integration PASS.
 * Run the real cross-Owner cases ONLY when the W44 source has both actual
 * readModeState and switchMode. Github will show SKIPs honestly.
 */
const probeDir=mkdtempSync(join(tmpdir(),'w24-w44-exact-mode-probe-'));
const probe=openEligibilityStore({path:join(probeDir,'probe.sqlite'),
  requireDurableIdentity:true,authorizeMutation:()=>false,
  verifyOwnerMutation:()=>({verified:false})});
const w44ModePresent=typeof probe.readModeState==='function'&&
 typeof probe.switchMode==='function'&&
 typeof probe.readGrantState==='function';
probe.close();rmSync(probeDir,{recursive:true,force:true});
const modeTest=w44ModePresent?test:(name,fn)=>test.skip(
  name+' [original W44 mode owner not in CI sibling; real cross-owner HOLD]',fn);
const actor='fake-owner-1',tenant='SYNTHETIC_TEST_ONLY',account='fixture-channel-1',
 channel='TELEGRAM_PERSONAL',scope='CONTACT',session={id:'fake-local-session',
 record:{kind:'NATIVE_FIRST_PARTY',rev:1}};
const principal=Object.freeze({verified:true,source:'W54_NATIVE_CURRENT_USER',
 principalRef:actor,installationRef:'fake-installation-one',revocationGeneration:1});
const peers=['fake-A','fake-B','fake-C'];
const K=p=>({tenant,account,channel,peer_id:p,binding_revision:1});
const ctx={tenant,principal_id:actor,input_domain:'CONTACT'};
function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'w24-w44-real-mode-contract-'));
 let now=Date.now(), seq=0,modePort,gestureCalls=0;
 const signed=new Map();
 const proofAuthority={evaluate:({proof_ref})=>({approved:
   typeof proof_ref==='string'&&proof_ref.startsWith('fake-verified-')})};
 const originalVerifier=createW24DurableProofVerifier({proofAuthority,
   authorizeOperator:({actor:a})=>a===actor});
 const store=openEligibilityStore({path:join(dir,'original-w44.sqlite'),
  requireDurableIdentity:true,now:()=>now,authorizeMutation:({actor:a})=>a===actor,
  verifyOwnerMutation:x=>x.kind.startsWith('MODE_')
   ?modePort?.verifyW44ModeMutation(x)??{verified:false}
   :x.kind==='ISSUE_GRANT'
    ?{verified:x.mutation?.approvalRef==='fake-authorized-grant'}
    :originalVerifier(x)});
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true})});
 const ids=new IdentityConsentService({requireDurableIdentity:true,
  durableAuthority:store,proofAuthority});
 assert.equal(ids.registerAccount(ctx,{...K('fake-A'),principal_id:actor,
  binding_proof_ref:'fake-verified-channel'}).status,'COMMITTED');
 for(const p of peers)
  assert.equal(ids.bindPeer(ctx,{...K(p),peer_proof_ref:'fake-verified-peer'}).status,'COMMITTED');
 let connected=true,revoked=false,principalActive=true,peerRevision=1;
 const verifiedAccount=()=>({
   platformAuthorizationVerified:true,nativeSessionCurrent:true,
   channelAccountBindingCurrent:true,authorization:'ONLINE_VERIFIED',
   accountRef:'verifiedAcct0001',channel,ownerPrincipalRef:actor,
   tenant,accountId:account,accountAnchorPeerId:'fake-A',
   bindingRevision:peerRevision
 });
 const original=createW24NativeOwnerReadPorts({
   identityConsent:ids,
   resolveNativePrincipal:async()=>principalActive?principal:
     {...principal,revocationGeneration:2},
   listVerifiedPlatformAccounts:async()=>connected&&!revoked?[verifiedAccount()]:[],
   listVerifiedPlatformPeers:async()=>peers.map(p=>({
     platformPeerVerified:true,nativeSessionCurrent:true,
     channelAccountBindingCurrent:true,accountRef:'verifiedAcct0001',
     channel,peerRef:p,tenant,accountId:account,bindingRevision:peerRevision,
     displayName:'Same name',ownerPrincipalRef:actor
   })),
   readW44IdentityAuthority:({actor:a,identity})=>store.readIdentityAuthority({actor:a,identity})
 });
 const verifySignedUserGesture=({approvalRef})=>approvalRef==='fake-async-signer'
  ?Promise.resolve({verified:true}):signed.get(approvalRef)??{verified:false};
 modePort=createW24ModeApprovalPort({
  ...original,
  resolveNativePrincipal:async()=>principalActive?principal:
    {...principal,revocationGeneration:2},
  resolveSignedUserGesture:async()=>{gestureCalls++;return {approvalRef:'fake-real-proof-unavailable',
    serverRequestId:'fake-native-request'}},
  verifySignedUserGesture,
  readW44ModeState:({identity,actor:a})=>store.readModeState({identity,actor:a}),
  readW44GrantState:({identity,actor:a,scope:s})=>store.readGrantState({identity,actor:a,scope:s}),
  clock:()=>now
 });
 const makeMode=(targetMode,p='fake-A',changes={})=>{
  const k=K(p),before=store.readModeState({identity:k,actor}),id='fake-mode-'+(++seq);
  const ref='fake-approved-mode-'+seq,kind='MODE_'+targetMode;
  const signedProof={verified:true,source:'ORIGINAL_W54_SIGNED_USER_GESTURE',
   approvalRef:ref,requestId:id,kind,actor,scope,targetMode,
   identityKey:canonicalK(k),identityEpochs:before.identityEpochs,
   issuedAt:now-10,expiresAt:now+50000,...changes};
  signed.set(ref,signedProof);
  const input={identity:k,actor,targetMode,idempotencyKey:id,
   expectedGeneration:before.barriers.generation,
   expectedBindingRevision:before.identityEpochs.bindingRevision,
   expectedAccountEpoch:before.identityEpochs.accountEpoch,
   expectedConsentEpoch:before.identityEpochs.consentEpoch,
   expectedCustodyEpoch:before.identityEpochs.custodyEpoch,
   payload:{targetMode,approvalRef:ref}};
  return {input,proof:signedProof,ref};
 };
 const createGrant=(p='fake-A',budgetUnits=2,expiresAt=now+60000)=>{
  const k=K(p),g=store.readGrantState({actor,identity:k,scope:'CONTACT'});
  return store.grantAction({actor,identity:k,scope:'CONTACT',action:'ISSUE',
   idempotencyKey:'fake-grant-'+(++seq),
   expectedGeneration:g.barrier.generation,
   expectedBindingRevision:g.identityEpochs.bindingRevision,
   expectedAccountEpoch:g.identityEpochs.accountEpoch,
   expectedConsentEpoch:g.identityEpochs.consentEpoch,
   expectedCustodyEpoch:g.identityEpochs.custodyEpoch,
   payload:{grantScope:'CONTACT',approvalRef:'fake-authorized-grant',
    budgetUnits,expiresAt,expectedGrantEpoch:g.grant?.epoch??0}});
 };
 return {ids,store,modePort,makeMode,createGrant,setNow:x=>now=x,
  advance:ms=>now+=ms,setConnected:x=>connected=x,setPrincipal:x=>principalActive=x,
  setRevision:x=>peerRevision=x,revoke:()=>{ids.invalidateAccount(ctx,{
   ...K('fake-A'),expected_revision:1});revoked=true},
  relink:()=>{
   const previous=store.readIdentityAuthority({actor,identity:K('fake-A')});
   assert.equal(ids.relinkAccount(ctx,{...K('fake-A'),
    expected_revision:previous.bindingRevision,
    binding_proof_ref:'fake-verified-relink'}).status,'COMMITTED');
   peerRevision=previous.bindingRevision+1;revoked=false;
   for(const p of peers)assert.equal(ids.bindPeer(ctx,{
    tenant,account,channel,peer_id:p,binding_revision:peerRevision,
    peer_proof_ref:'fake-verified-rebound-peer'}).status,'COMMITTED');
   return peerRevision;
  },gestureCalls:()=>gestureCalls};
}
test('W24 typed mode owner contract refuses missing native user gesture, W44 and W24 ports',()=>{
 assert.throws(()=>createW24ModeApprovalPort(),/W24_EXISTING_NATIVE_AND_W44_MODE_PORTS_REQUIRED/);
});
modeTest('GET mode only resolves actual W24 current complete K, never auto authorizes or takes custody',async t=>{
 const f=fixture(t),k=K('fake-A');
 const before=f.store.readIdentityAuthority({actor,identity:k});
 const read=await f.modePort.readModeEligibility({session,principal,
  contactSelector:canonicalK(k)});
 assert.equal(read.identityKey,canonicalK(k));
 assert.equal(read.identity.peer_id,'fake-A');
 assert.equal(read.realAccountVerified,false);
 assert.equal(read.realUserAuthorized,false);
 assert.equal(read.realAutoAuthorized,false);
 assert.equal(read.canSend,false);
 const after=f.store.readIdentityAuthority({actor,identity:k});
 assert.equal(after.custodyEpoch,before.custodyEpoch);
 assert.equal(after.accountEpoch,before.accountEpoch);
});
modeTest('no本人真人账号 = REAL_ACCOUNT_AUTH_HOLD even if original W44 has fixture grant',async t=>{
 const f=fixture(t);
 assert.equal(f.createGrant().status,'COMMITTED');
 for(const targetMode of ['MANUAL','ASSIST','AUTO'])
  await assert.rejects(f.modePort.prepareModeChange({
   session,principal,contactSelector:canonicalK(K('fake-A')),targetMode
  }),/REAL_ACCOUNT_AUTH_HOLD/);
 assert.equal(f.gestureCalls(),0);
});
modeTest('client actor/full K spoof and cross-A/B/C identity cannot authorize another peer',async t=>{
 const f=fixture(t);
 await assert.rejects(f.modePort.readModeEligibility({session,principal,
  contactSelector:canonicalK({...K('fake-A'),peer_id:'fake-UNKNOWN'})}),
  /CONTACT_NOT_IN_CURRENT_W24_AUTH_SCOPE/);
 await assert.rejects(f.modePort.readModeEligibility({session,
  principal:{...principal,principalRef:'fake-other'},contactSelector:canonicalK(K('fake-A'))}),
  /W54_CURRENT_OWNER_NOT_VERIFIED/);
 f.setRevision(2);
 await assert.rejects(f.modePort.readModeEligibility({session,principal,
  contactSelector:canonicalK(K('fake-A'))}));
});
modeTest('W44 typed sync proof verifier rejects wrong actor, mode, identity, expiry and async signer',t=>{
 const f=fixture(t),a=f.makeMode('ASSIST');
 assert.equal(f.modePort.verifyW44ModeMutation({actor,kind:'MODE_ASSIST',
  identity:K('fake-A'),requestId:a.input.idempotencyKey,
  mutation:a.input.payload}).verified,true);
 for(const forged of [
  {actor:'fake-other'}, {kind:'MODE_AUTO'},{identity:K('fake-B')},
  {requestId:'fake-other-request'},
  {mutation:{targetMode:'ASSIST',approvalRef:'fake-unverified'}}]){
  const q={actor,kind:'MODE_ASSIST',identity:K('fake-A'),
   requestId:a.input.idempotencyKey,mutation:a.input.payload,...forged};
  assert.equal(f.modePort.verifyW44ModeMutation(q).verified,false);
 }
 assert.equal(f.modePort.verifyW44ModeMutation({actor,kind:'MODE_ASSIST',
  identity:K('fake-A'),requestId:'fake-async-req',
  mutation:{targetMode:'ASSIST',approvalRef:'fake-async-signer'}}).verified,false);
 f.advance(70000);
 assert.equal(f.modePort.verifyW44ModeMutation({actor,kind:'MODE_ASSIST',
  identity:K('fake-A'),requestId:a.input.idempotencyKey,
  mutation:a.input.payload}).verified,false);
});
modeTest('W44 original mode switch uses W24 immutable typed approval; switch A does not affect B/C',t=>{
 const f=fixture(t),b=f.store.readModeState({identity:K('fake-B'),actor}),
  c=f.store.readModeState({identity:K('fake-C'),actor});
 const first=f.makeMode('ASSIST');
 const r=f.store.switchMode(first.input);
 assert.equal(r.status,'COMMITTED');assert.equal(r.readback.selectedMode,'ASSIST');
 const two=f.makeMode('MANUAL');
 assert.equal(f.store.switchMode(two.input).status,'COMMITTED');
 assert.equal(f.store.readModeState({identity:K('fake-A'),actor}).selectedMode,'MANUAL');
 assert.equal(f.store.readModeState({identity:K('fake-B'),actor}).identityEpochs.custodyEpoch,
  b.identityEpochs.custodyEpoch);
 assert.equal(f.store.readModeState({identity:K('fake-C'),actor}).identityEpochs.custodyEpoch,
  c.identityEpochs.custodyEpoch);
});
modeTest('MODE_AUTO cannot bypass existing W44 CONTACT Grant, budget or expiry',t=>{
 const f=fixture(t);
 assert.equal(f.store.switchMode(f.makeMode('AUTO').input).ok,false);
 assert.equal(f.store.switchMode(f.makeMode('ASSIST').input).status,'COMMITTED');
 let auto=f.makeMode('AUTO');
 assert.equal(f.store.switchMode(auto.input).reason,'W24_MUTATION_PROOF_REJECTED');
 assert.equal(f.createGrant('fake-A',2).status,'COMMITTED');
 const g=f.store.readGrantState({identity:K('fake-A'),actor,scope:'CONTACT'});
 auto=f.makeMode('AUTO','fake-A',{
  continuousDelegationApproved:true,grantScope:'CONTACT',
  maxBudgetUnits:1,grantEpoch:g.grant.epoch,
  grantExpiresAt:g.grant.expiresAt
 });
 assert.equal(f.store.switchMode(auto.input).status,'COMMITTED');
 assert.equal(f.store.readModeState({identity:K('fake-A'),actor}).nativeAutoEligible,true);
 assert.equal(f.store.readModeState({identity:K('fake-A'),actor}).realAutoAuthorized,false);
});
modeTest('old signed AUTO proof fails after actual original W44 expiry; stale CAS cannot reuse old approval',t=>{
 const f=fixture(t);
 assert.equal(f.createGrant('fake-A',1).status,'COMMITTED');
 const g=f.store.readGrantState({identity:K('fake-A'),actor,scope:'CONTACT'});
 const auto=f.makeMode('AUTO','fake-A',{continuousDelegationApproved:true,
  grantScope:'CONTACT',maxBudgetUnits:1,grantEpoch:g.grant.epoch,
  grantExpiresAt:g.grant.expiresAt});
 assert.equal(f.store.switchMode(f.makeMode('ASSIST').input).status,'COMMITTED');
 const stale=f.store.switchMode(auto.input);
 assert.equal(stale.status,'CONFLICT');
 const updated=f.makeMode('AUTO','fake-A',{continuousDelegationApproved:true,
  grantScope:'CONTACT',maxBudgetUnits:1,grantEpoch:g.grant.epoch,
  grantExpiresAt:g.grant.expiresAt});
 f.advance(70000);
 assert.notEqual(f.store.switchMode(updated.input).status,'COMMITTED');
});
modeTest('account revocation denies old K/mode proof and every peer on the revoked account',async t=>{
 const f=fixture(t);
 const proof=f.makeMode('ASSIST','fake-A');
 f.revoke();
 assert.equal(f.store.readIdentityAuthority({actor,identity:K('fake-A')}).valid,false);
 assert.notEqual(f.store.switchMode(proof.input).status,'COMMITTED');
 await assert.rejects(f.modePort.readModeEligibility({session,principal,
  contactSelector:canonicalK(K('fake-A'))}),/CONTACT_NOT_IN_CURRENT_W24_AUTH_SCOPE/);
 const b=await f.modePort.readModeEligibility({session,principal,
  contactSelector:canonicalK(K('fake-B'))}).catch(e=>e);
 assert.equal(b instanceof Error,true); // A revokes shared account in this fixture.
});

modeTest('explicit account relink increments revision; old five-part K and signed MODE proof fail',async t=>{
 const f=fixture(t),old=K('fake-A'),signed=f.makeMode('ASSIST','fake-A');
 f.revoke();
 const newRevision=f.relink();
 assert.equal(newRevision,3);
 assert.notEqual(canonicalK(old),canonicalK({...old,binding_revision:newRevision}));
 assert.notEqual(f.store.switchMode(signed.input).status,'COMMITTED');
 await assert.rejects(f.modePort.readModeEligibility({session,principal,
  contactSelector:canonicalK(old)}),/CONTACT_NOT_IN_CURRENT_W24_AUTH_SCOPE/);
 const newK={...old,binding_revision:newRevision};
 const after=await f.modePort.readModeEligibility({session,principal,
  contactSelector:canonicalK(newK)});
 assert.equal(after.identity.binding_revision,newRevision);
 assert.equal(after.realAutoAuthorized,false);
});
