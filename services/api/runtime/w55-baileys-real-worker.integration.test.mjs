import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createNativeBaileysWorker} from '../../../connectors/baileys/native-worker.mjs';
import {createW55BaileysDpapiAuthStore} from './w55-baileys-dpapi-stdio.mjs';

test('ACTUAL W28 Worker + W55 DPAPI: creds update, restart, reconnect, revoke (offline)',{
 skip:!process.env.W55_SIGNAL_EXE,
},async()=>{
 const root=mkdtempSync(join(tmpdir(),'w55-wa-qa-'));
 const binding={accountId:'fake-pair-001',tenantId:'fake-user-local',
  channel:'WHATSAPP_PERSONAL',bindingRevision:1,
  accountRevocationEpoch:0,
  authorized:true,userConsented:true,platformPermitted:true,principalVerified:true,
  accountVerified:true,enrollmentApproved:true,restoreApproved:true,
  contactReadApproved:false,historyReadApproved:false,avatarReadApproved:false,
  revisionRevoked:false};
 let sdkAuth=null,latestEvents=null,originalSockets=0,revokeCalls=0;
 const authStore=createW55BaileysDpapiAuthStore({
  executable:process.env.W55_SIGNAL_EXE,
  qaEnv:{YANCE_W55_SIGNAL_QA_DIR:root},
  assertCurrent:async()=>true,
  resolveTrustedScope:async()=>({
   installationRef:'w54-signed-install-current',
   principalRef:'w54-current-user',
   tenantId:binding.tenantId,accountId:binding.accountId,
   bindingRevision:binding.bindingRevision,
   accountRevocationEpoch:binding.accountRevocationEpoch,
  }),
 });
 const sdk={
  logger:{info(){}},
  makeWASocket:options=>{
   assert.equal(options.syncFullHistory,false);
   assert.ok(options.auth?.creds?.registrationId);
   sdkAuth=options.auth;
   originalSockets++;
   latestEvents=new EventEmitter();
   return {ev:latestEvents,end(){}};
  }
 };
 const setup=()=>createNativeBaileysWorker({
  authorization:{
   authorizeStart:async()=>({...binding}),
   assertCurrent:async()=>true,
  },
  authStore,
  identity:{resolveAccount:async()=>null,resolvePeer:async()=>null},
  inbound:{acceptInbound:async()=>({}),recordReceipt:async()=>({})},
  sdk,
 });
 try {
  let a=setup();
  const first=await a.start({userAction:'PAIR_OWN_ACCOUNT',accountLocator:'current-own-whatsapp'});
  assert.equal(first.nativeSocketCreated,true);
  sdkAuth.creds.registered=true;
  const sockKey=Buffer.from('mock-provider-signal-key-private').toString('base64');
  await sdkAuth.keys.set({'session':{'112233@s.whatsapp.net':{privatePayload:sockKey}}});
  // Native Baileys mutates the original creds before creds.update; W28
  // persists them through the ORIGINAL W55 DPAPI port, without a fake writer.
  latestEvents.emit('creds.update',{registered:true});
  await new Promise(resolve=>setTimeout(resolve,220));
  assert.notEqual(a.getStatus().lastError,'SECURE_AUTH_PERSIST_FAILED');
  await a.stop();
  a=setup();
  const restarted=await a.start({
   userAction:'RESUME_EXPLICITLY_APPROVED',accountLocator:'current-own-whatsapp'});
  assert.equal(restarted.nativeSocketCreated,true);
  assert.equal(sdkAuth.creds.registered,true);
  const keys=await sdkAuth.keys.get('session',['112233@s.whatsapp.net']);
  assert.equal(keys['112233@s.whatsapp.net'].privatePayload,sockKey);
  assert.equal(originalSockets,2);
  const revoked=await a.revoke();
  assert.equal(revoked.state,'REVOKED');
  revokeCalls++;
  await assert.rejects(authStore.open({binding,userAction:'RESUME_EXPLICITLY_APPROVED'}),
   /W55_SIGNAL_ACCOUNT_REVOKED/);
  assert.equal(revokeCalls,1);
 }finally{rmSync(root,{recursive:true,force:true})}
});
