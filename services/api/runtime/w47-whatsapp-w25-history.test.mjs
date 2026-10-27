import test from 'node:test';
import assert from 'node:assert/strict';
import {createW47WhatsAppW25HistoryAdapter} from './w47-whatsapp-w25-history.mjs';
const k={tenant:'personal',account:'acct',channel:'WHATSAPP_PERSONAL',peer_id:'peer-1',binding_revision:1};
const item={k,provider:'BAILEYS_NATIVE',providerMid:'MID-abc',providerRemoteJid:'123@s.whatsapp.net',
 fromMe:true,direction:'OUTBOUND',original:'sent in WhatsApp before joining',
 nativeContentKind:'conversation',timestampSec:1770000000,provenance:'BAILEYS_NATIVE_MESSAGING_HISTORY_SET',
 canSend:false};
test('W28 native event is mapped to EXISTING W25 durable acceptHistory, preserving original peer K/MID/direction',async()=>{
 const received=[];const port=createW47WhatsAppW25HistoryAdapter({nativeHistoryPort:{
  acceptHistory:async x=>{received.push(x);return {id:'w25-persisted-id',duplicate:false,
   isHistory:true,triggerReply:false,providerAckVerified:false}}
 }});
 const r=await port.acceptHistory(item);
 assert.equal(r.persisted,true);assert.equal(r.duplicate,false);
 const x=received[0];
 assert.deepEqual(x.k,{tenantId:'personal',accountId:'acct',channel:'WHATSAPP_PERSONAL',
  peerId:'peer-1',bindingRevision:'1'});
 assert.equal(x.fromMe,true);assert.equal(x.isHistory,true);
 assert.equal(x.providerMid,'MID-abc');assert.equal(x.source,'baileys');
 assert.equal(x.providerTimestampMs,1770000000000);assert.equal(x.synthetic,false);
 assert.equal(x.original,'sent in WhatsApp before joining');
 assert.equal(x.sourceEventId.length,75);assert.equal(r.canSend,false);
});
test('replay within current K retains deterministic source event id and W25 duplicate authority',async()=>{
 const events=[];const port=createW47WhatsAppW25HistoryAdapter({nativeHistoryPort:{
  acceptHistory:async x=>{events.push(x);return {id:'w25-id',
   duplicate:events.length>1,isHistory:true,triggerReply:false,providerAckVerified:false}}
 }});
 assert.equal((await port.acceptHistory(item)).duplicate,false);
 assert.equal((await port.acceptHistory(item)).duplicate,true);
 assert.equal(events[0].sourceEventId,events[1].sourceEventId);
});
test('a foreign or invalid provider/original is refused before W25 is touched',async()=>{
 let calls=0;const port=createW47WhatsAppW25HistoryAdapter({nativeHistoryPort:{
  acceptHistory:async()=>{calls++;return {}}
 }});
 for(const bad of [{...item,provider:'FAKE'},{...item,fromMe:false},
  {...item,canSend:true},{...item,original:null},
  {...item,k:{...k,binding_revision:0}}]){
  await assert.rejects(port.acceptHistory(bad));
 }
 assert.equal(calls,0);
});
test('W25 must confirm genuine durable persistence and never turn unknown into success',async()=>{
 const port=createW47WhatsAppW25HistoryAdapter({nativeHistoryPort:{
  acceptHistory:async()=>({duplicate:false})
 }});
 await assert.rejects(port.acceptHistory(item),/W25_DURABLE_HISTORY_RECEIPT_REQUIRED/);
});
