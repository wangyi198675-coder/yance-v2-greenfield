import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {createLocalSessionAuthority,createLocalSessionHttpApi} from './local-session.mjs';
import {createPrivateModelHttp} from './private-model-http.mjs';
const webOrigin='http://127.0.0.1:48761';
const profile={source:'W54_NATIVE_CURRENT_USER',verified:true,principalRef:'TEST-ONLY-PROFILE-NOT-OS-IDENTITY',
 installationRef:'TEST-ONLY-INSTALL-0001'};
const models=[
 {provider:'OPENROUTER_USER_API',modelId:'openai/gpt-4o-mini'},
 {provider:'OPENAI_USER_API',modelId:'gpt-4o-mini'},
 {provider:'LLAMACPP_LOCAL_QWEN3_8B_FREE',modelId:'qwen3:8b'}
];
async function fixture({trustedLaunch=null,modelPorts=false,now=()=>Date.now()}={}){
 const authority=createLocalSessionAuthority({approveNativeLaunch:trustedLaunch,now,ttlMs:5000,nativeTtlMs:120000});
 const local=createLocalSessionHttpApi({authority,webOrigin});
 let selections=0,lookups=0,stores=0,vaultChecks=0;
 let selected=null;
 const config={
  read:async()=>{lookups++;return {selected,sources:[
   {provider:'OPENROUTER_USER_API',configured:true,available:true,status:'READY',models:['openai/gpt-4o-mini']},
   {provider:'OPENAI_USER_API',configured:false,available:false,status:'SETUP_REQUIRED',models:['gpt-4o-mini']},
   {provider:'LLAMACPP_LOCAL_QWEN3_8B_FREE',configured:false,available:false,status:'MODEL_UNAVAILABLE',models:['qwen3:8b']}
  ]}},
  select:async({selection})=>{stores++;selected=selection;return config.read()}
 };
 const app=createPrivateModelHttp({sessionAuthority:authority,webOrigin,
  resolveNativePrincipal:modelPorts?async()=>profile:null,
  modelConfigPort:modelPorts?config:null,
  credentialVaultPort:modelPorts?{status:async({provider})=>{vaultChecks++;return {configured:provider==='OPENROUTER_USER_API'}}}:null,
  w43ModelPort:modelPorts?{capabilities:async()=>models,authorizeSelection:async({selection})=>{
   selections++;return selection.provider==='OPENROUTER_USER_API';
  }}:null});
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  try{
   if(url.pathname.startsWith('/api/v2/local-session/'))return void(await local(req,res,url));
   if(url.pathname.startsWith('/api/v2/private-brain/model-'))return void(await app(req,res,url));
   res.writeHead(404);res.end('{}');
  }catch{res.writeHead(503);res.end('{}')}
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+server.address().port;
 const req=async(route,{method='GET',body,csrf,cookie,origin=webOrigin}={})=>{
  const headers={Origin:origin};
  if(body!==undefined)headers['content-type']='application/json';
  if(cookie)headers.Cookie=cookie;
  if(csrf)headers['x-yance-csrf']=csrf;
  const r=await fetch(base+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};
 };
 const bootstrap=()=>req('/api/v2/local-session/first-party',{method:'POST',body:{}});
 return {authority,req,bootstrap,stats:()=>({lookups,stores,vaultChecks,selections}),
  close:()=>new Promise(ok=>server.close(ok))};
}
test('no W54 signed native launch: localhost and exact Origin never create a Session',async()=>{
 const x=await fixture();
 try{
  const r=await x.bootstrap();
  assert.equal(r.status,503);assert.equal(r.data.error,'TRUSTED_NATIVE_APP_LAUNCH_NOT_CONNECTED');
  assert.equal((await x.req('/api/v2/private-brain/model-config')).status,401);
  assert.equal((await x.req('/api/v2/local-session/first-party',{method:'POST',body:{actor:'admin'}})).status,422);
  assert.equal((await x.req('/api/v2/local-session/first-party',{method:'POST',body:{},origin:'https://evil.example'})).status,403);
  assert.equal((await x.req('/api/v2/private-brain/model-selection',{method:'POST',
    body:{provider:'OPENROUTER_USER_API',modelId:'openai/gpt-4o-mini'}})).status,401);
 }finally{await x.close()}
});
test('explicitly TEST ONLY native-launch verifier yields 2-minute session, logout and restart-grade revocation',async()=>{
 let clock=100000;let approves=0;
 const x=await fixture({now:()=>clock,trustedLaunch:async()=>{approves++;return approves===1}});
 try{
  const a=await x.bootstrap();
  assert.equal(a.status,200);assert.equal(a.data.sessionKind,'NATIVE_FIRST_PARTY');
  assert.equal(a.data.expiresAt,220000);assert.match(a.cookie,/Max-Age=120/);
  const cookie=a.cookie.split(';')[0];
  assert.match(cookie,/^yance_local_session=[a-f0-9]{64}$/);
  assert.equal((await x.req('/api/v2/local-session/status',{cookie})).data.paired,true);
  assert.equal((await x.req('/api/v2/local-session/status',{cookie:'yance_local_session='+randomBytes(32).toString('hex')})).data.paired,false);
  assert.equal((await x.req('/api/v2/local-session/logout',{method:'POST',cookie,body:{}})).status,403);
  assert.equal((await x.req('/api/v2/local-session/logout',{method:'POST',cookie,
   csrf:a.data.csrfToken,body:{}})).status,200);
  assert.equal((await x.req('/api/v2/local-session/status',{cookie})).data.paired,false);
  assert.equal((await x.bootstrap()).status,401);
  x.authority.revokeAll();
  clock=250000;
  assert.equal((await x.req('/api/v2/local-session/status',{cookie})).data.paired,false);
 }finally{await x.close()}
});
test('model catalog public never exposes keys; sensitive status and selection require real Session and native ports',async()=>{
 const x=await fixture();
 try{
  const r=await x.req('/api/v2/private-brain/model-catalog');
  assert.equal(r.status,200);assert.deepEqual(r.data.providers.map(a=>a.provider),['OPENROUTER_USER_API','OPENAI_USER_API','LLAMACPP_LOCAL_QWEN3_8B_FREE']);
  assert.equal(r.data.authoritative,false);assert.equal(r.data.canSend,false);
  assert.equal((await x.req('/api/v2/private-brain/model-config')).status,401);
 }finally{await x.close()}
});
test('local-first app with verified synthetic TEST port can select Cloud without any local Qwen3',async()=>{
 const x=await fixture({trustedLaunch:async()=>true,modelPorts:true});
 try{
  const a=await x.bootstrap(),cookie=a.cookie.split(';')[0],csrf=a.data.csrfToken;
  const s=await x.req('/api/v2/private-brain/model-selection',{method:'POST',cookie,csrf,
   body:{provider:'OPENROUTER_USER_API',modelId:'openai/gpt-4o-mini'}});
  assert.equal(s.status,200);assert.equal(s.data.authoritative,true);
  assert.equal(s.data.selectedProvider,'OPENROUTER_USER_API');
  assert.equal(s.data.selectedModelId,'openai/gpt-4o-mini');
  assert.equal(s.data.secureCredentialStorage,false);
  assert.equal(s.data.models.some(m=>m.provider==='OPENROUTER_USER_API'&&m.modelId==='openai/gpt-4o-mini'&&m.available&&m.configured),true);
  assert.equal(s.data.models.some(m=>m.provider==='LLAMACPP_LOCAL_QWEN3_8B_FREE'&&m.available),false);
  assert.equal(s.data.canSend,false);
  assert.equal(JSON.stringify(s.data).includes('sk-test'),false);
  assert.equal(JSON.stringify(s.data).includes('apiKey'),false);
  assert.equal(s.data.canSend,false);
  assert.equal(s.data.credentialsExposed,false);
  assert.equal((await x.req('/api/v2/private-brain/model-config',{cookie})).data.selectedModelId,'openai/gpt-4o-mini');
  // A W46 browser cannot store paid API keys by a plaintext HTTP route.
  assert.equal((await x.req('/api/v2/private-brain/credentials',{method:'POST',cookie,csrf,
    body:{provider:'OPENROUTER_USER_API',apiKey:'FAKE_TEST_ONLY'}})).status,404);
  assert.equal((await x.req('/api/v2/private-brain/model-selection',{method:'POST',cookie,csrf,
   body:{provider:'OPENAI_USER_API',modelId:'gpt-4o-mini'}})).status,409);
  assert.equal((await x.req('/api/v2/private-brain/model-selection',{method:'POST',cookie,csrf,
   body:{provider:'LLAMACPP_LOCAL_QWEN3_8B_FREE',modelId:'qwen3:8b'}})).status,403);
  assert.equal(x.stats().stores,1);
  assert.equal(x.stats().selections,2);
 }finally{await x.close()}
});
test('cross-site, forged cookie and missing CSRF cannot change user-selected model or consume credits',async()=>{
 const x=await fixture({trustedLaunch:async()=>true,modelPorts:true});
 try{
  const a=await x.bootstrap(),cookie=a.cookie.split(';')[0],csrf=a.data.csrfToken;
  const body={provider:'OPENROUTER_USER_API',modelId:'openai/gpt-4o-mini'};
  assert.equal((await x.req('/api/v2/private-brain/model-selection',{method:'POST',body,cookie,
    origin:'https://evil.example',csrf})).status,403);
  assert.equal((await x.req('/api/v2/private-brain/model-selection',{method:'POST',body,cookie})).status,403);
  assert.equal((await x.req('/api/v2/private-brain/model-selection',{method:'POST',body,
    cookie:'yance_local_session='+randomBytes(32).toString('hex'),csrf})).status,401);
  assert.equal((await x.req('/api/v2/private-brain/model-selection',{method:'POST',body:{...body,
    actor:'admin'},cookie,csrf})).status,422);
  assert.equal(x.stats().stores,0);
  x.authority.revokeAll();
  assert.equal((await x.req('/api/v2/private-brain/model-config',{cookie})).status,401);
 }finally{await x.close()}
});
test('even paired W47 real config refuses cloud when W54/W55/W43 signed providers are absent',async()=>{
 const x=await fixture({trustedLaunch:async()=>true,modelPorts:false});
 try{
  const a=await x.bootstrap(),cookie=a.cookie.split(';')[0];
  const result=await x.req('/api/v2/private-brain/model-config',{cookie});
  assert.equal(result.status,503);assert.equal(result.data.error,'W54_NATIVE_MODEL_PROFILE_NOT_CONNECTED');
  assert.equal(result.data.canSend,false);
 }finally{await x.close()}
});
