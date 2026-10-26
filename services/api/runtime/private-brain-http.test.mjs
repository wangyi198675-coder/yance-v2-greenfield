// Test doubles prove the HTTP security contract only, NOT a W43 real Agent Run.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {createLocalSessionAuthority,createLocalSessionHttpApi} from './local-session.mjs';
import {createPrivateBrainHttp} from './private-brain-http.mjs';
const origin='http://127.0.0.1:49091';
const profile=Object.freeze({source:'W54_NATIVE_CURRENT_USER',verified:true,
  profileRef:'test-only-w54-profile-a',appDataRef:'test-only-native-appdata-ref'});
const sampleReceipt={
 status:'AGNO_RUN_COMPLETED',original_response:'TEST-ONLY-AGNO-RECEIPT',
 run_id:'test-native-run-100',session_id:'test-native-session-100',outbound:'DISABLED',
 provenance:{type:'AGNO_RUN_RESULT',sdk_pin:'3.1.10',
  run_id:'test-native-run-100',session_id:'test-native-session-100'}
};
async function bootstrap({issuer=false,profilePort=null,bridge=null}={}){
 const code=randomBytes(32).toString('hex');
 const authority=createLocalSessionAuthority({approvePairing:issuer?async v=>v===code:null});
 const sessionApi=createLocalSessionHttpApi({authority,webOrigin:origin});
 const privateApi=createPrivateBrainHttp({sessionAuthority:authority,webOrigin:origin,
  resolveNativeProfile:profilePort,agnoBridge:bridge});
 const srv=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://127.0.0.1');
   if(url.pathname.startsWith('/api/v2/local-session/'))return void(await sessionApi(req,res,url));
   if(url.pathname.startsWith('/api/v2/private-brain/'))return void(await privateApi(req,res,url));
   res.writeHead(404);res.end('{}');
  }catch{if(!res.headersSent){res.writeHead(503);res.end('{}')}else res.destroy()}
 });
 await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+srv.address().port;
 const req=async(path,{cookie,csrf,body,method='GET',originValue=origin}={})=>{
  const headers={Origin:originValue};
  if(cookie)headers.Cookie=cookie;
  if(csrf)headers['X-Yance-CSRF']=csrf;
  if(body!==undefined)headers['Content-Type']='application/json';
  const response=await fetch(base+path,{method,headers,
    body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,data:await response.json(),
    cookie:response.headers.get('set-cookie')};
 };
 const approve=async()=>{
  const response=await req('/api/v2/local-session/redeem',{method:'POST',body:{pairingCode:code}});
  assert.equal(response.status,200);
  return {cookie:response.cookie.split(';')[0],csrf:response.data.csrfToken};
 };
 return {authority,base,req,approve,close:()=>new Promise(ok=>srv.close(ok))};
}
test('PRIVATE turn/history require server-minted local Session before W43 or profile reads',async()=>{
 let profileReads=0,modelCalls=0;
 const b=await bootstrap({profilePort:async()=>{profileReads++;return profile},
  bridge:{runPrivateTurn:async()=>{modelCalls++;return sampleReceipt},
   readNativeHistory:async()=>{modelCalls++;return {status:'HISTORY_EMPTY',messages:[],run_count:0,complete_turn_count:0}}}});
 try{
  assert.equal((await b.req('/api/v2/private-brain/history')).status,401);
  assert.equal((await b.req('/api/v2/private-brain/turn',{method:'POST',body:{message:'Hello'}})).status,401);
  assert.equal((await b.req('/api/v2/private-brain/history',{cookie:'yance_local_session='+randomBytes(32).toString('hex')})).status,401);
  assert.equal(profileReads,0);assert.equal(modelCalls,0);
 }finally{await b.close()}
});
test('even a valid Session cannot read/run PRIVATE until signed W54/W43 ports exist',async()=>{
 const b=await bootstrap({issuer:true});
 try{
  const s=await b.approve();
  assert.equal((await b.req('/api/v2/private-brain/history',{cookie:s.cookie})).data.error,
    'W54_CURRENT_USER_APPDATA_BINDING_NOT_READY');
  assert.equal((await b.req('/api/v2/private-brain/turn',{method:'POST',cookie:s.cookie,
    csrf:s.csrf,body:{message:'真实问题'}})).status,503);
  assert.equal((await b.req('/api/v2/private-brain/history',{cookie:s.cookie,
    originValue:'https://malicious.example'})).status,403);
  assert.equal((await b.req('/api/v2/private-brain/turn',{method:'POST',cookie:s.cookie,
    body:{message:'Hello'}})).status,403);
  b.authority.revokeAll();
  assert.equal((await b.req('/api/v2/private-brain/history',{cookie:s.cookie})).status,401);
 }finally{await b.close()}
});
test('rejects browser-provided actor SID database paths and other scope overrides',async()=>{
 let count=0;
 const b=await bootstrap({issuer:true,profilePort:async()=>profile,
  bridge:{runPrivateTurn:async()=>{count++;return sampleReceipt},
   readNativeHistory:async()=>{count++;return {status:'HISTORY_EMPTY',messages:[],run_count:0,complete_turn_count:0}}}});
 try{
  const s=await b.approve();
  for(const payload of [
   {message:'Hey',actor:'admin'},{message:'Hey',sid:'S-1-5-21'},
   {message:'Hey',dbPath:'C:\\Windows\\temp\\private.db'},
   {message:'Hey',profileRef:'other-user'}, {message:'Hey',thread:'../outside'},
   {message:'Hey',channel:'FB_PERSONAL'},{message:''}
  ])assert.equal((await b.req('/api/v2/private-brain/turn',{method:'POST',
      cookie:s.cookie,csrf:s.csrf,body:payload})).status,422);
  for(const q of ['?actor=admin','?dbPath=secrets','?thread=../private','?thread=one&thread=two'])
    assert.equal((await b.req('/api/v2/private-brain/history'+q,{cookie:s.cookie})).status,422);
  assert.equal(count,0);
 }finally{await b.close()}
});
test('test-only injected W43 port yields only validated native Agno receipt/history; no platform sending',async()=>{
 let run=0,history=0;const argumentsSeen=[];
 const b=await bootstrap({issuer:true,profilePort:async()=>profile,
  bridge:{runPrivateTurn:async x=>{run++;argumentsSeen.push(x);return sampleReceipt},
   readNativeHistory:async x=>{history++;argumentsSeen.push(x);
    return {status:'HISTORY_PRESENT',messages:[{role:'user',content:'test-input'},
     {role:'assistant',content:'test-output'}],run_count:1,complete_turn_count:1}}}});
 try{
  const s=await b.approve();
  const input=await b.req('/api/v2/private-brain/turn',{method:'POST',cookie:s.cookie,
   csrf:s.csrf,body:{thread:'personal',message:'用户直接给AI的问题'}});
  assert.equal(input.status,200);assert.equal(input.data.status,'AGNO_RUN_COMPLETED');
  assert.equal(input.data.answer,'TEST-ONLY-AGNO-RECEIPT');
  assert.equal(input.data.canSend,false);
  const h=await b.req('/api/v2/private-brain/history?thread=personal',{cookie:s.cookie});
  assert.equal(h.status,200);assert.equal(h.data.source,'W43_NATIVE_AGNO_CHAT_HISTORY');
  assert.equal(h.data.messages.length,2);
  assert.equal(run,1);assert.equal(history,1);
  assert.equal(argumentsSeen[0].profile,profile);
  assert.equal(argumentsSeen[0].actor,undefined);
  assert.equal(argumentsSeen[0].dbPath,undefined);
 }finally{await b.close()}
});
test('rejects fabricated model completion and synthetic history even after local pairing',async()=>{
 const b=await bootstrap({issuer:true,profilePort:async()=>profile,
  bridge:{runPrivateTurn:async()=>({...sampleReceipt,provenance:{...sampleReceipt.provenance,type:'SYNTHETIC_TEST_ONLY'}}),
   readNativeHistory:async()=>({status:'HISTORY_PRESENT',messages:[{role:'system',content:'secret'}],
     run_count:1,complete_turn_count:1})}});
 try{
  const s=await b.approve();
  assert.equal((await b.req('/api/v2/private-brain/turn',{method:'POST',cookie:s.cookie,
   csrf:s.csrf,body:{message:'Say hi'}})).status,503);
  assert.equal((await b.req('/api/v2/private-brain/history',{cookie:s.cookie})).status,503);
 }finally{await b.close()}
});
test('server-side revoked Session never returns a completed model response',async()=>{
 let resume;const stall=new Promise(ok=>resume=ok);
 const b=await bootstrap({issuer:true,profilePort:async()=>profile,
  bridge:{runPrivateTurn:async()=>stall,readNativeHistory:async()=>({status:'HISTORY_EMPTY',
    messages:[],run_count:0,complete_turn_count:0})}});
 try{
  const s=await b.approve();
  const pending=b.req('/api/v2/private-brain/turn',{method:'POST',cookie:s.cookie,
    csrf:s.csrf,body:{message:'pending run'}});
  await new Promise(ok=>setTimeout(ok,45));
  b.authority.revokeAll();
  resume(sampleReceipt);
  const final=await pending;
  assert.equal(final.status,401);assert.equal(final.data.error,'LOCAL_SESSION_REVOKED_DURING_RUN');
 }finally{await b.close()}
});
