import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import actualMakeWASocket, {DisconnectReason, normalizeMessageContent, jidNormalizedUser} from 'baileys';
import {createNativeBaileysWorker,NATIVE_BAILEYS} from './native-worker.mjs';

const require=createRequire(import.meta.url);
const pkg=require('./package.json');
const lock=require('./package-lock.json');
test('ACTUAL installed unmodified upstream SDK and exact dependency lock (NO SOCKET)',()=>{
  assert.equal(typeof actualMakeWASocket,'function');
  assert.equal(typeof normalizeMessageContent,'function');
  assert.equal(typeof jidNormalizedUser,'function');
  assert.equal(typeof DisconnectReason.loggedOut,'number');
  assert.equal(pkg.dependencies.baileys,'7.0.0-rc14');
  assert.equal(lock.packages['node_modules/baileys'].version,'7.0.0-rc14');
  assert.equal(lock.packages['node_modules/baileys'].integrity,
    'sha512-pewtrljhWx5JTUBvvkXZz1fL3JPiwzjBsnhx/DWf2LWBx1cZNH7J/sF22xDehba5mySWUQU4a1Pwt7lWARUxaA==');
  assert.equal(NATIVE_BAILEYS.version,'7.0.0-rc14');
});
const fakePermit=()=>({authorized:true,userConsented:true,platformPermitted:true,principalVerified:true,
  accountVerified:true,accountId:'account-abc',tenantId:'TEST',bindingRevision:7,accountRevocationEpoch:3,restoreApproved:false});
function testSystem({permit=fakePermit(),authorized=true,storeOk=true}={}){
  const ev=new EventEmitter(),receives=[],receipts=[],qrs=[],states=[],observedCalls=[];
  const fakeSock={ev,user:{id:'555100@s.whatsapp.net',lid:'abcd@lid'},end:()=>{},ws:{close:()=>{}}};
  let sockets=0, revoked=0, saves=0, checks=0;
  const worker=createNativeBaileysWorker({
    authorization:{authorizeStart:async()=>authorized?permit:null,assertCurrent:async()=>{checks++;return authorized;}},
    authStore:{open:async()=>storeOk?{state:{creds:{me:{}},keys:{get:async()=>({}),set:async()=>{}}},
      saveCreds:async()=>{saves++}}:null,revoke:async()=>{revoked++}},
    identity:{
      resolveAccount:async()=>({tenant:'TEST',account:'account-abc',channel:'WHATSAPP_PERSONAL',binding_revision:7}),
      resolvePeer:async({remoteJid})=>({bound:remoteJid==='555200@s.whatsapp.net',peer_id:'peer-xyz'}),
    },
    inbound:{acceptInbound:async x=>{receives.push(x);return {accepted:true}},
      recordReceipt:async x=>{receipts.push(x);return {accepted:true}}},
    observed:{onQr:async q=>{qrs.push(q)},onState:async s=>{states.push(s)}},
    sdk:{makeWASocket:()=>{sockets++;return fakeSock},logger:{info:()=>{},error:()=>{}}},
  });
  return {worker,ev,receives,receipts,qrs,states,observedCalls,sockets:()=>sockets,
    revoked:()=>revoked,saves:()=>saves,checks:()=>checks};
}
const tick=()=>new Promise(r=>setTimeout(r,25));
test('no implicit Socket/start/QR when waiting: denied untrusted attempts fail closed',async()=>{
  const f=testSystem();
  assert.equal(f.worker.getStatus().state,'WAITING_USER_AUTH');
  assert.equal(f.sockets(),0);
  await assert.rejects(f.worker.start({accountLocator:'acc'}),/EXPLICIT_USER_ACTION_REQUIRED/);
  assert.equal(f.sockets(),0);
  await assert.rejects(testSystem({authorized:false}).worker.start({userAction:'PAIR_OWN_ACCOUNT',accountLocator:'acc'}),/PLATFORM_OR_USER_AUTH_HOLD/);
  await assert.rejects(testSystem({storeOk:false}).worker.start({userAction:'PAIR_OWN_ACCOUNT',accountLocator:'acc'}),/W55_PERSISTENT_SIGNAL_AUTH_REQUIRED/);
  await assert.rejects(f.worker.start({userAction:'RESUME_EXPLICITLY_APPROVED',accountLocator:'acc'}),/RESTORE_NOT_AUTHORIZED/);
  assert.equal(f.sockets(),0);
});
test('native factory only invoked by injected trusted authorization + secure state',async()=>{
  const f=testSystem();
  const v=await f.worker.start({userAction:'PAIR_OWN_ACCOUNT',accountLocator:'acc'});
  assert.equal(v.nativeSocketCreated,true);
  assert.equal(f.sockets(),1);
  assert.equal(v.connected,false);
  assert.equal(v.canSend,false);
  await assert.rejects(f.worker.start({userAction:'PAIR_OWN_ACCOUNT',accountLocator:'acc'}),/WORKER_ALREADY_STARTED/);
  await f.worker.stop();assert.equal(f.worker.getStatus().state,'WAITING_USER_AUTH');
});
test('upstream QR event only forwards ephemeral bearer secret to approved native UI port',async()=>{
  const f=testSystem();
  await f.worker.start({userAction:'PAIR_OWN_ACCOUNT',accountLocator:'acc'});
  f.ev.emit('connection.update',{qr:'SIMULATED_QR_DO_NOT_SCAN'});
  await tick();
  assert.equal(f.worker.getStatus().state,'WAITING_QR_SCAN');
  assert.equal(f.qrs.length,1);
  assert.equal(f.qrs[0].rawQr,'SIMULATED_QR_DO_NOT_SCAN');
  assert.equal(JSON.stringify(f.worker.getStatus()).includes('SIMULATED_QR'),false);
  await f.worker.revoke();
  assert.equal(f.revoked(),1);
  assert.equal(f.worker.getStatus().state,'REVOKED');
});
test('actual-shaped SDK connection/open, inbound MID, peer-map + native raw receipt through Owner ports',async()=>{
  const f=testSystem();
  await f.worker.start({userAction:'PAIR_OWN_ACCOUNT',accountLocator:'acc'});
  f.ev.emit('connection.update',{connection:'open'});
  await tick();
  assert.equal(f.worker.getStatus().state,'ONLINE');
  assert.equal(f.worker.getStatus().connected,true);
  f.ev.emit('contacts.upsert',[{id:'555200@s.whatsapp.net'}]);
  f.ev.emit('messages.upsert',{type:'notify',messages:[{key:{id:'ABCDEF-REAL-SHAPED',remoteJid:'555200@s.whatsapp.net',fromMe:false},
    message:{conversation:'Cześć'}}]});
  f.ev.emit('messages.update',[{key:{id:'SENT-ABC',remoteJid:'555200@s.whatsapp.net',fromMe:true},update:{status:3}}]);
  await tick();
  assert.equal(f.receives.length,1);
  assert.equal(f.receives[0].provider,'BAILEYS_NATIVE');
  assert.equal(f.receives[0].providerMid,'ABCDEF-REAL-SHAPED');
  assert.equal(f.receives[0].original,'Cześć');
  assert.equal(f.receives[0].k.peer_id,'peer-xyz');
  assert.equal(f.receipts.length,1);
  assert.equal(f.receipts[0].nativeStatus,3);
  assert.equal(f.receipts[0].settlement,'W25_DECIDES_NOT_THIS_ADAPTER');
  assert.equal('sendMessage' in f.worker,false);
  assert.equal(f.worker.getStatus().canSend,false);
});
test('unknown peer is not allowed to mint contact or inbound K',async()=>{
  const f=testSystem();await f.worker.start({userAction:'PAIR_OWN_ACCOUNT',accountLocator:'acc'});
  f.ev.emit('connection.update',{connection:'open'});await tick();
  f.ev.emit('messages.upsert',{messages:[{key:{id:'m',remoteJid:'other@s.whatsapp.net',fromMe:false},message:{conversation:'bad'}}]});
  await tick();assert.equal(f.receives.length,0);
});
test('credentials update routed to injected secure Owner, not plaintext files',async()=>{
  const f=testSystem();await f.worker.start({userAction:'PAIR_OWN_ACCOUNT',accountLocator:'acc'});
  f.ev.emit('creds.update',{me:{id:'fake'}});await tick();
  assert.equal(f.saves(),1);
  await f.worker.revoke();
  assert.equal(f.revoked(),1);
});
test('logout causes vault revoke and never auto reconnect',async()=>{
  const f=testSystem();await f.worker.start({userAction:'PAIR_OWN_ACCOUNT',accountLocator:'acc'});
  f.ev.emit('connection.update',{connection:'close',lastDisconnect:{error:{output:{statusCode:DisconnectReason.loggedOut}}}});
  await tick();
  assert.equal(f.revoked(),1);assert.equal(f.sockets(),1);
  assert.equal(f.worker.getStatus().connected,false);
});
test('stop fences queued events, never auto restores deleted session',async()=>{
  const f=testSystem();await f.worker.start({userAction:'PAIR_OWN_ACCOUNT',accountLocator:'acc'});
  f.ev.emit('connection.update',{connection:'open'});await tick();
  await f.worker.stop();
  f.ev.emit('messages.upsert',{messages:[{key:{id:'late',remoteJid:'555200@s.whatsapp.net',fromMe:false},
    message:{conversation:'late'}}]});
  await tick();assert.equal(f.receives.length,0);
  assert.equal(f.worker.getStatus().connected,false);
});
