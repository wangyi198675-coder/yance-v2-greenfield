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
 {provider:'openrouter',modelId:'openai/gpt-4o-mini'},
 {provider:'openai',modelId:'gpt-4o-mini'},
 {provider:'local',modelId:'qwen3:8b'}
];
async function fixture({trustedLaunch=null,modelPorts=false,now=()=>Date.now()}={}){
 const authority=createLocalSessionAuthority({approveNativeLaunch:trustedLaunch,now,ttlMs:5000,nativeTtlMs:120000});
 const local=createLocalSessionHttpApi({authority,webOrigin});
 let selections=0,lookups=0,stores=0,vaultChecks=0;
 let selected=null;
 const config={
  read:async()=>{lookups++;return {selected,sources:[
   {provider:'openrouter',configured:true,available:true,status:'READY',models:['openai/gpt-4o-mini']},
   {provider:'openai',configured:false,available:false,status:'SETUP_REQUIRED',models:['gpt-4o-mini']},
   {provider:'local',configured:false,available:false,status:'MODEL_UNAVAILABLE',models:['qwen3:8b']}
  ]}},
  select:async({selection})=>{stores++;selected=selection;return config.read()}
 };
 const app=createPrivateModelHttp({sessionAuthority:authority,webOrigin,
  resolveNativePrincipal:modelPorts?async()=>profile:null,
  modelConfigPort:modelPorts?config:null,
  credentialVaultPort:modelPorts?{status:async({provider})=>{vaultChecks++;return {configured:provider==='openrouter'}}}:null,
  w43ModelPort:modelPorts?{capabilities:async()=>models,authorizeSelection:async({selection})=>{
   selections++;return selection.provider==='openrouter';
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
    body:{provider:'openrouter',modelId:'openai/gpt-4o-mini'}})).status,401);
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
  assert.equal(r.status,200);assert.deepEqual(r.data.providers.map(a=>a.provider),['openrouter','openai','local']);
  assert.equal(r.data.authoritative,false);assert.equal(r.data.canSend,false);
  assert.equal((await x.req('/api/v2/private-brain/model-config')).status,401);
 }finally{await x.close()}
});
test('local-first app with verified synthetic TEST port can select Cloud without any local Qwen3',async()=>{
 const x=await fixture({trustedLaunch:async()=>true,modelPorts:true});
 try{
  const a=await x.bootstrap(),cookie=a.cookie.split(';')[0],csrf=a.data.csrfToken;
  const s=await x.req('/api/v2/private-brain/model-selection',{method:'POST',cookie,csrf,
   body:{provider:'openrouter',modelId:'openai/gpt-4o-mini'}});
  assert.equal(s.status,200);assert.equal(s.data.selected.provider,'openrouter');
  assert.equal(s.data.canSend,false);
  assert.equal(JSON.stringify(s.data).includes('sk-test'),false);
  assert.equal((await x.req('/api/v2/private-brain/model-config',{cookie})).data.selected.modelId,'openai/gpt-4o-mini');
  assert.equal((await x.req('/api/v2/private-brain/model-selection',{method:'POST',cookie,csrf,
   body:{provider:'openai',modelId:'gpt-4o-mini'}})).status,409);
  assert.equal((await x.req('/api/v2/private-brain/model-selection',{method:'POST',cookie,csrf,
   body:{provider:'local',modelId:'qwen3:8b'}})).status,403);
  assert.equal(x.stats().stores,1);
  assert.equal(x.stats().selections,2);
 }finally{await x.close()}
});
test('cross-site, forged cookie and missing CSRF cannot change user-selected model or consume credits',async()=>{
 const x=await fixture({trustedLaunch:async()=>true,modelPorts:true});
 try{
  const a=await x.bootstrap(),cookie=a.cookie.split(';')[0],csrf=a.data.csrfToken;
  const body={provider:'openrouter',modelId:'openai/gpt-4o-mini'};
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
