import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createNativeBaileysWorker} from './native-worker.mjs';

const tick=()=>new Promise(r=>setTimeout(r,75));
const permit=()=>({
  authorized:true,userConsented:true,platformPermitted:true,principalVerified:true,
  accountVerified:true,accountId:'test-account',tenantId:'test-tenant',
  bindingRevision:12,accountRevocationEpoch:4,historyReadApproved:true,
  contactReadApproved:true,avatarReadApproved:true,
});
function scenario({grant=permit(),accept=true,profileUrl='https://pps.whatsapp.net/pic'}={}){
  const ev=new EventEmitter(),history=[],contacts=[],avatars=[],calls=[];
  let valid=true;
  const sock={ev,user:{id:'555100@s.whatsapp.net',lid:'11111@lid'},
    profilePictureUrl:async(jid,type,timeout)=>{avatars.push({jid,type,timeout});return profileUrl},
    end:()=>{},ws:{close:()=>{}}};
  const worker=createNativeBaileysWorker({
    authorization:{authorizeStart:async()=>grant,assertCurrent:async()=>valid},
    authStore:{open:async()=>({state:{creds:{me:{}},keys:{get:async()=>({}),set:async()=>{}}},
      saveCreds:async()=>{}}),revoke:async()=>{}},
    identity:{
      resolveAccount:async()=>({tenant:'test-tenant',account:'test-account',
        channel:'WHATSAPP_PERSONAL',binding_revision:12}),
      resolvePeer:async({remoteJid})=>({bound:remoteJid==='555200@s.whatsapp.net',
        peer_id:'peer-test'}),
      bindObservedPeer:async({remoteJid})=>({bound:remoteJid==='555200@s.whatsapp.net',peer_id:'peer-test'}),
      recordVerifiedPeer:async x=>{contacts.push(x);return {persisted:true}},
    },
    inbound:{
      acceptInbound:async()=>({accepted:true}),
      acceptHistory:async x=>{history.push(x);return accept?{persisted:true}:{persisted:false}},
      recordReceipt:async()=>({accepted:true}),
    },
    sdk:{makeWASocket:params=>{calls.push(params);return sock},logger:{info(){}}},
  });
  return {worker,ev,history,contacts,avatars,calls,revokePermission:()=>{valid=false}};
}
async function signedOnline(f){
  await f.worker.start({userAction:'PAIR_OWN_ACCOUNT',accountLocator:'approved-w24-account'});
  f.ev.emit('connection.update',{connection:'open'});
  await tick();
  assert.equal(f.worker.getStatus().state,'ONLINE');
}
const msg=(mid,fromMe,remote='555200@s.whatsapp.net')=>({
  key:{id:mid,remoteJid:remote,fromMe},
  message:{conversation:'content-'+mid},
  messageTimestamp:1750001234,
});
const historyPacket=()=>({
  contacts:[{id:'555200@s.whatsapp.net',name:'Authorized peer'}],
  chats:[{id:'555200@s.whatsapp.net'}],
  messages:[msg('MID-OLD-IN',false),msg('MID-OLD-OUT',true)],
  chunkOrder:3,syncType:1,isLatest:true,
});

test('real SDK-shaped history sync persists both inbound and fromMe via W25 original Owner port',async()=>{
  const f=scenario();await signedOnline(f);
  assert.equal(f.calls[0].syncFullHistory,true);
  f.ev.emit('messaging-history.set',historyPacket());
  await tick();
  assert.equal(f.history.length,2);
  assert.deepEqual(f.history.map(x=>[x.providerMid,x.direction]),
    [['MID-OLD-IN','INBOUND'],['MID-OLD-OUT','OUTBOUND']]);
  assert.equal(f.history[0].k.peer_id,'peer-test');
  assert.equal(f.history[0].k.binding_revision,12);
  assert.equal(f.history[0].timestampSec,1750001234);
  assert.equal(f.history[0].chunkOrder,3);
  assert.equal(f.history[0].syncType,1);
  assert.equal(f.history[1].canSend,false);
  assert.ok(f.contacts.length>=1);
  assert.equal(f.worker.getStatus().historyMessageCount,2);
  assert.equal(f.worker.getStatus().historyState,'LATEST_CHUNK_IMPORTED');
  f.ev.emit('messaging-history.status',{syncType:1,status:'complete'});
  await tick();assert.equal(f.worker.getStatus().historyState,'PROVIDER_SYNC_REPORTED_COMPLETE');
});
test('historical events before W24 account identity open are deferred and NOT silently dropped',async()=>{
  const f=scenario();
  await f.worker.start({userAction:'PAIR_OWN_ACCOUNT',accountLocator:'my-account'});
  f.ev.emit('messaging-history.set',historyPacket());
  assert.equal(f.history.length,0);
  f.ev.emit('connection.update',{connection:'open'});
  await tick();
  assert.equal(f.history.length,2);
});
test('unknown/unsupported peers and status/group data never import private history',async()=>{
  const f=scenario();await signedOnline(f);
  f.ev.emit('messaging-history.set',{contacts:[],chats:[],messages:[
    msg('wrong-peer',false,'unknown@s.whatsapp.net'),
    msg('group',true,'123@g.us'),msg('status',false,'status@broadcast'),
    {key:{id:'no-content',remoteJid:'555200@s.whatsapp.net',fromMe:false}},
  ]});
  await tick();assert.equal(f.history.length,0);
});
test('no historical read grant means no history import and no provider full sync request',async()=>{
  const f=scenario({grant:{...permit(),historyReadApproved:false,contactReadApproved:false,
    avatarReadApproved:false}});
  await signedOnline(f);
  assert.equal(f.calls[0].syncFullHistory,false);
  f.ev.emit('messaging-history.set',historyPacket());
  await tick();assert.equal(f.history.length,0);
  assert.equal(f.worker.getStatus().historyState,'NOT_AUTHORIZED');
  await assert.rejects(f.worker.readAvatar({remoteJid:'555200@s.whatsapp.net'}),
    /AVATAR_WAITING_USER_AUTH/);
});
test('W25 history port missing or failing must not be called successful history restore',async()=>{
  const f=scenario({accept:false});await signedOnline(f);
  f.ev.emit('messaging-history.set',historyPacket());
  await tick();
  assert.equal(f.history.length,1);
  assert.equal(f.worker.getStatus().historyMessageCount,0);
  assert.equal(f.worker.getStatus().historyState,'HOLD_W25_HISTORY_IMPORT');
  assert.equal(f.worker.getStatus().lastError,'W25_HISTORY_NOT_PERSISTED');
});
test('official native Baileys avatar only for current W24 bound Peer, with revocation fence',async()=>{
  const f=scenario();await signedOnline(f);
  const a=await f.worker.readAvatar({remoteJid:'555200@s.whatsapp.net'});
  assert.equal(a.available,true);
  assert.equal(a.source,'BAILEYS_NATIVE_PROFILE_PICTURE');
  assert.equal(a.peerId,'peer-test');
  assert.equal(a.bindingRevision,12);
  assert.equal(a.imageUrl,'https://pps.whatsapp.net/pic');
  assert.equal(f.avatars[0].type,'preview');
  assert.equal(f.avatars[0].timeout,5000);
  assert.equal(a.canSend,false);
  await assert.rejects(f.worker.readAvatar({remoteJid:'123@g.us'}),/AVATAR_PEER_SELECTOR_INVALID/);
  await assert.rejects(f.worker.readAvatar({remoteJid:'555300@s.whatsapp.net'}),
    /W24_AVATAR_PEER_NOT_BOUND/);
  f.revokePermission();
  await assert.rejects(f.worker.readAvatar({remoteJid:'555200@s.whatsapp.net'}),
    /AUTHORIZATION_REVOKED_OR_STALE/);
});
test('official avatar CDN is HTTPS and restricted, W28 refuses injected arbitrary hosts',async()=>{
  const f=scenario({profileUrl:'https://evil.example/collect'});
  await signedOnline(f);
  await assert.rejects(f.worker.readAvatar({remoteJid:'555200@s.whatsapp.net'}),
    /SDK_AVATAR_HOST_UNTRUSTED/);
});
test('no W25 history port: fail before socket creation, not a false online or lost history',async()=>{
  let socketCount=0;
  const f=scenario();
  const w=createNativeBaileysWorker({
    authorization:{authorizeStart:async()=>permit(),assertCurrent:async()=>true},
    authStore:{open:async()=>{throw Error('UNEXPECTED_VAULT_OPEN')},revoke:async()=>{}},
    identity:{resolveAccount:async()=>null,resolvePeer:async()=>null,recordVerifiedPeer:async()=>({persisted:true})},
    inbound:{acceptInbound:async()=>({accepted:true}),recordReceipt:async()=>({accepted:true})},
    sdk:{makeWASocket:()=>{socketCount++;return {}},logger:{info(){}}},
  });
  await assert.rejects(w.start({userAction:'PAIR_OWN_ACCOUNT',accountLocator:'acc'}),
    /W25_HISTORY_IMPORT_PORT_REQUIRED/);
  assert.equal(socketCount,0);
  assert.equal(w.getStatus().connected,false);
});

test('early native history overflow remains visible as HOLD despite later successful chunks',async()=>{
  const f=scenario();
  await f.worker.start({userAction:'PAIR_OWN_ACCOUNT',accountLocator:'acc'});
  f.ev.emit('messaging-history.set',{contacts:[],chats:[],messages:
    Array.from({length:301},(_,i)=>msg('M'+i,false))});
  f.ev.emit('messaging-history.set',historyPacket());
  f.ev.emit('connection.update',{connection:'open'});
  await tick();
  f.ev.emit('messaging-history.status',{syncType:1,status:'complete'});
  await tick();
  assert.equal(f.worker.getStatus().historyState,'HOLD_EARLY_HISTORY_OVERFLOW');
  assert.equal(f.worker.getStatus().lastError,'HISTORY_REPLAY_NOT_COMPLETE');
  assert.equal(f.history.length,2);
});
test('revoke fences subsequent profile URL reads without reconnect',async()=>{
  const f=scenario();await signedOnline(f);
  // Native owner has already verified a legitimate peer in the offline fixture.
  // Socket factory captured original socket reference returned to W28 Worker.
  // This test uses the sole SDK port; no real provider is ever contacted.
  const original=f.worker.readAvatar({remoteJid:'555200@s.whatsapp.net'});
  const first=await original;
  assert.equal(first.available,true);
  await f.worker.revoke();
  await assert.rejects(f.worker.readAvatar({remoteJid:'555200@s.whatsapp.net'}),
    /AVATAR_WAITING_USER_AUTH/);
});
