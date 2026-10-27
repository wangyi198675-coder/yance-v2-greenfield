import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {IdentityConsentService} from './identity-consent.mjs';
import {createW24DurableProofVerifier} from './durable-identity.mjs';
import {createW24OfficialAccountLifecycle} from './native-account-lifecycle.mjs';
// In the W09 combined worktree, load the real co-located W44 Owner source.
const root=process.env.YANCE_W44_ROOT??process.env.YANCE_PR32_ROOT??fileURLToPath(new URL('../../../../../',import.meta.url));
if(!root)throw Error('EXACT_W44_SOURCE_REQUIRED');
const {openEligibilityStore}=await import(pathToFileURL(resolve(root,
 'services/api/src/domains/grant-custody-budget/index.mjs')).href);
const proofAuthority={evaluate:({proof_ref})=>({approved:
 typeof proof_ref==='string'&&proof_ref.startsWith('fake-verified-')})};
const same='fake-common-contact',ctx={tenant:'SYNTHETIC_TEST_ONLY',
 principal_id:'fake-principal-1',input_domain:'CONTACT'};
function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'w24-issue77-lifecycle-'));
 const options={path:join(dir,'existing-w44.sqlite'),requireDurableIdentity:true,
  authorizeMutation:({actor})=>actor===ctx.principal_id,
  verifyOwnerMutation:createW24DurableProofVerifier({proofAuthority,
   authorizeOperator:({actor})=>actor===ctx.principal_id})};
 const store=openEligibilityStore(options);
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true})});
 const identityConsent=new IdentityConsentService({requireDurableIdentity:true,
  durableAuthority:store,proofAuthority});
 let principal={verified:true,principalId:ctx.principal_id,sessionRevision:'test-rev-one'};
 const rows=new Map(['A','B'].map((name)=>[name,{
  verifiedSource:true,platformOwnerVerified:true,userAuthorized:true,
  nativeSessionCurrent:true,accountOnline:true,tenant:ctx.tenant,
  account:'fixture-'+name,channel:'FB_PAGE',accountLocator:name,
  platformAccountId:'official-page-'+name,
  accountAnchorPeerId:'fake-self-'+name,bindingRevision:1,
  bindingProofRef:'fake-verified-account-'+name,principalId:ctx.principal_id
 }]));
 const peerMap=new Map();
 const port=createW24OfficialAccountLifecycle({identityConsent,
  resolveCurrentPrincipal:async()=>principal,
  resolveOfficialAccount:async({channel,accountLocator})=>{
   const row=rows.get(accountLocator);
   return row?.channel===channel?{...row}:null;
  },
  resolveOfficialPeer:async({account,peerLocator})=>{
   const key=account.accountLocator+':'+peerLocator,change=peerMap.get(key)??{};
   return {verifiedSource:true,platformPeerVerified:true,
    accountLocator:account.accountLocator,platformAccountId:account.platformAccountId,
    account:account.account,tenant:account.tenant,channel:account.channel,
    peerLocator,peerId:peerLocator,platformPeerId:peerLocator,
    peerProofRef:'fake-verified-peer-'+account.accountLocator,
    bindingRevision:account.bindingRevision,nativeSessionCurrent:true,...change};
  },
  readW44IdentityAuthority:({actor,identity})=>
   store.readIdentityAuthority({actor,identity})
 });
 const session=Object.freeze({kind:'LOCAL_TEST_ONLY'});
 const register=(name)=>port.registerApprovedAccount({session,channel:'FB_PAGE',accountLocator:name});
 const bind=(name,peerLocator=same)=>port.bindApprovedPeer({
  session,channel:'FB_PAGE',accountLocator:name,peerLocator});
 const read=(name,peerLocator=same)=>port.readApprovedPeer({
  session,channel:'FB_PAGE',accountLocator:name,peerLocator});
 return {port,session,rows,peerMap,store,identityConsent,register,bind,read,
  setPrincipal:x=>principal=x};
}
test('W24 refuses no original W44/IdentityConsent durable authority',()=>{
 assert.throws(()=>createW24OfficialAccountLifecycle(),e=>
   e.code==='ORIGINAL_W24_W44_AND_NATIVE_OWNERS_REQUIRED');
});
test('two officially-shaped accounts on SAME platform register separately and share no peers',async t=>{
 const f=fixture(t);
 assert.equal((await f.register('A')).status,'BOUND');
 assert.equal((await f.register('B')).status,'BOUND');
 assert.equal((await f.bind('A')).status,'BOUND');
 assert.equal((await f.bind('B')).status,'BOUND');
 const a=await f.read('A'),b=await f.read('B');
 assert.notEqual(a.identity.identity_key,b.identity.identity_key);
 assert.equal(a.identity.account,'fixture-A');
 assert.equal(b.identity.account,'fixture-B');
 assert.equal(a.consentEpoch,1);
 assert.equal(a.canSend,false);assert.equal(b.canSend,false);
 assert.equal((await f.read('A')).bindingRevision,1);
});
test('view and switch read-only never request TAKEOVER or modify custody epoch',async t=>{
 const f=fixture(t);await f.register('A');await f.register('B');await f.bind('A');await f.bind('B');
 const k=n=>({tenant:ctx.tenant,account:'fixture-'+n,channel:'FB_PAGE',
  peer_id:same,binding_revision:1});
 const beforeA=f.store.readIdentityAuthority({actor:ctx.principal_id,identity:k('A')});
 const beforeB=f.store.readIdentityAuthority({actor:ctx.principal_id,identity:k('B')});
 await f.read('A');await f.read('B');await f.read('A');
 const afterA=f.store.readIdentityAuthority({actor:ctx.principal_id,identity:k('A')});
 const afterB=f.store.readIdentityAuthority({actor:ctx.principal_id,identity:k('B')});
 assert.equal(afterA.custodyEpoch,beforeA.custodyEpoch);
 assert.equal(afterB.custodyEpoch,beforeB.custodyEpoch);
 assert.equal(afterA.mode,beforeA.mode);assert.equal(afterB.mode,beforeB.mode);
});
test('revoke A fails closed but B remains bound and readable',async t=>{
 const f=fixture(t);await f.register('A');await f.register('B');await f.bind('A');await f.bind('B');
 assert.equal((await f.port.revokeApprovedAccount({session:f.session,
  channel:'FB_PAGE',accountLocator:'A'})).status,'REVOKED');
 await assert.rejects(f.read('A'));
 assert.equal((await f.read('B')).identity.account,'fixture-B');
});
test('official account A peer identity switch or stale revision never reads B peer',async t=>{
 const f=fixture(t);await f.register('A');await f.register('B');await f.bind('A');await f.bind('B');
 f.peerMap.set('A:'+same,{account:'fixture-B'});
 await assert.rejects(f.read('A'),e=>e.code==='OFFICIAL_PEER_NOT_OWNED_BY_ACCOUNT');
 f.peerMap.clear();
 f.rows.get('A').bindingRevision=2;
 await assert.rejects(f.read('A'));
 assert.equal((await f.read('B')).identity.account,'fixture-B');
});
test('unapproved account, revoked local principal, SDK no longer online never return ONLINE',async t=>{
 const f=fixture(t);
 f.rows.get('A').accountOnline=false;
 await assert.rejects(f.register('A'),e=>e.code==='OFFICIAL_USER_ACCOUNT_NOT_AUTHORIZED');
 f.rows.get('A').accountOnline=true;f.rows.get('A').userAuthorized=false;
 await assert.rejects(f.register('A'),e=>e.code==='OFFICIAL_USER_ACCOUNT_NOT_AUTHORIZED');
 f.rows.get('A').userAuthorized=true;
 f.setPrincipal({verified:false,principalId:ctx.principal_id,sessionRevision:'test-rev-two'});
 await assert.rejects(f.register('A'),e=>e.code==='LOCAL_PRINCIPAL_NOT_AUTHENTICATED');
});
test('real upstream tenant cannot bypass original W24/W44 synthetic-only identity',async t=>{
 const f=fixture(t);Object.assign(f.rows.get('A'),{tenant:'real-local-user',
  account:'real-official-page',accountAnchorPeerId:'verified-self'});
 await assert.rejects(f.register('A'),e=>e.code==='NONPRODUCTION_TENANT_ONLY'||e.message==='ONLY_SYNTHETIC_FULL_K');
});

test('local owner can revoke A after official SDK disconnected, without affecting B',async t=>{
 const f=fixture(t);await f.register('A');await f.register('B');await f.bind('A');await f.bind('B');
 Object.assign(f.rows.get('A'),{accountOnline:false,userAuthorized:false,nativeSessionCurrent:false});
 const result=await f.port.revokeApprovedAccount({session:f.session,
  channel:'FB_PAGE',accountLocator:'A'});
 assert.equal(result.status,'REVOKED');
 await assert.rejects(f.read('A'));
 assert.equal((await f.read('B')).identity.account,'fixture-B');
});
test('revoked account relink requires new revision and fresh Peer binding',async t=>{
 const f=fixture(t);await f.register('A');await f.bind('A');
 const revoked=await f.port.revokeApprovedAccount({session:f.session,
  channel:'FB_PAGE',accountLocator:'A'});
 assert.equal(revoked.status,'REVOKED');
 const old={tenant:ctx.tenant,account:'fixture-A',channel:'FB_PAGE',
  peer_id:'fake-self-A',binding_revision:1};
 const state=f.store.readIdentityAuthority({actor:ctx.principal_id,identity:old});
 assert.equal(state.account.active,false);
 f.rows.get('A').bindingRevision=state.bindingRevision+1;
 const res=await f.port.relinkApprovedAccount({session:f.session,
  channel:'FB_PAGE',accountLocator:'A'});
 assert.equal(res.status,'RELINKED');
 assert.equal(res.peersRequireFreshBinding,true);
 await assert.rejects(f.read('A'));
 assert.equal((await f.bind('A')).status,'BOUND');
 assert.equal((await f.read('A')).bindingRevision,res.bindingRevision);
});
