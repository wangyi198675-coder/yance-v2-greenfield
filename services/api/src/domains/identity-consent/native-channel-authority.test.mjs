import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {IdentityConsentService} from './identity-consent.mjs';
import {createW24DurableProofVerifier} from './durable-identity.mjs';
import {createW24NativeInboundIdentityPort} from './native-channel-authority.mjs';
const root=process.env.YANCE_W44_ROOT||process.env.YANCE_PR32_ROOT;
if(!root)throw Error('EXPLICIT_W44_REAL_SOURCE_REQUIRED');
const {openEligibilityStore}=await import(pathToFileURL(resolve(root,
 'services/api/src/domains/grant-custody-budget/index.mjs')).href);
const ctx={tenant:'SYNTHETIC_TEST_ONLY',principal_id:'fake-owner-1',input_domain:'CONTACT'};
const k=Object.freeze({tenantId:ctx.tenant,accountId:'fixture-channel-1',
 channel:'TELEGRAM_PERSONAL',peerId:'fake-peer-A',bindingRevision:'1'});
const K={tenant:k.tenantId,account:k.accountId,channel:k.channel,
 peer_id:k.peerId,binding_revision:1};
const binding=Object.freeze({
 authoritative:true,nativeSessionCurrent:true,platformConnectionAuthorized:true,
 platformProofVerified:true,peerBound:true,
 principalId:ctx.principal_id,tenant:ctx.tenant,account:k.accountId,
 channel:k.channel,peerId:k.peerId,bindingRevision:1
});
const proofAuthority={evaluate:({proof_ref})=>({approved:proof_ref?.startsWith('fake-verified-')})};
function realOwner(t){
 const dir=mkdtempSync(join(tmpdir(),'w24-native-auth-inbound-'));
 const store=openEligibilityStore({path:join(dir,'existing-w44.sqlite'),
  requireDurableIdentity:true,
  authorizeMutation:({actor})=>actor===ctx.principal_id,
  verifyOwnerMutation:createW24DurableProofVerifier({
   proofAuthority,authorizeOperator:({actor})=>actor===ctx.principal_id
  })});
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true})});
 const id=new IdentityConsentService({requireDurableIdentity:true,
  durableAuthority:store,proofAuthority});
 assert.equal(id.registerAccount(ctx,{...K,principal_id:ctx.principal_id,
  binding_proof_ref:'fake-verified-channel'}).status,'COMMITTED');
 assert.equal(id.bindPeer(ctx,{...K,
  peer_proof_ref:'fake-verified-peer'}).status,'COMMITTED');
 return id;
}
test('native source port refuses legacy RAM mode or missing verified owner resolver',()=>{
 const legacy=new IdentityConsentService();
 assert.throws(()=>createW24NativeInboundIdentityPort({identityConsent:legacy,
  resolveVerifiedChannelBinding:async()=>binding}),
  e=>e.code==='W24_AND_AUTHENTICATED_CHANNEL_BINDING_REQUIRED');
 assert.throws(()=>createW24NativeInboundIdentityPort(),
  e=>e.code==='W24_AND_AUTHENTICATED_CHANNEL_BINDING_REQUIRED');
});
test('W24 actual durable K and epoch native-source read cannot grant outbound authority',async t=>{
 const id=realOwner(t);
 const resolver=createW24NativeInboundIdentityPort({identityConsent:id,
   resolveVerifiedChannelBinding:async()=>binding});
 const r=await resolver.readW24Identity({k,nativePrincipalId:ctx.principal_id,
   channelAccount:k.accountId,peerId:k.peerId});
 assert.equal(r.canSend,false);
 assert.equal(r.identityKey,'SYNTHETIC_TEST_ONLY|fixture-channel-1|TELEGRAM_PERSONAL|fake-peer-A|1');
 assert.equal(r.consentEpoch,id.readConsentEpoch(ctx,K));
});
test('wrong Actor, peer, channel, account, binding revision or revoked local Session deny',async t=>{
 const id=realOwner(t);
 const cases=[{nativePrincipalId:'fake-attacker'}, {peerId:'fake-peer-other'},
  {channelAccount:'fixture-other'}];
 const port=createW24NativeInboundIdentityPort({identityConsent:id,
   resolveVerifiedChannelBinding:async()=>binding});
 for(const patch of cases)await assert.rejects(port.readW24Identity({
  k,nativePrincipalId:ctx.principal_id,channelAccount:k.accountId,peerId:k.peerId,...patch
 }));
 for(const patch of [{nativeSessionCurrent:false},{platformProofVerified:false},
  {platformConnectionAuthorized:false},{peerBound:false},
  {bindingRevision:2},{account:'fixture-unrelated'}]){
  const alt=createW24NativeInboundIdentityPort({identityConsent:id,
   resolveVerifiedChannelBinding:async()=>({...binding,...patch})});
  await assert.rejects(alt.readW24Identity({k,nativePrincipalId:ctx.principal_id,
    channelAccount:k.accountId,peerId:k.peerId}));
 }
});
test('real-looking upstream K must stay blocked by existing W24/W44 owner hold',async t=>{
 const id=realOwner(t);
 const actual={tenantId:'real-personal-install',accountId:'wa:123456789',
   channel:'WHATSAPP_PERSONAL',peerId:'original-peer',bindingRevision:'1'};
 const verified={...binding,tenant:actual.tenantId,account:actual.accountId,
   channel:actual.channel,peerId:actual.peerId};
 const port=createW24NativeInboundIdentityPort({identityConsent:id,
   resolveVerifiedChannelBinding:async()=>verified});
 await assert.rejects(port.readW24Identity({k:actual,nativePrincipalId:ctx.principal_id,
   channelAccount:actual.accountId,peerId:actual.peerId}),
   e=>e.code==='NONPRODUCTION_TENANT_ONLY');
});
test('W24 strict durable revoke invalidates peer; later source-shaped event cannot reauthorize',async t=>{
 const id=realOwner(t);
 const p=createW24NativeInboundIdentityPort({identityConsent:id,
   resolveVerifiedChannelBinding:async()=>binding});
 assert.equal((await p.readW24Identity({k,nativePrincipalId:ctx.principal_id,
  channelAccount:k.accountId,peerId:k.peerId})).valid,true);
 assert.equal(id.invalidateAccount(ctx,{...K,expected_revision:1}).status,'COMMITTED');
 await assert.rejects(p.readW24Identity({k,nativePrincipalId:ctx.principal_id,
   channelAccount:k.accountId,peerId:k.peerId}));
});
