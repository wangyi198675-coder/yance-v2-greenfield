import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {MessageDelivery,SyntheticConnectorSink,createW25NativeInboundPort} from './index.mjs';

const k={tenantId:'AUTHORIZED_TEST_OWNER',accountId:'verified-account-A',
 channel:'WHATSAPP_PERSONAL',peerId:'confirmed-peer-A',bindingRevision:'5'};
const source='baileys';
const event=(mid,fromMe=false,patch={})=>({
 k:{...k},source,sourceEventId:'historical-event-'+mid,providerMid:mid,
 original:'message '+mid,fromMe,isHistory:true,synthetic:false,...patch
});
const key=k=>[k.tenantId,k.accountId,k.channel,k.peerId,k.bindingRevision].join('|');
function build(t,{oldTable=false}={}){
 const dir=mkdtempSync(join(tmpdir(),'w25-history-owner-')),path=join(dir,'original.sqlite');
 if(oldTable){
  const db=new DatabaseSync(path);
  db.exec('CREATE TABLE inbound_messages (id TEXT PRIMARY KEY, channel TEXT NOT NULL, tenant_id TEXT NOT NULL,account_id TEXT NOT NULL,peer_id TEXT NOT NULL,binding_revision TEXT NOT NULL, source TEXT NOT NULL,source_event_id TEXT NOT NULL,provider_mid TEXT NOT NULL,original_text TEXT NOT NULL,verified_principal TEXT NOT NULL,account_epoch INTEGER NOT NULL,consent_epoch INTEGER NOT NULL,connection_epoch INTEGER NOT NULL,received_at INTEGER NOT NULL, UNIQUE(tenant_id,account_id,channel,peer_id,source,provider_mid), UNIQUE(tenant_id,account_id,channel,source,source_event_id))');
  db.close();
 }
 let calls=0, consent=true, live=true, current=true, actor='verified-owner';
 const instances=[];
 const open=()=>{
  const delivery=new MessageDelivery({databasePath:path,eligibility:{check:async()=>({allowed:false,reason:'NO_REAL_SEND'})},
   sink:new SyntheticConnectorSink(async()=>{calls++;throw Error('NO_PROVIDER_SEND')}),
   receiptVerifier:async()=>({verified:false})});
  instances.push(delivery);
  const native=createW25NativeInboundPort({delivery,
   verifyNativeSource:async e=>({
    authorized:live,isNative:true,principalId:actor,accountId:e.k.accountId,
    peerId:e.k.peerId,tenantId:e.k.tenantId,channel:e.k.channel,
    source:e.source,bindingRevision:Number(e.k.bindingRevision),
    accountEpoch:4,consentEpoch:8,connectionEpoch:3,
    historyReadback:true,fromMe:e.fromMe,selfAccountVerified:true,
    providerTimestampMs:e.providerTimestampMs
   }),
   readW24Identity:async ({k:nativeK,nativePrincipalId})=>({
    valid:current&&nativePrincipalId===actor,identityKey:key(nativeK),
    bindingRevision:Number(nativeK.bindingRevision),accountEpoch:4,consentEpoch:8
   }),
   checkPrivateInboundConsent:async ({k:nativeK,nativePrincipalId,operation})=>({
    authorized:consent&&nativePrincipalId===actor&&
     ['PERSIST_HISTORY','READ_INBOUND','READ_HISTORY','PERSIST_INBOUND','READ_SEND_STATUS'].includes(operation),
    principalId:actor,consentEpoch:8,accountEpoch:4,
    bindingRevision:Number(nativeK.bindingRevision)
   })
  });
  return {delivery,native};
 };
 t.after(()=>{for(const x of instances.reverse())x.close();
   rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100})});
 return {open, get calls(){return calls},setConsent:x=>consent=x,
  setLive:x=>live=x,setCurrent:x=>current=x,setActor:x=>actor=x};
}
test('history direction fromMe preserves incoming and authenticated self-sent; no sender/auto reply',async t=>{
 const h=build(t),{native,delivery}=h.open();
 // Deterministic VERIFIED provider order: CI can record both local receipts
 // in the same millisecond, where tie-break by random ID is not arrival order.
 // Keep authoritative provenance; never change original native history sorting.
 const a=await native.acceptHistory(event('in',false,{providerTimestampMs:1770000001000}));
 const b=await native.acceptHistory(event('self',true,{providerTimestampMs:1770000002000}));
 assert.equal(a.fromMe,false);assert.equal(a.direction,'INBOUND');
 assert.equal(b.fromMe,true);assert.equal(b.direction,'OUTBOUND');
 assert.equal(b.deliveryState,'PROVIDER_HISTORY_UNRECONCILED');
 assert.equal(b.providerAckVerified,false);assert.equal(b.triggerReply,false);
 assert.equal(a.createsSendIntent,false);assert.equal(h.calls,0);
 assert.equal(delivery.db.prepare('SELECT COUNT(*) AS n FROM send_intents').get().n,0);
 const rows=await native.listHistory({k,nativePrincipalId:'verified-owner'});
 assert.ok(rows.every(r=>r.timeSource==='VERIFIED_PROVIDER_TIMESTAMP'));
 assert.deepEqual(rows.map(r=>r.fromMe),[false,true]);
 assert.ok(rows.every(r=>r.triggerReply===false));
});
test('history K+Provider MID is durable, repeated across restart and another process instance',async t=>{
 const h=build(t),{native:one}=h.open(),{native:two}=h.open();
 const [a,b]=await Promise.all([one.acceptHistory(event('same',true)),
   two.acceptHistory(event('same',true))]);
 assert.equal(Number(a.duplicate)+Number(b.duplicate),1);
 const {native:after}=h.open();
 const dup=await after.acceptHistory(event('same',true));
 assert.equal(dup.duplicate,true);assert.equal(dup.id,a.id);
 assert.equal((await after.listHistory({k,nativePrincipalId:'verified-owner'})).length,1);
 assert.equal(h.calls,0);
});
test('wrong fromMe, untrusted self-auth and changed replay never become an outgoing ACK',async t=>{
 const h=build(t),{native}=h.open();
 await assert.rejects(native.acceptHistory(event('bad',true,{fromMe:'true'})),/NATIVE_HISTORY_DIRECTION_REQUIRED/);
 await assert.rejects(native.acceptHistory(event('bad',false,{synthetic:true})),/VERIFIED_NATIVE_INBOUND_REQUIRED/);
 const first=await native.acceptHistory(event('collision',false));
 await assert.rejects(native.acceptHistory(event('collision',true)),/UPSTREAM_MID_OR_EVENT_REPLAY_CONFLICT/);
 await assert.rejects(native.acceptHistory(event('collision',false,{original:'tampered'})),
  /UPSTREAM_MID_OR_EVENT_REPLAY_CONFLICT/);
 assert.equal(first.deliveryState,'NOT_REQUESTED');
});
test('private history consent revoked/stale K blocks persistence and existing history read',async t=>{
 const h=build(t),{native}=h.open();
 const row=await native.acceptHistory(event('private',true));
 h.setConsent(false);
 await assert.rejects(native.listHistory({k,nativePrincipalId:'verified-owner'}),/PRIVATE_INBOUND_CONSENT_REQUIRED/);
 await assert.rejects(native.acceptHistory(event('another',true)),/PRIVATE_INBOUND_CONSENT_REQUIRED/);
 h.setConsent(true);h.setCurrent(false);
 await assert.rejects(native.getInbound({id:row.id,nativePrincipalId:'verified-owner'}),
 /PRIVATE_INBOUND_READ_AUTHORIZATION_STALE/);
 await assert.rejects(native.listHistory({k:{...k,accountId:'foreign'},
  nativePrincipalId:'verified-owner'}),/HISTORY_W24_K_NOT_CURRENT/);
});
test('legacy inbound_messages schema migrates in same W25 database without losing history',async t=>{
 const h=build(t,{oldTable:true}),{native,delivery}=h.open();
 assert.ok(delivery.db.prepare('PRAGMA table_info(inbound_messages)').all().some(x=>x.name==='from_me'));
 await native.acceptHistory(event('migration',true));
 assert.equal((await native.listHistory({k,nativePrincipalId:'verified-owner'}))[0].fromMe,true);
});
test('A restored history does not alter B/C dispatch state or create UNKNOWN resend',async t=>{
 const h=build(t),{native,delivery}=h.open();
 const A=await native.acceptHistory(event('a-history',true));
 const kb={...k,peerId:'confirmed-peer-B'},kc={...k,peerId:'confirmed-peer-C'};
 // B/C have separate K and unchanged existing Outbox authorization;
 // history import is read-only with respect to send_intents / W44 grants.
 const before=delivery.db.prepare('SELECT COUNT(*) AS n FROM send_intents').get().n;
 const b=await native.acceptHistory(event('b-history',false,{k:kb}));
 const c=await native.acceptHistory(event('c-history',true,{k:kc}));
 assert.notEqual(A.id,b.id);assert.notEqual(b.id,c.id);
 assert.equal(delivery.db.prepare('SELECT COUNT(*) AS n FROM send_intents').get().n,before);
 assert.equal(h.calls,0);
 assert.equal((await native.listHistory({k:kb,nativePrincipalId:'verified-owner'})).length,1);
 assert.equal((await native.listHistory({k:kc,nativePrincipalId:'verified-owner'})).length,1);
});

test('live inbound followed by real verified history same K/MID is deduplicated with no new trigger',async t=>{
 const h=build(t),{native,delivery}=h.open();
 const live={...event('live-same',false),
   sourceEventId:'live-official-event',isHistory:undefined,fromMe:undefined};
 const stored=await native.acceptInbound(live);
 assert.equal(stored.isHistory,false);
 const replay=await native.acceptHistory(event('live-same',false,
   {sourceEventId:'different-backfill-reference'}));
 assert.equal(replay.duplicate,true);
 assert.equal(replay.triggerReply,false);
 assert.equal(replay.id,stored.id);
 assert.equal(delivery.db.prepare('SELECT COUNT(*) AS n FROM inbound_messages').get().n,1);
 assert.equal(h.calls,0);
});
test('Composer status is read-only, exact K scoped, UNKNOWN never auto retried and draft not ACK',async t=>{
 const h=build(t),{native,delivery}=h.open();
 const now=Date.now();
 delivery.db.prepare('INSERT INTO send_intents (id,tenant_id,account_id,channel,peer_id,binding_revision,business_id,k_json,payload_json,payload_hash,mode,authority_json,actor_id,session_id,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .run('fixture-intent-A',k.tenantId,k.accountId,k.channel,k.peerId,k.bindingRevision,
   'business-A',JSON.stringify(k),JSON.stringify({text:'draft went UNKNOWN'}),
   'fixture-hash','HUMAN','{}','verified-owner','session', 'UNKNOWN',now,now);
 const before=delivery.db.prepare('SELECT COUNT(*) AS n FROM outbox_attempts').get().n;
 const statuses=await native.listSendStatus({k,nativePrincipalId:'verified-owner'});
 assert.equal(statuses.length,1);assert.equal(statuses[0].state,'UNKNOWN');
 assert.equal(statuses[0].canAutoRetry,false);assert.equal(statuses[0].isDraft,false);
 assert.equal(statuses[0].providerMid,null);
 assert.equal(delivery.db.prepare('SELECT COUNT(*) AS n FROM outbox_attempts').get().n,before);
 assert.deepEqual(await native.listSendStatus({k:{...k,peerId:'confirmed-peer-B'},
  nativePrincipalId:'verified-owner'}),[]);
 h.setConsent(false);
 await assert.rejects(native.listSendStatus({k,nativePrincipalId:'verified-owner'}),
  /SEND_STATUS_PRIVATE_READ_DENIED/);
 assert.equal(h.calls,0);
});

test('verified native provider timestamps sort out-of-order backfill, unverified time rejected',async t=>{
 const h=build(t),{native}=h.open();
 await native.acceptHistory(event('newer',true,{providerTimestampMs:1770000002000}));
 await native.acceptHistory(event('older',false,{providerTimestampMs:1770000001000}));
 const rows=await native.listHistory({k,nativePrincipalId:'verified-owner'});
 assert.deepEqual(rows.map(x=>x.providerMid),['older','newer']);
 assert.ok(rows.every(x=>x.timeSource==='VERIFIED_PROVIDER_TIMESTAMP'));
 assert.deepEqual(rows.map(x=>x.messageAt),[1770000001000,1770000002000]);
 await assert.rejects(native.acceptHistory(event('future',true,{
  providerTimestampMs:Date.now()+8640000000
 })),/UPSTREAM_SOURCE_NOT_AUTHENTICATED/);
 await assert.rejects(native.acceptHistory(event('impossible',true,{
  providerTimestampMs:'1770000001000'
 })),/UPSTREAM_SOURCE_NOT_AUTHENTICATED/);
});
