import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {IdentityConsentService} from './identity-consent.mjs';
import {createW24DurableProofVerifier} from './durable-identity.mjs';
import {createW24NativeOwnerReadPorts} from './native-owner-reads.mjs';
const w44root=process.env.YANCE_W44_ROOT||process.env.YANCE_PR32_ROOT;
const w47root=process.env.YANCE_W47_ROOT||process.env.YANCE_PR32_ROOT;
if(!w44root||!w47root)throw Error('OWNER_REAL_SOURCE_PATHS_REQUIRED');
const w47File=resolve(w47root,'services/api/runtime/native-authoritative-reads.mjs');
const [{openEligibilityStore},w47Owner]=await Promise.all([
 import(pathToFileURL(resolve(w44root,'services/api/src/domains/grant-custody-budget/index.mjs')).href),
 existsSync(w47File)?import(pathToFileURL(w47File).href):Promise.resolve(null)
]);
const createNativeOwnerReadHttp=w47Owner?.createNativeOwnerReadHttp??null;
const principal=Object.freeze({verified:true,source:'W54_NATIVE_CURRENT_USER',
 principalRef:'fake-owner-1',installationRef:'fake-install-1',revocationGeneration:1});
const session={id:'session-fixture',record:{rev:1}};
const k={tenant:'SYNTHETIC_TEST_ONLY',account:'fixture-channel-1',
 channel:'TELEGRAM_PERSONAL',peer_id:'fake-peer-A',binding_revision:1};
const act={tenant:k.tenant,principal_id:principal.principalRef,input_domain:'CONTACT'};
const sampleAccount={platformAuthorizationVerified:true,nativeSessionCurrent:true,
 channelAccountBindingCurrent:true,authorization:'ONLINE_VERIFIED',
 accountRef:'accountref_001',channel:k.channel,ownerPrincipalRef:principal.principalRef,
 tenant:k.tenant,accountId:k.account,accountAnchorPeerId:k.peer_id,
 bindingRevision:k.binding_revision};
const samplePeer={platformPeerVerified:true,nativeSessionCurrent:true,
 channelAccountBindingCurrent:true,accountRef:sampleAccount.accountRef,
 channel:k.channel,peerRef:k.peer_id,bindingRevision:k.binding_revision,
 tenant:k.tenant,accountId:k.account,displayName:'Sample Peer',
 ownerPrincipalRef:principal.principalRef};
const proofAuthority={evaluate:({proof_ref})=>({approved:proof_ref?.startsWith('fake-verified-')})};
function fixture(t,{register=true,second=false}={}){
 const dir=mkdtempSync(join(tmpdir(),'w24-w47-owner-reads-'));
 const store=openEligibilityStore({path:join(dir,'w44.sqlite'),requireDurableIdentity:true,
  authorizeMutation:({actor})=>actor===principal.principalRef,
  verifyOwnerMutation:createW24DurableProofVerifier({proofAuthority,
   authorizeOperator:({actor})=>actor===principal.principalRef})});
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true})});
 const ids=new IdentityConsentService({requireDurableIdentity:true,
  durableAuthority:store,proofAuthority});
 if(register){
  assert.equal(ids.registerAccount(act,{...k,principal_id:principal.principalRef,
   binding_proof_ref:'fake-verified-channel'}).status,'COMMITTED');
  assert.equal(ids.bindPeer(act,{...k,peer_proof_ref:'fake-verified-peer'}).status,'COMMITTED');
 }
 const kB={...k,account:'fixture-channel-2'};
 const secondAccount={...sampleAccount,accountRef:'accountref_002',accountId:kB.account};
 const secondPeer={...samplePeer,accountRef:'accountref_002',accountId:kB.account};
 if(second){
  assert.equal(ids.registerAccount(act,{...kB,principal_id:principal.principalRef,
   binding_proof_ref:'fake-verified-channel-B'}).status,'COMMITTED');
  assert.equal(ids.bindPeer(act,{...kB,peer_proof_ref:'fake-verified-peer-B'}).status,'COMMITTED');
 }
 const accounts=second?[sampleAccount,secondAccount]:[sampleAccount];
 let nativeAlive=true,upstreamOnline=true,onPeerRead=null;
 const readNative=async()=>nativeAlive?principal:{...principal,revocationGeneration:2};
 const bridge=()=>createW24NativeOwnerReadPorts({
  identityConsent:ids,resolveNativePrincipal:readNative,
  listVerifiedPlatformAccounts:async()=>upstreamOnline?accounts:[],
  listVerifiedPlatformPeers:async({account})=>{
   onPeerRead?.();
   return [account.accountRef===sampleAccount.accountRef?samplePeer:secondPeer];
  },
  readW44IdentityAuthority:({actor,identity})=>store.readIdentityAuthority({actor,identity})
 });
 return {ids,store,bridge,principal,removeAccount:x=>{
   const i=accounts.findIndex(a=>a.accountRef===x);if(i>=0)accounts.splice(i,1);
  },setNative:x=>nativeAlive=x,setOnline:x=>upstreamOnline=x,
  onPeerRead:fn=>onPeerRead=fn};
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
test('W24 W47 callback contract; actual W47 GET is exercised when joined source is available',async t=>{
 const f=fixture(t),ports=f.bridge();
 if(!createNativeOwnerReadHttp) {
  // PR32 CI's exact sibling SHA predates W47's native GET adapter. Test W24's
  // public owner-reader contract without inventing a W47 implementation.
  const accounts=await ports.readW24AuthorizedAccounts({principal,session});
  const contacts=await ports.readW24VerifiedContacts({principal,session,accounts});
  assert.equal(contacts[0].w24CurrentKVerified,true);
  assert.equal(contacts[0].w24ConsentCurrent,true);
  return;
 }
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
  listVerifiedPlatformPeers:async()=>[{...samplePeer,accountRef:'anotheraccount'}],
  readW44IdentityAuthority:({actor,identity})=>f.store.readIdentityAuthority({actor,identity})
 });
 const a=await p.readW24AuthorizedAccounts({principal,session});
 await assert.rejects(p.readW24VerifiedContacts({principal,session,accounts:a}),/PEER_NATIVE_BINDING_NOT_VERIFIED/);
});

test('official SDK ONLINE without original W44 account registration cannot show account',async t=>{
 const f=fixture(t,{register:false});
 const p=f.bridge();
 await assert.rejects(p.readW24AuthorizedAccounts({principal,session}),
  /W24_ACCOUNT_NOT_REGISTERED_OR_REVOKED/);
});
test('two accounts on SAME platform each retain own identical peer locator and K',async t=>{
 const f=fixture(t,{second:true}),p=f.bridge();
 const a=await p.readW24AuthorizedAccounts({principal,session});
 const peers=await p.readW24VerifiedContacts({principal,session,accounts:a});
 assert.equal(a.length,2);assert.equal(peers.length,2);
 assert.equal(peers[0].peerRef,peers[1].peerRef);
 assert.notEqual(peers[0].accountRef,peers[1].accountRef);
 assert.equal(a[0].bindingRevision,1);assert.equal(a[1].bindingRevision,1);
 assert.equal(f.ids.invalidateAccount(act,{...k,expected_revision:1}).status,'COMMITTED');
 f.removeAccount('accountref_001');
 const remaining=await p.readW24AuthorizedAccounts({principal,session});
 const stillBound=await p.readW24VerifiedContacts({principal,session,accounts:remaining});
 assert.equal(stillBound.length,1);
 assert.equal(stillBound[0].accountRef,'accountref_002');
});

test('SDK disconnect DURING contacts enumeration cannot leave stale ONLINE response',async t=>{
 const f=fixture(t),p=f.bridge();
 const accounts=await p.readW24AuthorizedAccounts({principal,session});
 f.onPeerRead(()=>f.setOnline(false));
 await assert.rejects(p.readW24VerifiedContacts({principal,session,accounts}),
  /NATIVE_ACCOUNT_SWITCH_DURING_CONTACT_READ/);
});
