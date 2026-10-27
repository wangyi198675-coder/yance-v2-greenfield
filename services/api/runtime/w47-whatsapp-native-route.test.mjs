import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createW47WhatsAppNativeRoute} from './w47-whatsapp-native-route.mjs';
const session={principalRef:'owner-current',installationRef:'installed-pc',
 revocationGeneration:1,sessionRef:'current-session'};
function mockNativeWorker(observed){
 const state={state:'WAITING_USER_AUTH',connected:false,qrAvailable:false,
  nativeSocketCreated:false};
 return {
  getStatus:()=>({...state,canSend:false}),
  getAccountIdentity:()=>null,
  start:async({userAction,accountLocator})=>{
   assert.equal(userAction,'PAIR_OWN_ACCOUNT');
   assert.equal(accountLocator,'current-own-whatsapp');
   state.state='STARTING_NATIVE_SDK';state.nativeSocketCreated=true;
   observed.onState({...state});return {...state}
  },
  stop:async()=>{state.state='WAITING_USER_AUTH';state.connected=false;return {...state}},
  revoke:async()=>{state.state='REVOKED';state.connected=false;return {...state}},
  readAvatar:async()=>({available:false,reason:'NO_PROFILE_PICTURE'}),
 };
}
async function serverFixture({ports=true}={}){
 const handler=createW47WhatsAppNativeRoute(ports?{
  createWorker:mockNativeWorker,
  verifyNativeSession:async({nativeSession})=>nativeSession===session?
   {verified:true,kind:'NATIVE_FIRST_PARTY',...session}:null,
  resolveSignedNativeSession:async({request})=>request.headers['x-test-auth']==='yes'?
   {nativeSession:session,originVerified:true,csrfVerified:true,rendererVerified:true}:null
 }:{});
 const server=createServer(async(req,res)=>{
  if(!handler){res.writeHead(503);res.end(JSON.stringify({error:'NATIVE_CHANNEL_AUTH_OWNER_PORT_NOT_CONNECTED'}));return}
  await handler(req,res,new URL(req.url,'http://localhost'));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const call=async(path,{method='GET',body=null,auth=true}={})=>{
  const res=await fetch(base+path,{method,headers:{
   ...(auth?{'x-test-auth':'yes'}:{}),
   ...(body?{'content-type':'application/json'}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  return {status:res.status,body:await res.json()};
 };
 return {call,close:()=>new Promise(r=>server.close(r))};
}
test('missing REAL W24/W55/W54 SDK producer refuses native path, not a manufactured QR',async()=>{
 const f=await serverFixture({ports:false});
 try{assert.equal((await f.call('/api/v2/providers/whatsapp-personal/native/status')).status,503)}
 finally{await f.close()}
});
test('original W28 Controller + W47 existing-listener route accepts current native user POST, never invents QR',async()=>{
 const f=await serverFixture();
 try{
  const u='/api/v2/providers/whatsapp-personal/native/';
  assert.equal((await f.call(u+'status',{auth:false})).status,401);
  const pre=await f.call(u+'status');assert.equal(pre.status,200);
  assert.equal(pre.body.state,'WAITING_USER_AUTH');assert.equal(pre.body.canSend,false);
  const start=await f.call(u+'authorize',{method:'POST',body:{accountLocator:'current-own-whatsapp'}});
  assert.equal(start.status,200);assert.equal(start.body.state,'STARTING_NATIVE_SDK');
  assert.equal((await f.call(u+'qr')).status,409);
  const denied=await f.call(u+'revoke',{method:'POST',auth:false,body:{}});
  assert.equal(denied.status,401);
  const revoked=await f.call(u+'revoke',{method:'POST',body:{}});
  assert.equal(revoked.status,200);assert.equal(revoked.body.state,'REVOKED');
 }finally{await f.close()}
});
