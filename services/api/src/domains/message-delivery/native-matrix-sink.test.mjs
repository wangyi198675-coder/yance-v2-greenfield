import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createW25OfficialMatrixSink} from './native-matrix-sink.mjs';
import {MessageDelivery,NativeConnectorSink,DeliveryError} from './index.mjs';
const K={tenantId:'tenant',accountId:'account',channel:'FB_PERSONAL',
 peerId:'verified-peer',bindingRevision:'1'};
const ROOM='!verifiedRoom123456789012345';
const ACCOUNT={bridgeBot:'@facebookbot:yance-w26.invalid',connectedCount:1,
 realAccountState:'UPSTREAM_CONNECTED_W24_BINDING_PENDING'};
function adapter({proof=true,connected=true,sent=true}={}){
 const calls=[];
 const owner=createW25OfficialMatrixSink({
  getCurrentNativeSession:async()=>({principal:'@w56_internal_fb_bridge:yance-w26.invalid',token:'local-fixture-token'}),
  readNativeAccountStatus:async()=>connected?ACCOUNT:{...ACCOUNT,connectedCount:0},
  resolveW24VerifiedPeerRoom:async()=>({
   verified:proof,platformPeerVerified:proof,nativeSessionCurrent:true,
   channel:'FB_PERSONAL',tenantId:K.tenantId,accountId:K.accountId,
   peerId:K.peerId,bindingRevision:K.bindingRevision,
   roomId:ROOM,platformPeerId:'provider-peer-real-in-fixture'}),
  fetchImpl:async(url,opt)=>{
   calls.push({url,method:opt?.method||'GET',body:opt?.body});
   if(url.endsWith('/joined_rooms'))return Response.json({joined_rooms:[ROOM]});
   if(url.includes('/send/m.room.message/'))
     return sent?Response.json({event_id:'$native-matrix-event'}):Response.json({errcode:'M_UNKNOWN'},{status:500});
   throw Error('UNEXPECTED_ENDPOINT');
  }
 });
 return {owner,calls};
}
const payload={synthetic:false,intentId:'intent-1',attemptId:'attempt-1',businessMessageId:'business-1',
 k:K,payload:{text:'ordinary message'}};
test('native official Matrix adapter invokes a single actual Matrix send and returns UNKNOWN until verified provider ACK',async()=>{
 const {owner,calls}=adapter();
 assert.ok(owner instanceof NativeConnectorSink);
 const result=await owner.send(payload);
 assert.deepEqual(result,{kind:'UNKNOWN'});
 assert.equal(calls.filter(x=>x.method==='PUT').length,1);
 assert.equal(calls.filter(x=>x.method==='PUT')[0].body,
  JSON.stringify({msgtype:'m.text',body:'ordinary message'}));
 assert.ok(calls.filter(x=>x.method==='PUT')[0].url.endsWith('/attempt-1'));
});
test('not currently logged in or missing signed peer proof never reaches send boundary',async()=>{
 for(const opts of [{connected:false},{proof:false}]){
  const {owner,calls}=adapter(opts);
  assert.deepEqual(await owner.send(payload),{kind:'REJECTED_NO_SEND'});
  assert.equal(calls.some(c=>c.method==='PUT'),false);
 }
});
test('a local Matrix 200 response cannot be used to forge native Meta delivery ACK',async()=>{
 const owner=new NativeConnectorSink({deliver:async()=>({
  kind:'ACK',providerMid:'forged',verifiedProviderReceipt:true,receiptSource:'MAUTRIX_META_PROVIDER_ACK'})});
 assert.deepEqual(await owner.send(payload),{kind:'UNKNOWN'});
});
test('original W25 Outbox uses three authority gates, persists UNKNOWN and blocks duplicate recipient',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'w56-native-w25-'));
 const phases=[],{owner,calls}=adapter();
 const authority={allowed:true,k:K,custodyEpoch:'custody1',accountEpoch:'account1',
  routeRevision:'route1',custodyMode:'HUMAN',accountActive:true,
  budget:{reserved:true,reservationId:'reservation1'},expiresAt:Date.now()+200000,
  humanAuthorized:true};
 const delivery=new MessageDelivery({
  databasePath:join(dir,'outbox.sqlite'),sink:owner,
  receiptVerifier:async event=>event.signature==='trusted-test-only'?{verified:true,source:'trusted-test-only'}:null,
  eligibility:{check:async({phase})=>{phases.push(phase);return authority;}}
 });
 try{
  const info={k:K,businessMessageId:'unique-client-business-id',
   payload:{text:'ordinary message'},mode:'HUMAN',
   actorId:'test-actor',sessionId:'test-session'};
  const i=await delivery.submitIntent(info);
  const repeat=await delivery.submitIntent({...info,actorId:'different-actor',sessionId:'different-session'});
  assert.equal(i.id,repeat.id);
  const result=await delivery.dispatchOne(i.id);
  assert.equal(result.state,'UNKNOWN');
  assert.equal(delivery.getIntent(i.id).state,'UNKNOWN');
  assert.deepEqual(phases,['ADMISSION','ADMISSION','PRE_NETWORK','PRE_NETWORK']);
  const next=await delivery.submitIntent({...info,businessMessageId:'second-business-id'});
  assert.equal((await delivery.dispatchOne(next.id)).state,'RECIPIENT_UNKNOWN_HOLD');
  assert.equal(calls.filter(x=>x.method==='PUT').length,1);
  const attempt=delivery.getAttempt(i.id);
  await assert.rejects(delivery.recordVerifiedReceipt({
   sourceEventId:'source-1',kind:'ACK',providerMid:'provider-real-mid',
   intentId:i.id,attemptId:attempt.id,channel:K.channel,accountId:K.accountId,
   peerId:K.peerId,bindingRevision:K.bindingRevision,signature:'unverified'
  }),e=>e.code==='RECEIPT_UNVERIFIED');
  const verified=await delivery.recordVerifiedReceipt({
   sourceEventId:'source-1',kind:'ACK',providerMid:'provider-real-mid',
   intentId:i.id,attemptId:attempt.id,channel:K.channel,accountId:K.accountId,
   peerId:K.peerId,bindingRevision:K.bindingRevision,signature:'trusted-test-only'
  });
  assert.equal(verified.state,'ACKED_NATIVE');
  assert.equal((await delivery.dispatchOne(next.id)).state,'UNKNOWN');
  assert.equal(calls.filter(x=>x.method==='PUT').length,2);
 }finally{delivery.close();rmSync(dir,{recursive:true,force:true})}
});
