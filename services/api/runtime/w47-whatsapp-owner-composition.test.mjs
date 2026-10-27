import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createW47WhatsAppOwnerComposition,createW47WhatsAppW25ReadBridge} from './w47-whatsapp-owner-composition.mjs';
const scope={installationRef:'w54-verified',principalRef:'w54-user-owner',
 tenantId:'tenant1',accountId:'current-wa-1',bindingRevision:1,accountRevocationEpoch:0};
test('W47 cannot claim WhatsApp login without actual original W54+W24+W25+W55 ports',async()=>{
 assert.equal(await createW47WhatsAppOwnerComposition({}),null);
 assert.equal(await createW47WhatsAppOwnerComposition({
  w54:{verifyNativeSession:async()=>true},w24:{},w25:{},w55Executable:'Z:\\not-authorized.exe'
 }),null);
});
test('real original W28 controller installed on existing W47 listener is fail-closed before the user initiates pairing', {
 skip:!process.env.W55_SIGNAL_EXE
},async()=>{
 const signedSession={native:true};
 const handler=await createW47WhatsAppOwnerComposition({
  w55Executable:process.env.W55_SIGNAL_EXE,
  w54:{
   verifyNativeSession:async({nativeSession})=>nativeSession===signedSession?
    {verified:true,kind:'NATIVE_FIRST_PARTY',principalRef:'current-user',
     installationRef:'current-install',sessionRef:'native-private-session',
     revocationGeneration:0}:null,
   resolveSignedNativeSession:async({request})=>request.headers['x-test-current']==='yes'?
    {nativeSession:signedSession,originVerified:true,csrfVerified:true,rendererVerified:true}:null,
  },
  w24:{
   authorizeStart:async()=>{throw Error('USER_MUST_APPROVE_REAL_PLATFORM_FIRST')},
   assertCurrent:async()=>false,
   resolveTrustedScope:async()=>scope,
   assertSignalCurrent:async()=>false,
   revokeApprovedAccount:async()=>({revoked:false}),
   identity:{
    resolveAccount:async()=>null,resolvePeer:async()=>null,
    bindObservedPeer:async()=>null,recordVerifiedPeer:async()=>null,
   },
  },
  w25:{
   acceptInbound:async()=>({}),recordReceipt:async()=>({}),
   acceptHistory:async()=>({}),
  },
 });
 assert.equal(typeof handler,'function');
 const srv=createServer((req,res)=>handler(req,res,new URL(req.url,'http://127.0.0.1')));
 await new Promise(r=>srv.listen(0,'127.0.0.1',r));
 try{
  const url='http://127.0.0.1:'+srv.address().port+'/api/v2/providers/whatsapp-personal/native/status';
  const denied=await fetch(url);
  assert.equal(denied.status,401);
  const valid=await fetch(url,{headers:{'x-test-current':'yes'}});
  assert.equal(valid.status,200);
  const data=await valid.json();
  assert.equal(data.state,'WAITING_USER_AUTH');
  assert.equal(data.connected,false);
  assert.equal(data.canSend,false);
 }finally{await new Promise(r=>srv.close(r))}
});

test('W47 uses W25 ORIGINAL listHistory with current real K, never a second SQLite or Agno shadow history',async()=>{
 const k={tenant:'owner-tenant',account:'wa-current',channel:'WHATSAPP_PERSONAL',peer_id:'peer-1',binding_revision:1};
 const native={principalRef:'native-current'};
 let calls=0;
 const source={listHistory:async({k:originalK,nativePrincipalId,limit})=>{
  calls++;
  assert.equal(nativePrincipalId,'native-current');
  assert.equal(limit,250);
  assert.equal(originalK.bindingRevision,'1');
  return [{k:originalK,id:'x',providerMid:'mid-1',source:'baileys',
   original:'user sent previously',fromMe:true,isHistory:true,direction:'OUTBOUND'}];
 }};
 const originalAuthority=async()=>({verified:true,principalId:'native-current',
  tenant:k.tenant,account:k.account,channel:k.channel,peerId:k.peer_id,
  bindingRevision:1,accountEpoch:0,consentEpoch:1,connectionEpoch:1});
 const bridge=createW47WhatsAppW25ReadBridge({w25:source,resolveLiveW24Principal:originalAuthority});
 const rows=await bridge({native,k,session:{},max:250});
 assert.equal(calls,1);
 assert.equal(rows[0].fromMe,true);
 assert.equal(rows[0].direction,'OUTBOUND');
});
test('W47 W25 history seam refuses foreign accounts, fake principal, and stale consent epoch',async()=>{
 const k={tenant:'owner-tenant',account:'wa-current',channel:'WHATSAPP_PERSONAL',
  peer_id:'peer-1',binding_revision:1};
 let reads=0;
 const readPort={listHistory:async({k:originalK})=>{reads++;return [{
  k:{...originalK,accountId:'foreign-account'},id:'x'
 }]}};
 const verifier=async()=>({verified:true,principalId:'real-current',
  tenant:k.tenant,account:k.account,channel:k.channel,peerId:k.peer_id,
  bindingRevision:1,accountEpoch:0,consentEpoch:1,connectionEpoch:1});
 const bridge=createW47WhatsAppW25ReadBridge({w25:readPort,resolveLiveW24Principal:verifier});
 await assert.rejects(bridge({native:{principalRef:'real-current'},k}),/W47_WA_W25_HISTORY_SCOPE_INVALID/);
 const unauth=createW47WhatsAppW25ReadBridge({w25:readPort,
  resolveLiveW24Principal:async()=>({...await verifier(),principalId:'someone-else'})});
 await assert.rejects(unauth({native:{principalRef:'real-current'},k}),/W47_WA_LIVE_PRINCIPAL_REQUIRED/);
 assert.equal(reads,1);
 let check=0;
 const changed=createW47WhatsAppW25ReadBridge({w25:{listHistory:async()=>[]},
  resolveLiveW24Principal:async()=>({...await verifier(),consentEpoch:++check})});
 await assert.rejects(changed({native:{principalRef:'real-current'},k}),/W47_WA_W24_EPOCH_CHANGED_DURING_READ/);
});
