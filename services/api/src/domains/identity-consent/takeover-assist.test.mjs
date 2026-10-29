import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {IdentityConsentService,canonicalK} from './identity-consent.mjs';
import {createW24DurableProofVerifier} from './durable-identity.mjs';
import {createNativeTakeoverService,TakeoverDenied,TAKEOVER_GET,TAKEOVER_POST}
  from './takeover.mjs';
import {createNativeTakeoverHttpHandler} from './takeover-http.mjs';

const root=process.env.YANCE_W44_ROOT??process.env.YANCE_PR32_ROOT;
if(!root)throw Error('ORIGINAL_W44_SOURCE_ROOT_REQUIRED');
const {openEligibilityStore}=await import(pathToFileURL(resolve(root,
 'services/api/src/domains/grant-custody-budget/index.mjs')).href);
const tenant='SYNTHETIC_TEST_ONLY',actor='fake-owner-1';
const ctx={tenant,principal_id:actor,input_domain:'CONTACT'};
const K=(peer)=>({tenant,account:'fixture-shared-account',channel:'FB_PERSONAL',
 peer_id:peer,binding_revision:1});
const A=K('fake-contact-A'),B=K('fake-contact-B'),C=K('fake-contact-C');
const rootProbe=mkdtempSync(join(tmpdir(),'w24-assist-w44-probe-'));
const probe=openEligibilityStore({path:join(rootProbe,'old-sdk-probe.sqlite'),
 requireDurableIdentity:true,authorizeMutation:()=>false,
 verifyOwnerMutation:()=>({verified:false})});
const w44ThreeModeAvailable=typeof probe.switchMode==='function'&&
 typeof probe.readModeState==='function'&&typeof probe.readGrantState==='function';
probe.close();rmSync(rootProbe,{recursive:true,force:true});
const nativeTest=w44ThreeModeAvailable?test:(name,fn)=>test.skip(name+
 ' [original W44 three-mode owner absent in pinned sibling; independent Owner HOLD]',fn);

function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'w24-assist-to-human-')),path=join(dir,'real-w44.sqlite');
 const approved={evaluate:({proof_ref})=>({approved:typeof proof_ref==='string'&&
  proof_ref.startsWith('fake-verified-')})};
 const originalProof=createW24DurableProofVerifier({proofAuthority:approved,
  authorizeOperator:({actor:a})=>a===actor});
 const store=openEligibilityStore({path,requireDurableIdentity:true,
  authorizeMutation:({actor:a})=>a===actor,
  verifyOwnerMutation:(input)=>['MODE_ASSIST','MODE_MANUAL','MODE_AUTO','ISSUE_GRANT']
   .includes(input.kind)?{verified:input.mutation?.approvalRef==='fake-verified-owner-approved'}:
   originalProof(input)});
 const ids=new IdentityConsentService({requireDurableIdentity:true,
  durableAuthority:store,proofAuthority:approved});
 assert.equal(ids.registerAccount(ctx,{...A,principal_id:actor,
  binding_proof_ref:'fake-verified-account'}).status,'COMMITTED');
 for(const k of [A,B,C])assert.equal(ids.bindPeer(ctx,{...k,
  peer_proof_ref:'fake-verified-peer'}).status,'COMMITTED');
 const svc=createNativeTakeoverService({identityConsent:ids,custodyStore:store,
  authorizeTakeover:({trustedContext,action})=>trustedContext.principal_id===actor&&
   ['READ_STATE','TYPE','PASTE','VOICE','SEND_ATTEMPT'].includes(action)});
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true})});
 const modeState=k=>store.readModeState({identity:k,actor});
 const switchMode=(k,targetMode,id='fake-mode-'+targetMode+'-'+k.peer_id)=>{
  const before=modeState(k);
  return store.switchMode({identity:k,actor,targetMode,idempotencyKey:id,
   expectedGeneration:before.barriers.generation,
   expectedBindingRevision:before.identityEpochs.bindingRevision,
   expectedAccountEpoch:before.identityEpochs.accountEpoch,
   expectedConsentEpoch:before.identityEpochs.consentEpoch,
   expectedCustodyEpoch:before.identityEpochs.custodyEpoch,
   payload:{targetMode,approvalRef:'fake-verified-owner-approved'}});
 };
 const grant=(k)=>{
  const s=store.readGrantState({identity:k,actor,scope:'CONTACT'});
  const result=store.grantAction({identity:k,actor,scope:'CONTACT',action:'ISSUE',
   idempotencyKey:'fake-grant-'+k.peer_id,
   expectedGeneration:s.barrier.generation,
   expectedBindingRevision:s.identityEpochs.bindingRevision,
   expectedAccountEpoch:s.identityEpochs.accountEpoch,
   expectedConsentEpoch:s.identityEpochs.consentEpoch,
   expectedCustodyEpoch:s.identityEpochs.custodyEpoch,
   payload:{grantScope:'CONTACT',approvalRef:'fake-verified-owner-approved',
    budgetUnits:3,expiresAt:Date.now()+600000,expectedGrantEpoch:s.grant?.epoch??0}});
  assert.equal(result.status,'COMMITTED');
  return result;
 };
 const get=k=>svc.get({trustedContext:ctx,identity:k});
 const post=(k,before,action='TYPE',override={})=>svc.post({
  trustedContext:ctx,identity:k,expectedIdentityKey:before.identityKey,
  expectedEpoch:before.epoch,
  expectedAccountRevocationEpoch:before.accountRevocationEpoch,
  expectedConsentEpoch:before.consentEpoch,action,
  intent:'TAKEOVER_HUMAN_COMPOSER',...override});
 return {store,ids,svc,grant,switchMode,modeState,get,post};
}
function denied(fn,code,status){
 assert.throws(fn,e=>e instanceof TakeoverDenied&&e.code===code&&
  (status===undefined||e.status===status));
}
nativeTest('original W44 MODE_ASSIST is a real GET mode, not 503; passive GET has no takeover side effects',t=>{
 const f=fixture(t);const s=f.switchMode(A,'ASSIST');
 assert.equal(s.status,'COMMITTED');
 const before=f.get(A);
 assert.equal(before.mode,'ASSIST');
 assert.equal(before.epoch,s.readback.identityEpochs.custodyEpoch);
 assert.equal(before.canSend,false);
 assert.equal(f.get(A).mode,'ASSIST');
 assert.equal(f.modeState(A).selectedMode,'ASSIST');
 assert.equal(f.modeState(A).identityEpochs.custodyEpoch,before.epoch);
 denied(()=>f.post(A,before,'SELECT'),'NON_USER_EDIT_ACTION',422);
 denied(()=>f.post(A,before,'VIEW'),'NON_USER_EDIT_ACTION',422);
 denied(()=>f.post(A,before,'FOCUS'),'NON_USER_EDIT_ACTION',422);
 assert.equal(f.get(A).mode,'ASSIST');
});
nativeTest('ASSIST→HUMAN original W44 SQLite CAS, GET→POST→GET, independent B/C AUTO grants',t=>{
 const f=fixture(t);f.grant(B);f.grant(C);
 const b0=f.modeState(B),c0=f.modeState(C),bg=f.store.readGrantState({
  identity:B,actor,scope:'CONTACT'}).grant,cg=f.store.readGrantState({
  identity:C,actor,scope:'CONTACT'}).grant;
 assert.equal(f.switchMode(A,'ASSIST').status,'COMMITTED');
 const before=f.get(A);assert.equal(before.mode,'ASSIST');
 const done=f.post(A,before,'PASTE');
 assert.equal(done.accepted,true);assert.equal(done.confirmedByGet,true);
 const after=f.get(A);
 assert.equal(after.mode,'HUMAN');assert.equal(after.epoch,before.epoch+1);
 assert.equal(f.modeState(A).selectedMode,'MANUAL');
 for(const [k,initial,g]of [[B,b0,bg],[C,c0,cg]]){
  const curr=f.modeState(k),grant=f.store.readGrantState({
   identity:k,actor,scope:'CONTACT'}).grant;
  assert.equal(curr.selectedMode,'AUTO');
  assert.equal(curr.identityEpochs.custodyEpoch,initial.identityEpochs.custodyEpoch);
  assert.equal(grant.enabled,true);assert.equal(grant.epoch,g.epoch);
  assert.equal(grant.available,g.available);
 }
 denied(()=>f.post(A,before,'PASTE'),'STALE_TAKEOVER_EPOCH',409);
});
nativeTest('ASSIST strict 409 on stale mode generation, consent epoch, account revoke and rebind',t=>{
 const f=fixture(t);
 assert.equal(f.switchMode(A,'ASSIST').status,'COMMITTED');
 const old=f.get(A);
 denied(()=>f.post(A,old,'TYPE',{expectedEpoch:old.epoch+1}),
  'STALE_TAKEOVER_EPOCH',409);
 denied(()=>f.post(A,old,'TYPE',{expectedConsentEpoch:old.consentEpoch+1}),
  'STALE_TAKEOVER_EPOCH',409);
 const next=f.switchMode(A,'MANUAL');
 assert.equal(next.status,'COMMITTED');
 denied(()=>f.post(A,old),'STALE_TAKEOVER_EPOCH',409);
});
nativeTest('ASSIST authorization/revoke failure must not promote HUMAN or interrupt other account',t=>{
 const f=fixture(t);
 assert.equal(f.switchMode(A,'ASSIST').status,'COMMITTED');
 const before=f.get(A);
 const invalid={...A,account:'fixture-other-account'};
 denied(()=>f.post(invalid,before),'STALE_BINDING_REVISION',409);
 f.ids.invalidateAccount(ctx,{...A,expected_revision:1});
 denied(()=>f.post(A,before),'STALE_BINDING_REVISION',409);
 denied(()=>f.get(A),'STALE_BINDING_REVISION',409);
});
nativeTest('W44 MODE_MANUAL maps only to historical Composer HUMAN wire mode',t=>{
 const f=fixture(t);
 assert.equal(f.switchMode(A,'MANUAL').status,'COMMITTED');
 const get=f.get(A);
 assert.equal(get.mode,'HUMAN');
 assert.equal(f.modeState(A).selectedMode,'MANUAL');
 denied(()=>f.post(A,get),'ALREADY_HUMAN_USE_GET',409);
});
nativeTest('ASSIST original W24 HTTP handler accepts GET→POST→GET not fake 503',async t=>{
 const f=fixture(t);assert.equal(f.switchMode(A,'ASSIST').status,'COMMITTED');
 const http=createServer(createNativeTakeoverHttpHandler({service:f.svc,
  resolveTrustedContext:()=>ctx}));
 await new Promise((ok,fail)=>{http.once('error',fail);http.listen(0,'127.0.0.1',ok)});
 t.after(async()=>{await new Promise(ok=>http.close(ok))});
 const origin='http://127.0.0.1:'+http.address().port;
 const headers={'x-yance-environment':'synthetic-only'};
 const read=async()=>{const r=await fetch(origin+TAKEOVER_GET+
  '?k='+encodeURIComponent(canonicalK(A)),{headers});
  return {status:r.status,body:await r.json()}};
 const before=await read();
 assert.equal(before.status,200);assert.equal(before.body.mode,'ASSIST');
 const raw=await fetch(origin+TAKEOVER_POST,{method:'POST',
  headers:{...headers,'content-type':'application/json'},
  body:JSON.stringify({identity:A,intent:'TAKEOVER_HUMAN_COMPOSER',
   action:'TYPE',expectedIdentityKey:before.body.identityKey,
   expectedEpoch:before.body.epoch,
   expectedAccountRevocationEpoch:before.body.accountRevocationEpoch,
   expectedConsentEpoch:before.body.consentEpoch})});
 assert.equal(raw.status,200);const result=await raw.json();
 assert.equal(result.confirmedByGet,true);
 assert.equal((await read()).body.mode,'HUMAN');
});

nativeTest('ASSIST stale signed snapshot never revives after account revoke and new revision relink',t=>{
 const f=fixture(t);
 assert.equal(f.switchMode(A,'ASSIST').status,'COMMITTED');
 const old=f.get(A);
 f.ids.invalidateAccount(ctx,{...A,expected_revision:1});
 const linked=f.ids.relinkAccount(ctx,{...A,expected_revision:2,
  binding_proof_ref:'fake-verified-relink'});
 assert.equal(linked.status,'COMMITTED');
 const newA={...A,binding_revision:3};
 assert.equal(f.ids.bindPeer(ctx,{...newA,
  peer_proof_ref:'fake-verified-peer'}).status,'COMMITTED');
 denied(()=>f.post(A,old,'TYPE'),'STALE_BINDING_REVISION',409);
 denied(()=>f.get(A),'STALE_BINDING_REVISION',409);
 const current=f.get(newA);
 assert.equal(current.binding_revision,3);
 assert.notEqual(current.identityKey,old.identityKey);
 assert.equal(current.mode,'AUTO');
});
nativeTest('expired/revoked operator proof refuses ASSIST GET and cannot mutate W44',t=>{
 const f=fixture(t);
 assert.equal(f.switchMode(A,'ASSIST').status,'COMMITTED');
 const before=f.get(A);
 const denyAfterExpiry=createNativeTakeoverService({
  identityConsent:f.ids,custodyStore:f.store,
  authorizeTakeover:()=>false
 });
 denied(()=>denyAfterExpiry.get({trustedContext:ctx,identity:A}),
  'TAKEOVER_AUTH_DENIED',403);
 denied(()=>denyAfterExpiry.post({
  trustedContext:ctx,identity:A,
  expectedIdentityKey:before.identityKey,expectedEpoch:before.epoch,
  expectedAccountRevocationEpoch:before.accountRevocationEpoch,
  expectedConsentEpoch:before.consentEpoch,action:'TYPE',
  intent:'TAKEOVER_HUMAN_COMPOSER'
 }),'TAKEOVER_AUTH_DENIED',403);
 assert.equal(f.get(A).mode,'ASSIST');
});
