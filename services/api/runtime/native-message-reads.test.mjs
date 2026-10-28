import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {createLocalSessionAuthority} from './local-session.mjs';
import {createNativeMessageReadHttp} from './native-message-reads.mjs';
const origin='http://127.0.0.1:44766';
const k={tenant:'TEST_W24_TENANT',account:'TEST_W24_ACCOUNT',
 channel:'TELEGRAM_PERSONAL',peer_id:'test:peer_1',binding_revision:'1'};
const selected=[k.tenant,k.account,k.channel,k.peer_id,k.binding_revision].join('|');
const native={verified:true,source:'W54_NATIVE_CURRENT_USER',
 principalRef:'NATIVE_TEST_USER_0001',installationRef:'NATIVE_TEST_INSTALL_0001',
 revocationGeneration:1};
const row={id:randomBytes(32).toString('hex'),
 k:{tenantId:k.tenant,accountId:k.account,channel:k.channel,
  peerId:k.peer_id,bindingRevision:k.binding_revision},
 providerMid:'W29_REAL_INBOUND_TEST_MID_001',original:'QA_TEXT_ONLY',
 source:'tdlib-json'};
async function run(callbacks={}){
 const authority=createLocalSessionAuthority();
 const gateway=createNativeMessageReadHttp({sessionAuthority:authority,webOrigin:origin,...callbacks});
 const server=createServer((req,res)=>gateway(req,res,new URL(req.url,'http://localhost')));
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+server.address().port;
 return {authority,base,cookie:()=>authority.issueNativeWebView(randomBytes(32).toString('hex')).cookie.split(';')[0],
 async get(path,cookie=null,headers={}){
  const r=await fetch(base+path,{headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...headers}});
  return {status:r.status,value:await r.json()}
 },close:()=>new Promise(ok=>server.close(ok))}
}
test('no verified local native session cannot use W25 private read',async()=>{
 const x=await run();
 try{
  assert.equal((await x.get('/api/v2/messages?identityKey='+encodeURIComponent(selected))).status,401);
  assert.equal((await x.get('/api/v2/messages',x.cookie())).status,422);
  assert.equal((await x.get('/api/v2/messages?identityKey='+encodeURIComponent(selected),x.cookie())).status,503);
 }finally{await x.close()}
});
test('signed TEST-ONLY W24 K and W25 original DTO read has exact W46 timeline structure',async()=>{
 const x=await run({resolveW54Principal:async()=>native,
  resolveW24CurrentFullK:async()=>k,
  readW25OriginalInbound:async()=>[row]});
 try{
  const cookie=x.cookie();
  const result=await x.get('/api/v2/messages?identityKey='+encodeURIComponent(selected),cookie);
  assert.equal(result.status,200);assert.equal(result.value.authoritative,true);
  assert.equal(result.value.identityKey,selected);
  assert.equal(result.value.canSend,false);
  assert.deepEqual(result.value.messages[0],{identityKey:selected,
   mid:row.providerMid,original:'QA_TEXT_ONLY',direction:'INBOUND',
   providerSource:'tdlib-json',delivery:'NOT_REQUESTED'});
  assert.equal((await x.get('/api/v2/messages?identityKey='+encodeURIComponent(selected),
   cookie,{Origin:'https://evil.example'})).status,403);
  x.authority.revokeAll();
  assert.equal((await x.get('/api/v2/messages?identityKey='+encodeURIComponent(selected),cookie)).status,401);
 }finally{await x.close()}
});
test('browser-selectable K cannot produce another peer or account',async()=>{
 for(const patch of [
  {resolveW24CurrentFullK:async()=>({...k,peer_id:'not-my-peer'})},
  {readW25OriginalInbound:async()=>[{...row,k:{...row.k,accountId:'FOREIGN_ACCOUNT'}}]},
  {readW25OriginalInbound:async()=>[{...row,id:'unsigned-mid'}]},
  {readW25OriginalInbound:async()=>[row,{...row}]}
 ]){
  const x=await run({resolveW54Principal:async()=>native,
   resolveW24CurrentFullK:async()=>k,
   readW25OriginalInbound:async()=>[row],...patch});
  try{
   const r=await x.get('/api/v2/messages?identityKey='+encodeURIComponent(selected),x.cookie());
   assert.ok([409,503].includes(r.status));
  }finally{await x.close()}
 }
});
test('W54 revocation generation changing while W25 reads blocks all private data',async()=>{
 let version=1;
 const x=await run({resolveW54Principal:async()=>({...native,revocationGeneration:version}),
  resolveW24CurrentFullK:async()=>k,
  readW25OriginalInbound:async()=>{version++;return [row]}});
 try{
  assert.equal((await x.get('/api/v2/messages?identityKey='+encodeURIComponent(selected),x.cookie())).status,409)
 }finally{await x.close()}
});

test('original W25 verified WhatsApp history keeps genuine inbound AND own outbound direction without fabricated ACK',async()=>{
 const wa={...k,channel:'WHATSAPP_PERSONAL'};
 const selectedWa=[wa.tenant,wa.account,wa.channel,wa.peer_id,wa.binding_revision].join('|');
 const base={...row,k:{...row.k,channel:'WHATSAPP_PERSONAL'},source:'baileys',
  isHistory:true,messageAt:1793000000000,timeSource:'VERIFIED_PROVIDER_TIMESTAMP'};
 const history=[
  {...base,id:randomBytes(32).toString('hex'),providerMid:'wa-inbound-a',
   original:'received by user',fromMe:false,direction:'INBOUND',deliveryState:'NOT_REQUESTED'},
  {...base,id:randomBytes(32).toString('hex'),providerMid:'wa-fromme-b',
   original:'sent by user before connecting',fromMe:true,direction:'OUTBOUND',
   deliveryState:'PROVIDER_HISTORY_UNRECONCILED'},
 ];
 const x=await run({resolveW54Principal:async()=>native,
  resolveW24CurrentFullK:async()=>wa,
  readW25OriginalInbound:async()=>history});
 try{
  const data=await x.get('/api/v2/messages?identityKey='+encodeURIComponent(selectedWa),x.cookie());
  assert.equal(data.status,200);
  assert.equal(data.value.messages.length,2);
  assert.equal(data.value.messages[0].direction,'INBOUND');
  assert.equal(data.value.messages[1].direction,'OUTBOUND');
  assert.equal(data.value.messages[1].delivery,'PROVIDER_HISTORY_UNRECONCILED');
  assert.equal(data.value.messages[1].isHistory,true);
  assert.equal(data.value.messages[1].messageAt,1793000000000);
  assert.equal(data.value.canSend,false);
 }finally{await x.close()}
});
test('W47 refuses fake W25 fromMe, forged direction, ACK claim and foreign WhatsApp K',async()=>{
 const wa={...k,channel:'WHATSAPP_PERSONAL'};
 const sel=[wa.tenant,wa.account,wa.channel,wa.peer_id,wa.binding_revision].join('|');
 const valid={...row,k:{...row.k,channel:'WHATSAPP_PERSONAL'},source:'baileys',
  isHistory:true,fromMe:true,direction:'OUTBOUND',
  messageAt:1793000000000,deliveryState:'PROVIDER_HISTORY_UNRECONCILED'};
 const negatives=[
  {...valid,fromMe:true,direction:'INBOUND'},
  {...valid,fromMe:true,deliveryState:'DELIVERED'},
  {...valid,isHistory:false,fromMe:true},
  {...valid,k:{...valid.k,accountId:'FOREIGN_WHATSAPP_ACCOUNT'}},
 ];
 for(const item of negatives){
  const x=await run({resolveW54Principal:async()=>native,
   resolveW24CurrentFullK:async()=>wa,
   readW25OriginalInbound:async()=>[item]});
  try{
   const data=await x.get('/api/v2/messages?identityKey='+encodeURIComponent(sel),x.cookie());
   assert.equal(data.status,503);
   assert.equal(data.value.canSend,false);
  }finally{await x.close()}
 }
});
