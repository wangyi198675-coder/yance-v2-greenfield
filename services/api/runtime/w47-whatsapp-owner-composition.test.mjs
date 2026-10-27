import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createW47WhatsAppOwnerComposition} from './w47-whatsapp-owner-composition.mjs';
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
