import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {IdentityConsentService} from './identity-consent.mjs';
import {createW24DurableProofVerifier} from './durable-identity.mjs';
import {createW24NativeOwnerReadPorts} from './native-owner-reads.mjs';
import {createW24ScopedContactProjection} from './native-contact-projection.mjs';

const root=process.env.YANCE_W44_ROOT??process.env.YANCE_PR32_ROOT;
if(!root)throw Error('EXACT_W44_NATIVE_OWNER_ROOT_REQUIRED');
const {openEligibilityStore}=await import(pathToFileURL(resolve(root,
 'services/api/src/domains/grant-custody-budget/index.mjs')).href);
const principal={verified:true,source:'W54_NATIVE_CURRENT_USER',
 principalRef:'fake-owner-1',installationRef:'fake-installation-1',revocationGeneration:1};
const ctx={tenant:'SYNTHETIC_TEST_ONLY',principal_id:principal.principalRef,input_domain:'CONTACT'};
const session={record:{kind:'NATIVE_FIRST_PARTY',rev:1},id:'local-fixture'};
const CHANNEL='WHATSAPP_PERSONAL',PEER='fake-same-jid';
const K=account=>({tenant:ctx.tenant,account,channel:CHANNEL,
 peer_id:PEER,binding_revision:1});
const proofAuthority={evaluate:({proof_ref})=>({approved:
 typeof proof_ref==='string'&&proof_ref.startsWith('fake-verified-')})};
function fixture(t,{two=true,withPeer=true}={}){
 const dir=mkdtempSync(join(tmpdir(),'w24-contact-scope-'));
 const dbPath=join(dir,'original-w44-persistent.sqlite'),stores=[];
 const open=()=>{
  const store=openEligibilityStore({path:dbPath,requireDurableIdentity:true,
   authorizeMutation:({actor})=>actor===ctx.principal_id,
   verifyOwnerMutation:createW24DurableProofVerifier({proofAuthority,
    authorizeOperator:({actor})=>actor===ctx.principal_id})});
  stores.push(store);
  return {store,ids:new IdentityConsentService({requireDurableIdentity:true,
   durableAuthority:store,proofAuthority})};
 };
 t.after(()=>{for(const x of stores.reverse())x.close();rmSync(dir,{recursive:true,force:true})});
 let active=open(),wasRevoked=false,sdkConnected=true,callbackCount=0;
 const accts=two?['fixture-A','fixture-B']:['fixture-A'];
 for(const account of accts){
  const k=K(account);
  assert.equal(active.ids.registerAccount(ctx,{...k,principal_id:ctx.principal_id,
   binding_proof_ref:'fake-verified-channel'}).status,'COMMITTED');
  if(withPeer)assert.equal(active.ids.bindPeer(ctx,{...k,
   peer_proof_ref:'fake-verified-peer'}).status,'COMMITTED');
 }
 const originalAccounts=()=>accts.filter(a=>!(wasRevoked&&a==='fixture-A')).map((a,i)=>({
  platformAuthorizationVerified:true,nativeSessionCurrent:true,
  channelAccountBindingCurrent:true,authorization:'ONLINE_VERIFIED',
  accountRef:'accRef_'+a.slice(-1)+'000000',channel:CHANNEL,
  ownerPrincipalRef:principal.principalRef,tenant:ctx.tenant,accountId:a,
  accountAnchorPeerId:PEER,bindingRevision:1
 }));
 const originalPeer=(a)=>[{
  platformPeerVerified:true,nativeSessionCurrent:true,
  channelAccountBindingCurrent:true,accountRef:a.accountRef,channel:a.channel,
  peerRef:PEER,bindingRevision:1,tenant:ctx.tenant,accountId:a.accountId,
  displayName:'Alex',ownerPrincipalRef:principal.principalRef
 }];
 const owner=()=>createW24NativeOwnerReadPorts({
  identityConsent:active.ids,resolveNativePrincipal:async()=>principal,
  listVerifiedPlatformAccounts:async()=>sdkConnected?originalAccounts():[],
  listVerifiedPlatformPeers:async({account})=>{callbackCount++;return withPeer?originalPeer(account):[]},
  readW44IdentityAuthority:({actor,identity})=>
   active.store.readIdentityAuthority({actor,identity})
 });
 const project=(meta)=>createW24ScopedContactProjection({
  ...owner(),...(meta?{readOriginalContactMetadata:meta}:{})
 });
 return {
  project,open,
  closeAndRestart:()=>{active.store.close();stores.splice(stores.indexOf(active.store),1);active=open();},
  revokeA:()=>{assert.equal(active.ids.invalidateAccount(ctx,{...K('fixture-A'),
   expected_revision:1}).status,'COMMITTED');wasRevoked=true},
  switchSdk:x=>sdkConnected=x,
  getCallbackCount:()=>callbackCount,
  readAuthority:account=>active.store.readIdentityAuthority({
   actor:ctx.principal_id,identity:K(account)}),
  getK:K
 };
}
test('W24 projection refuses missing actual original owner read callbacks',()=>{
 assert.throws(()=>createW24ScopedContactProjection(),/W24_ORIGINAL_AUTHORIZED_READ_PORTS_REQUIRED/);
});
test('two identically named peers on same platform but different bound accounts have different durable full K',async t=>{
 const f=fixture(t),dto=await f.project().readContacts({principal,session});
 assert.equal(dto.authoritative,true);
 assert.equal(dto.connectedAccountCount,2);
 assert.equal(dto.contacts.length,2);
 assert.equal(dto.canSend,false);
 const [a,b]=dto.contacts;
 assert.equal(a.displayName,'Alex');assert.equal(b.displayName,'Alex');
 assert.equal(a.peerRef,b.peerRef);assert.equal(a.channel,b.channel);
 assert.notEqual(a.identityKey,b.identityKey);
 assert.equal(a.contactRef,a.identityKey);
 assert.equal(a.identity.tenant,'SYNTHETIC_TEST_ONLY');
 assert.deepEqual(Object.keys(a.identity).sort(),
  ['tenant','account','channel','peer_id','binding_revision'].sort());
 assert.equal('unreadCount' in a,false);
 assert.equal('unreadTotal' in dto,false);
 assert.equal('canSend' in a,false);
});
test('account and contact searches only narrow original authorized scope',async t=>{
 const f=fixture(t),port=f.project();
 const all=await port.readContacts({principal,session});
 const a=await port.readContacts({principal,session,filter:{
  channel:'WHATSAPP_PERSONAL',accountRef:all.contacts[0].accountRef,query:'alex'
 }});
 assert.equal(a.contacts.length,1);assert.equal(a.contacts[0].contactRef,all.contacts[0].contactRef);
 const zero=await port.readContacts({principal,session,filter:{query:'not-found'}});
 assert.equal(zero.contacts.length,0);
 await assert.rejects(port.readContacts({principal,session,filter:{accountRef:'accRef_fake_external'}}),
  /ACCOUNT_FILTER_OUTSIDE_AUTHORIZED_SCOPE/);
 await assert.rejects(port.readContacts({principal,session,filter:{query:'x',unknown:true}}),
  /W24_CONTACT_FILTER_INVALID/);
});
test('native unread/pinned/archived filtering is HOLD when original metadata authority not connected',async t=>{
 const f=fixture(t),p=f.project();
 for(const key of ['unreadOnly','pinnedOnly','archivedOnly','managedOnly','needsReplyOnly']){
  await assert.rejects(p.readContacts({principal,session,filter:{[key]:true}}),
   /CONTACT_FILTER_NATIVE_METADATA_NOT_CONNECTED/);
 }
 await assert.rejects(p.readContacts({principal,session,filter:{tag:'vip'}}),
  /CONTACT_FILTER_NATIVE_METADATA_NOT_CONNECTED/);
});
test('native authoritative metadata filters may reduce but never invent contacts or unread counts',async t=>{
 const f=fixture(t),p=f.project(async({contacts})=>contacts.map((c,i)=>({
  authoritative:true,identityKey:c.identityKey,accountRef:c.accountRef,
  bindingRevision:c.identity.binding_revision,accountEpoch:c.accountEpoch,
  consentEpoch:c.consentEpoch,unreadOnly:i===0,pinnedOnly:i===0,
  archivedOnly:false,managedOnly:false,needsReplyOnly:i===1,
  tags:i===0?['vip']:['general']
 })));
 const unread=await p.readContacts({principal,session,filter:{unreadOnly:true,tag:'vip'}});
 assert.equal(unread.contacts.length,1);assert.equal(unread.contacts[0].displayName,'Alex');
 const needs=await p.readContacts({principal,session,filter:{needsReplyOnly:true}});
 assert.equal(needs.contacts.length,1);
 assert.notEqual(unread.contacts[0].identityKey,needs.contacts[0].identityKey);
});
test('restarting original W44 SQLite preserves exact identity K, no new W24 contact DB',async t=>{
 const f=fixture(t),before=await f.project().readContacts({principal,session});
 f.closeAndRestart();
 const after=await f.project().readContacts({principal,session});
 assert.deepEqual(after.contacts.map(c=>c.identityKey),before.contacts.map(c=>c.identityKey));
 assert.deepEqual(after.contacts.map(c=>c.accountEpoch),before.contacts.map(c=>c.accountEpoch));
 assert.deepEqual(after.contacts.map(c=>c.consentEpoch),before.contacts.map(c=>c.consentEpoch));
});
test('revoke account A persists across reboot and cannot disclose A history, B stays scoped',async t=>{
 const f=fixture(t),before=await f.project().readContacts({principal,session});
 const a=before.contacts[0].identityKey,b=before.contacts[1].identityKey;
 f.revokeA();f.closeAndRestart();
 const after=await f.project().readContacts({principal,session});
 assert.equal(after.connectedAccountCount,1);
 assert.deepEqual(after.contacts.map(c=>c.identityKey),[b]);
 assert.equal(after.contacts.some(c=>c.identityKey===a),false);
 await assert.rejects(f.project().readContacts({principal,session,
  filter:{accountRef:before.contacts[0].accountRef}}),
 /ACCOUNT_FILTER_OUTSIDE_AUTHORIZED_SCOPE/);
});
test('offline SDK cannot claim online, unbound Peer cannot materialize, and read cannot mutate takeover',async t=>{
 const f=fixture(t);
 const original=await f.project().readContacts({principal,session});
 const n=f.getCallbackCount();
 const custodyA=f.readAuthority('fixture-A').custodyEpoch;
 const custodyB=f.readAuthority('fixture-B').custodyEpoch;
 await f.project().readContacts({principal,session,filter:{query:'alex'}});
 assert.equal(f.getCallbackCount()>n,true);
 assert.equal(f.readAuthority('fixture-A').custodyEpoch,custodyA);
 assert.equal(f.readAuthority('fixture-B').custodyEpoch,custodyB);
 f.switchSdk(false);
 const gone=await f.project().readContacts({principal,session});
 assert.equal(gone.connectedAccountCount,0);
 assert.equal(gone.contacts.length,0);
 assert.equal(original.contacts.length,2);
});
test('spoofed original metadata that crosses account or lacks proper epoch is rejected',async t=>{
 const f=fixture(t),p=f.project(async({contacts})=>contacts.map(c=>({
  authoritative:true,identityKey:c.identityKey,accountRef:'attacker-account',
  bindingRevision:1,accountEpoch:c.accountEpoch,consentEpoch:c.consentEpoch,unreadOnly:true
 })));
 await assert.rejects(p.readContacts({principal,session,filter:{unreadOnly:true}}),
  /ORIGINAL_CONTACT_METADATA_SCOPE_STALE/);
});
