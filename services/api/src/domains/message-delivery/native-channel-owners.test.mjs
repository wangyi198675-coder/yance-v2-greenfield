import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MessageDelivery,SyntheticConnectorSink,createW25NativeInboundPort,
 createW25NativeChannelOwnerPorts} from './index.mjs';
const channels={
 FB_PERSONAL:'MAUTRIX_META_NATIVE',FB_PAGE:'PANCAKE_OFFICIAL_READBACK',
 WHATSAPP_PERSONAL:'BAILEYS_NATIVE',TELEGRAM_PERSONAL:'TDLIB_JSON'
};
const k=channel=>({tenant:'NATIVE_TEST_SHAPE',account:'upstream-account',
 channel,peer_id:'upstream-peer',binding_revision:3});
const sha=x=>[x.tenantId,x.accountId,x.channel,x.peerId,x.bindingRevision].join('|');
function harness(t){
 const dir=mkdtempSync(join(tmpdir(),'w25-four-owner-mapping-'));
 const delivery=new MessageDelivery({databasePath:join(dir,'original-w25-outbox.sqlite'),
  eligibility:{check:async()=>({allowed:false})},
  sink:new SyntheticConnectorSink(async()=>{throw Error('REAL_SEND_DISABLED')}),
  receiptVerifier:async()=>({verified:false})});
 t.after(()=>{delivery.close();rmSync(dir,{recursive:true,force:true})});
 const port=createW25NativeInboundPort({
  delivery,verifyNativeSource:async event=>({
   authorized:true,isNative:true,principalId:'test-principal-attested',
   tenantId:event.k.tenantId,accountId:event.k.accountId,
   peerId:event.k.peerId,channel:event.k.channel,source:event.source,
   bindingRevision:3,accountEpoch:2,consentEpoch:5,connectionEpoch:1
  }),
  readW24Identity:async({k})=>({valid:true,identityKey:sha(k),
   bindingRevision:3,accountEpoch:2,consentEpoch:5}),
  checkPrivateInboundConsent:async({k,nativePrincipalId})=>({
   authorized:true,principalId:nativePrincipalId,consentEpoch:5,
   accountEpoch:2,bindingRevision:Number(k.bindingRevision)
  })
 });
 const channelsPort=createW25NativeChannelOwnerPorts({
  nativeInboundPort:port,attestOriginalOwnerEvent:async({owner,k,mid})=>({
   verified:true,owner,account:k.account,peerId:k.peer_id,
   bindingRevision:k.binding_revision,providerMid:mid,
   principalId:'test-principal-attested',nativeSessionCurrent:true,
   evidenceRef:'TEST_ONLY_SIGNED_UPSTREAM_FIXTURE'
  })
 });
 return {delivery,port,channelsPort};
}
test('original W27 readback DTO → W25 same WAL durable MID and normalized K; duplicate suppressed',async t=>{
 const {delivery,channelsPort}=harness(t);
 const event={source:'PANCAKE_OFFICIAL_READBACK',k:k('FB_PAGE'),
  providerMid:'Pancake-message-42',original:'fixture text',conversationId:'conversation-33',
  metaPageId:'meta-page-123',payloadDigest:'test-digest',
  verifiedProviderReadback:true,verifiedNativePeerBinding:true,
  inboundProof:'PAGES_FM_AUTHENTICATED_REST_READBACK'};
 const first=await channelsPort.pancake.deliverToExistingInbound(event);
 const second=await channelsPort.pancake.deliverToExistingInbound(event);
 assert.equal(first.accepted,true);assert.equal(first.duplicate,false);
 assert.equal(second.duplicate,true);assert.equal(first.ingressId,second.ingressId);
 assert.equal(delivery.db.prepare('SELECT COUNT(*) AS n FROM inbound_messages').get().n,1);
 assert.equal(delivery.db.prepare('SELECT COUNT(*) AS n FROM send_intents').get().n,0);
});
test('original W28 messages.upsert DTO → W25 original inbox; receipt cannot fake ACK',async t=>{
 const {channelsPort,delivery}=harness(t);
 const x={provider:'BAILEYS_NATIVE',k:k('WHATSAPP_PERSONAL'),
  providerMid:'baileys-unique-101',providerRemoteJid:'55501@s.whatsapp.net',
  original:'hello',nativeContentKind:'conversation',
  provenance:'BAILEYS_NATIVE_MESSAGES_UPSERT'};
 const y=await channelsPort.baileys.acceptInbound(x);
 assert.equal(y.accepted,true);assert.equal(y.canSend,false);
 const ack=await channelsPort.baileys.recordReceipt({nativeStatus:4});
 assert.equal(ack.accepted,false);
 assert.equal(delivery.db.prepare('SELECT COUNT(*) AS n FROM receipt_events').get().n,0);
});
test('original W29 official updateNewMessage DTO → same W25 W24 K and true-shaped exact MID',async t=>{
 const {channelsPort,delivery}=harness(t);
 const x={provider:'TDLIB_JSON',realProvider:true,k:k('TELEGRAM_PERSONAL'),
  originalTdUpdate:{'@type':'updateNewMessage',message:{
   is_outgoing:false,chat_id:1234567890123,id:987654321,
   content:{'@type':'messageText',text:{text:'hello native'}}}}};
 const y=await channelsPort.tdlib.onAuthorizedInbound(x);
 assert.equal(y.accepted,true);assert.equal(y.providerMid,'987654321');
 assert.equal(delivery.db.prepare('SELECT original_text FROM inbound_messages').get().original_text,'hello native');
 assert.equal((await channelsPort.tdlib.onW25Receipt({})).accepted,false);
});
test('W26 REAL Matrix Bridge ingress wire reserved but refuses synthetic event and missing attestation',async t=>{
 const {channelsPort}=harness(t);
 const x={provider:'MAUTRIX_META_NATIVE',k:k('FB_PERSONAL'),
  providerMid:'meta-source-mid-101',matrixEventId:'$matrix-origin-event-101',
  remoteThreadId:'bridge-thread-1',original:'matrix'};
 const accepted=await channelsPort.mautrix.onNativeBridgeInbound(x);
 assert.equal(accepted.accepted,true);
 assert.throws(()=>channelsPort.mautrix.onNativeBridgeInbound({
  ...x,matrixEventId:'fake-event'}),/MAUTRIX_NATIVE_EVENT_NOT_VERIFIED/);
});
test('wrong owner/channel, unauthorized W27 raw-webhook flags and malformed W29 messages always DENY',async t=>{
 const {channelsPort}=harness(t);
 await assert.rejects(channelsPort.baileys.acceptInbound({
  provider:'BAILEYS_NATIVE',k:k('FB_PERSONAL'),providerMid:'m',
  providerRemoteJid:'jid',original:'x',nativeContentKind:'conversation'
 }),/NATIVE_CHANNEL_OWNER_MISMATCH/);
 assert.throws(()=>channelsPort.pancake.deliverToExistingInbound({
  source:'PANCAKE_OFFICIAL_READBACK',k:k('FB_PAGE'),
  providerMid:'p',conversationId:'c',metaPageId:'p',
  original:'x',verifiedProviderReadback:false,
  verifiedNativePeerBinding:true,inboundProof:'PAGES_FM_AUTHENTICATED_REST_READBACK'
 }),/PANCAKE_OFFICIAL_READBACK_REQUIRED/);
 assert.throws(()=>channelsPort.tdlib.onAuthorizedInbound({
  provider:'TDLIB_JSON',realProvider:true,k:k('TELEGRAM_PERSONAL'),
  originalTdUpdate:{'@type':'updateNewMessage',message:{is_outgoing:false,
   id:1,chat_id:1,content:{'@type':'messagePhoto'}}}
 }),/TDLIB_NON_TEXT_HANDLED_BY_W23/);
});
test('no verified SDK Owner attester, even valid-shaped DTO, can enter W25 private inbox',async t=>{
 const {port,delivery}=harness(t);
 const owner=createW25NativeChannelOwnerPorts({nativeInboundPort:port,
  attestOriginalOwnerEvent:async()=>({verified:false})});
 await assert.rejects(owner.baileys.acceptInbound({
  provider:'BAILEYS_NATIVE',k:k('WHATSAPP_PERSONAL'),providerMid:'333',
  providerRemoteJid:'333@s.whatsapp.net',original:'x',
  nativeContentKind:'conversation'
 }),/NATIVE_OWNER_SOURCE_UNVERIFIED/);
 assert.equal(delivery.db.prepare('SELECT COUNT(*) AS n FROM inbound_messages').get().n,0);
});
