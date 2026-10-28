import test from 'node:test';
import assert from 'node:assert/strict';
import {createManagedStopController,createLoopbackManagedStopPort} from '../src/managed-stop.mjs';
import {fullK} from '../src/composer-bridge.mjs';
const A={tenant:'SYNTHETIC_TEST_ONLY',account:'fixture-account-1',
 channel:'FB_PERSONAL',peer_id:'fake-peer-001',binding_revision:1};
const B={...A,peer_id:'fake-peer-005'};
const C={...A,account:'fixture-account-2',channel:'FB_PAGE',peer_id:'fake-peer-002'};
const reply=(id,scope,status,gen=1,req='fake-stop-1')=>({
 authoritative:true,identityKey:fullK(id),scope,status,
 canSend:false,generation:gen,...(['PENDING','COMMITTED'].includes(status)?{
  requestId:req}:{} )
});
test('without installed trusted backend, stop stays UNAVAILABLE / no optimistic success',async()=>{
 const c=createManagedStopController();
 assert.equal((await c.read(A,'CONTACT')).status,'UNAVAILABLE');
 assert.equal((await c.stop(A,'CONTACT')).status,'UNAVAILABLE');
 assert.match(c.state(A,'CONTACT').reason,/接口未接入/);
 assert.equal(typeof c.send,'undefined');
});
test('real server reply PENDING only means stopping, no COMMITTED or send',async()=>{
 let state='ACTIVE',posts=0;
 const c=createManagedStopController({port:{
   read:async(id,scope)=>reply(id,scope,state),
   requestStop:async(id,scope)=>{posts++;state='PENDING';return reply(id,scope,'PENDING')}
 }});
 assert.equal((await c.stop(A,'CONTACT')).status,'PENDING');
 assert.equal(posts,1);
 assert.equal((await c.stop(A,'CONTACT')).status,'PENDING');
 assert.equal(posts,1);
});
test('only COMMITTED plus independent same-K W44 read grants stopped status, and refresh restores',async()=>{
 let state='ACTIVE';
 const port={read:async(id,scope)=>reply(id,scope,state),
  requestStop:async(id,scope)=>{state='COMMITTED';return reply(id,scope,state)}};
 const c=createManagedStopController({port});
 assert.equal((await c.stop(A,'CONTACT')).status,'COMMITTED');
 const refreshed=createManagedStopController({port});
 assert.equal((await refreshed.read(A,'CONTACT')).status,'COMMITTED');
});
test('fake post-only COMMITTED does NOT claim stopped if read stays ACTIVE',async()=>{
 const c=createManagedStopController({port:{
   read:async(id,scope)=>reply(id,scope,'ACTIVE'),
   requestStop:async(id,scope)=>reply(id,scope,'COMMITTED')
 }});
 assert.equal((await c.stop(A,'CONTACT')).status,'UNAVAILABLE');
 assert.match(c.state(A,'CONTACT').reason,/STOP_COMMIT_NOT_CONFIRMED/);
});
test('never claim stopped for post 409, network failure or stale K/epoch',async()=>{
 for(const message of ['STOP_HTTP_409','NETWORK_FAILED']){
  const c=createManagedStopController({port:{
   read:async(id,scope)=>reply(id,scope,'ACTIVE'),
   requestStop:async()=>{throw Error(message)}
  }});
  assert.equal((await c.stop(A,'CONTACT')).status,'UNAVAILABLE');
  assert.match(c.state(A,'CONTACT').reason,new RegExp(message));
 }
 const c=createManagedStopController({port:{
   read:async(id,scope)=>reply(B,scope,'COMMITTED',2,'fake-x'),
   requestStop:async(id,scope)=>reply(id,scope,'COMMITTED')
 }});
 assert.equal((await c.read(A,'CONTACT')).status,'UNAVAILABLE');
});
test('missing authorization UNQUALIFIED never requests grant mutation',async()=>{
 let posts=0;const c=createManagedStopController({port:{
   read:async(id,scope)=>reply(id,scope,'UNQUALIFIED'),
   requestStop:async()=>{posts++}
 }});
 assert.equal((await c.stop(A,'CONTACT')).status,'UNQUALIFIED');
 assert.equal(posts,0);
});
test('CONTACT A local state independent of B and C, same-account GLOBAL only one scope',async()=>{
 const flags=new Map();
 const port={read:async(id,scope)=>reply(id,scope,flags.get(fullK(id)+'|'+scope)||'ACTIVE'),
  requestStop:async(id,scope)=>{
    flags.set(fullK(id)+'|'+scope,'COMMITTED');
    return reply(id,scope,'COMMITTED')
  }};
 const c=createManagedStopController({port});
 assert.equal((await c.stop(A,'CONTACT')).status,'COMMITTED');
 assert.equal((await c.read(B,'CONTACT')).status,'ACTIVE');
 assert.equal((await c.read(C,'CONTACT')).status,'ACTIVE');
 assert.equal((await c.read(A,'GLOBAL')).status,'ACTIVE');
});
test('reject changed scope, missing persistent requestId and mismatched read generation',async()=>{
 const c=createManagedStopController({port:{
  read:async(id,scope)=>reply(id,scope,'ACTIVE'),
  requestStop:async(id)=>reply(id,'GLOBAL','COMMITTED')
 }});
 assert.equal((await c.stop(A,'CONTACT')).status,'UNAVAILABLE');
 const c2=createManagedStopController({port:{
  read:async(id,scope)=>reply(id,scope,'ACTIVE'),
  requestStop:async(id,scope)=>({...reply(id,scope,'COMMITTED'),requestId:''})
 }});
 assert.equal((await c2.stop(A,'CONTACT')).status,'UNAVAILABLE');
 const c3=createManagedStopController({port:{
  read:async(id,scope)=>reply(id,scope,'ACTIVE'),
  requestStop:async(id,scope)=>reply(id,scope,'COMMITTED',2,'fake-2')
 }});
 assert.equal((await c3.stop(A,'CONTACT')).status,'UNAVAILABLE');
});
test('duplicate simultaneous stop clicks coalesce one network POST',async()=>{
 let count=0;const c=createManagedStopController({port:{
  read:async(id,scope)=>reply(id,scope,count?'PENDING':'ACTIVE',1,'fake-stop-1'),
  requestStop:async(id,scope)=>{count++;await Promise.resolve();return reply(id,scope,'PENDING',1,'fake-stop-1')}
 }});
 const [a,b]=await Promise.all([c.stop(A,'CONTACT'),c.stop(A,'CONTACT')]);
 assert.equal(a.status,'PENDING');assert.equal(b.status,'PENDING');assert.equal(count,1);
});
test('loopback adapter rejects external origin, disabled, and never trusts browser Actor',async()=>{
 assert.throws(()=>createLoopbackManagedStopPort({baseUrl:'http://127.0.0.1:47181'}),/STOP_PORT_DISABLED/);
 assert.throws(()=>createLoopbackManagedStopPort({baseUrl:'https://example.org',enabled:true}),/STOP_LOOPBACK_ONLY/);
 let method='',body=null;
 const fetchImpl=async(url,options)=>{
  method=options.method;
  if(options.body)body=JSON.parse(options.body);
  return {ok:true,json:async()=>reply(A,'CONTACT','PENDING')};
 };
 const port=createLoopbackManagedStopPort({baseUrl:'http://127.0.0.1:47181',enabled:true,fetchImpl});
 await port.requestStop(A,'CONTACT');
 assert.equal(method,'POST');
 assert.deepEqual(Object.keys(body).sort(),['identity','scope']);
 assert.equal(body.actor,undefined);
});
