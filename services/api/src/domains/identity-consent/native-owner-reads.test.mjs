import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {IdentityConsentService} from './identity-consent.mjs';
import {createW24DurableProofVerifier} from './durable-identity.mjs';
import {createW24NativeOwnerReadPorts} from './native-owner-reads.mjs';
const w44root=process.env.YANCE_W44_ROOT||process.env.YANCE_PR32_ROOT;
const w47root=process.env.YANCE_W47_ROOT||process.env.YANCE_PR32_ROOT;
if(!w44root||!w47root)throw Error('OWNER_REAL_SOURCE_PATHS_REQUIRED');
const [{openEligibilityStore},{createNativeOwnerReadHttp}]=await Promise.all([
 import(pathToFileURL(resolve(w44root,'services/api/src/domains/grant-custody-budget/index.mjs')).href),
 import(pathToFileURL(resolve(w47root,'services/api/runtime/native-authoritative-reads.mjs')).href)
]);
const principal=Object.freeze({verified:true,source:'W54_NATIVE_CURRENT_USER',
 principalRef:'fake-owner-1',installationRef:'fake-install-1',revocationGeneration:1});
const session={id:'session-fixture',record:{rev:1}};
const k={tenant:'SYNTHETIC_TEST_ONLY',account:'fixture-channel-1',
 channel:'TELEGRAM_PERSONAL',peer_id:'fake-peer-A',binding_revision:1};
const act={tenant:k.tenant,principal_id:principal.principalRef,input_domain:'CONTACT'};
const sampleAccount={platformAuthorizationVerified:true,nativeSessionCurrent:true,
 channelAccountBindingCurrent:true,authorization:'ONLINE_VERIFIED',
 accountRef:'accountref_001',channel:k.channel,ownerPrincipalRef:principal.principalRef};
const samplePeer={platformPeerVerified:true,nativeSessionCurrent:true,
 channelAccountBindingCurrent:true,accountRef:sampleAccount.accountRef,
 channel:k.channel,peerRef:k.peer_id,bindingRevision:k.binding_revision,
 tenant:k.tenant,accountId:k.account,displayName:'Sample Peer',
 ownerPrincipalRef:principal.principalRef};
const proofAuthority={evaluate:({proof_ref})=>({approved:proof_ref?.startsWith('fake-verified-')})};
function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'w24-w47-owner-reads-'));
 const store=openEligibilityStore({path:join(dir,'w44.sqlite'),requireDurableIdentity:true,
  authorizeMutation:({actor})=>actor===principal.principalRef,
  verifyOwnerMutation:createW24DurableProofVerifier({proofAuthority,
   authorizeOperator:({actor})=>actor===principal.principalRef})});
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true})});
 const ids=new IdentityConsentService({requireDurableIdentity:true,
  durableAuthority:store,proofAuthority});
 assert.equal(ids.registerAccount(act,{...k,principal_id:principal.principalRef,
  binding_proof_ref:'fake-verified-channel'}).status,'COMMITTED');
 assert.equal(ids.bindPeer(act,{...k,peer_proof_ref:'fake-verified-peer'}).status,'COMMITTED');
 let nativeAlive=true,upstreamOnline=true;
 const readNative=async()=>nativeAlive?principal:{...principal,revocationGeneration:2};
 const bridge=()=>createW24NativeOwnerReadPorts({
  identityConsent:ids,resolveNativePrincipal:readNative,
  listVerifiedPlatformAccounts:async()=>upstreamOnline?[sampleAccount]:[],
  listVerifiedPlatformPeers:async()=>[samplePeer]
 });
 return {ids,bridge,principal,setNative:x=>nativeAlive=x,setOnline:x=>upstreamOnline=x};
}
test('W24 refuses legacy RAM or missing native upstream callbacks',()=>{
 assert.throws(()=>createW24NativeOwnerReadPorts(),/W24_STRICT_AND_NATIVE_OWNER_READ_PORTS_REQUIRED/);
 assert.throws(()=>createW24NativeOwnerReadPorts({identityConsent:new IdentityConsentService(),
  resolveNativePrincipal:async()=>principal,listVerifiedPlatformAccounts:async()=>[],
  listVerifiedPlatformPeers:async()=>[]}),/W24_STRICT_AND_NATIVE_OWNER_READ_PORTS_REQUIRED/);
});
test('W24 exact W47 read callback shape from current durable K, never canSend',async t=>{
 const f=fixture(t),ports=f.bridge();
 const accounts=await ports.readW24AuthorizedAccounts({principal,session});
 const contacts=await ports.readW24VerifiedContacts({principal,session,accounts});
 assert.equal(accounts.length,1);assert.equal(accounts[0].authorization,'ONLINE_VERIFIED');
 assert.equal(contacts.length,1);assert.equal(contacts[0].w24CurrentKVerified,true);
 assert.equal(contacts[0].w24ConsentCurrent,true);
});
test('existing W47 original GET /contacts accepts authoritative owner read ports but reports canSend=false',async t=>{
 const f=fixture(t),ports=f.bridge();
 const handler=createNativeOwnerReadHttp({
  sessionAuthority:{sessionFor:()=>session},webOrigin:'http://127.0.0.1:49001',
  resolveW54CurrentUser:async()=>principal,...ports
 });
 let status,body;
 const res={writeHead:(s)=>{status=s},end:v=>{body=JSON.parse(v)}};
 const used=await handler({method:'GET',headers:{}},res,
  {pathname:'/api/v2/contacts'});
 assert.equal(used,true);assert.equal(status,200);
 assert.equal(body.source,'W24_CURRENT_K_AND_NATIVE_CHANNEL_OWNERS');
 assert.equal(body.contacts.length,1);assert.equal(body.canSend,false);
 assert.equal('original' in body.contacts[0],false);
});
test('native session revoke, platform disconnect and W24 account revocation never show authorized peer',async t=>{
 const f=fixture(t),p=f.bridge();
 f.setNative(false);
 await assert.rejects(p.readW24AuthorizedAccounts({principal,session}),/NATIVE_PRINCIPAL_REVOKED_OR_UNVERIFIED/);
 f.setNative(true);f.setOnline(false);
 const noAccount=await p.readW24AuthorizedAccounts({principal,session});
 assert.equal(noAccount.length,0);
 f.setOnline(true);
 const accounts=await p.readW24AuthorizedAccounts({principal,session});
 assert.equal(f.ids.invalidateAccount(act,{...k,expected_revision:1}).status,'COMMITTED');
 await assert.rejects(p.readW24VerifiedContacts({principal,session,accounts}));
});
test('provider-spoofed peer or account cannot substitute W24 durable K',async t=>{
 const f=fixture(t);
 const p=createW24NativeOwnerReadPorts({
  identityConsent:f.ids,resolveNativePrincipal:async()=>principal,
  listVerifiedPlatformAccounts:async()=>[sampleAccount],
  listVerifiedPlatformPeers:async()=>[{...samplePeer,accountRef:'anotheraccount'}]
 });
 const a=await p.readW24AuthorizedAccounts({principal,session});
 await assert.rejects(p.readW24VerifiedContacts({principal,session,accounts:a}),/PEER_NATIVE_BINDING_NOT_VERIFIED/);
});
