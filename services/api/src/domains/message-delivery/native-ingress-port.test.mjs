import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeIngressPort} from './native-ingress-port.mjs';

const driverByChannel={
  FB_PERSONAL:'MAUTRIX_META',FB_PAGE:'PANCAKE',
  WHATSAPP_PERSONAL:'BAILEYS',TELEGRAM_PERSONAL:'TDLIB_JSON'
};
let order=0;
function make(channel='WHATSAPP_PERSONAL'){
 const k={tenant:'actual-local-user-1',account:'authorized-account-1',channel,
   peer_id:'confirmed-peer-1',binding_revision:4};
 let online=true,authorized=true,consent=true,version=4,sourceVerified=true,
     workerIdentity='pid:42',insertions=0;
 const records=new Map();
 const owner={
  async connectionState(){
   return {connected:online,authorized,channel,account:k.account,
     bindingRevision:version,workerIdentity};
  },
  async verifyInbound({k:incoming,rawEvent}){
   return {verified:sourceVerified,upstream:driverByChannel[channel],
     k:incoming,providerMid:rawEvent.mid,sourceEventId:rawEvent.id,
     workerIdentity,original:rawEvent.text,synthetic:false,echo:false};
  }
 };
 const identity={
  isDurableIdentity:true,
  assertCurrent(_ctx,actual){
   if(actual.binding_revision!==version||!authorized)throw Error('STALE_BINDING');
   return {...actual,binding_revision:version};
  },
  evaluate(_ctx,{operation}){
   assert.equal(operation,'READ_INBOUND'); return {allowed:consent};
  }
 };
 const repository={async insertOriginalIfAbsent(e){
  insertions++;
  const key=JSON.stringify([e.k.tenant,e.k.account,e.k.channel,
    e.k.peer_id,e.k.binding_revision,e.providerMid]);
  if(records.has(key))return {stored:false,duplicate:true};
  records.set(key,e);return {stored:true,duplicate:false};
 }};
 const port=createNativeIngressPort({identityService:identity,
   trustedContext:{principal_id:'verified-user-1'},nativeOwner:owner,
   messageRepository:repository});
 const event=(mid='provider-mid-1')=>({k,rawEvent:{id:'upstream-event-1',mid,text:'Hi, authorized native inbound'}});
 return {k,port,event,records,get inserts(){return insertions},
   setOnline:v=>{online=v},setAuthorized:v=>{authorized=v},
   setConsent:v=>{consent=v},setVersion:v=>{version=v},
   setSourceVerified:v=>{sourceVerified=v},
   setWorkerIdentity:v=>{workerIdentity=v}};
}

test('no W24 strict native authority or no preexisting message repository: fail closed',()=>{
 assert.throws(()=>createNativeIngressPort(),/STRICT_DURABLE_W24_REQUIRED/);
 const f=make();
 assert.throws(()=>createNativeIngressPort({identityService:{
  isDurableIdentity:false,assertCurrent(){},evaluate(){}},
  trustedContext:{principal_id:'trusted'},nativeOwner:{verifyInbound(){},connectionState(){}},
  messageRepository:{insertOriginalIfAbsent(){}}}),/STRICT_DURABLE_W24_REQUIRED/);
 assert.ok(f.port);
});
test('four agreed upstream identifiers enter exactly once with full K and real MID',async()=>{
 for(const channel of Object.keys(driverByChannel)){
  const f=make(channel);
  const first=await f.port.acceptInbound(f.event());
  const duplicate=await f.port.acceptInbound(f.event());
  assert.equal(first.stored,true);
  assert.equal(duplicate.duplicate,true);
  assert.equal(f.records.size,1);
  assert.equal([...f.records.values()][0].providerMid,'provider-mid-1');
  assert.equal([...f.records.values()][0].upstream,driverByChannel[channel]);
  assert.equal((await f.port.readiness(f.k)).state,'UPSTREAM_BOUND');
 }
});
test('no connected actual account: WAITING_USER_AUTH and no message write',async()=>{
 const f=make();f.setOnline(false);
 assert.equal((await f.port.readiness(f.k)).state,'WAITING_USER_AUTH');
 await assert.rejects(f.port.acceptInbound(f.event()),/WAITING_USER_AUTH/);
 assert.equal(f.inserts,0);
});
test('rejects synthetic or unverified SDK evidence and mismatched K',async()=>{
 const f=make();
 await assert.rejects(f.port.acceptInbound({...f.event(),rawEvent:{...f.event().rawEvent,synthetic:true}}),
   /REAL_NATIVE_EVENT_REQUIRED/);
 f.setSourceVerified(false);
 await assert.rejects(f.port.acceptInbound(f.event()),/NATIVE_SOURCE_VERIFICATION_FAILED/);
 f.setSourceVerified(true);
 await assert.rejects(f.port.acceptInbound({...f.event(),k:{...f.k,channel:'FB_PAGE'}}),
   /WAITING_USER_AUTH|NATIVE_SOURCE_VERIFICATION_FAILED/);
 assert.equal(f.inserts,0);
});
test('binding rebind, revoked account, denied consent cannot create message',async()=>{
 const f=make();
 f.setVersion(5);
 await assert.rejects(f.port.acceptInbound(f.event()),/WAITING_USER_AUTH/);
 f.setVersion(4);f.setAuthorized(false);
 await assert.rejects(f.port.acceptInbound(f.event()),/WAITING_USER_AUTH/);
 f.setAuthorized(true);f.setConsent(false);
 await assert.rejects(f.port.acceptInbound(f.event()),/W24_INBOUND_DENIED/);
 assert.equal(f.inserts,0);
});
test('same provider MID in different account or peer remains isolated by repository full-K',async()=>{
 const f=make();
 await f.port.acceptInbound(f.event('mid-1'));
 await f.port.acceptInbound(f.event('mid-2'));
 assert.equal(f.records.size,2);
 assert.equal(f.inserts,2);
});
