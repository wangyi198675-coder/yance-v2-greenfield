// W46↔W47 cross-owner DTO only, using actual W47 HTTP handler, not a copied API.
// Explicit TEST_ONLY simulated current-user/profile, no real key/payment/provider.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {publicModelCatalog,modelCatalog,confirmedModelSelection,PRIVATE_ROUTES}
 from '../src/private-brain-ui-contract.mjs';
const dir=process.env.YANCE_W47_MODEL_DIR;
if(!dir){
 test('real W47 model HTTP source required',{skip:'Set YANCE_W47_MODEL_DIR to signed actual W47 Owner runtime'},()=>{});
}else{
 const owner=await import(pathToFileURL(dir+'\\local-session.mjs').href);
 const model=await import(pathToFileURL(dir+'\\private-model-http.mjs').href);
 const webOrigin='http://127.0.0.1:48761';
 const fakeOnly={source:'W54_NATIVE_CURRENT_USER',verified:true,
  principalRef:'TEST-ONLY-FAKE-PROFILE-01',installationRef:'TEST-ONLY-FAKE-INSTALL'};
 async function fixture({ports=true}={}){
  const sessions=owner.createLocalSessionAuthority({
    approveNativeLaunch:async()=>true,nativeTtlMs:120000
  });
  const local=owner.createLocalSessionHttpApi({authority:sessions,webOrigin});
  let selected=null,changed=0;
  const config={
   read:async()=>({selected,sources:[
    {provider:'openrouter',configured:true,available:true,status:'READY',models:['openai/gpt-4o-mini']},
    {provider:'openai',configured:false,available:false,status:'SETUP_REQUIRED',models:['gpt-4o-mini']},
    {provider:'local',configured:false,available:false,status:'MODEL_UNAVAILABLE',models:['qwen3:8b']}
   ]}),
   select:async({selection})=>{changed++;selected=selection;return config.read()}
  };
  const handler=model.createPrivateModelHttp({
   sessionAuthority:sessions,webOrigin,
   resolveNativePrincipal:ports?async()=>fakeOnly:null,
   modelConfigPort:ports?config:null,
   credentialVaultPort:ports?{status:async({provider})=>({configured:provider==='openrouter'})}:null,
   w43ModelPort:ports?{
     capabilities:async()=>[
       {provider:'openrouter',modelId:'openai/gpt-4o-mini'},
       {provider:'openai',modelId:'gpt-4o-mini'},
       {provider:'local',modelId:'qwen3:8b'}
     ],
     authorizeSelection:async({selection})=>selection.provider==='openrouter'
   }:null
  });
  const server=createServer(async(req,res)=>{
   const url=new URL(req.url,'http://127.0.0.1');
   try{
    if(url.pathname.startsWith('/api/v2/local-session/'))return void(await local(req,res,url));
    if(url.pathname.startsWith('/api/v2/private-brain/model-'))return void(await handler(req,res,url));
    res.writeHead(404);res.end('{}');
   }catch(e){res.writeHead(503);res.end('{}')}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const host='http://127.0.0.1:'+server.address().port;
  const call=async(route,{method='GET',cookie,csrf,body,origin=webOrigin}={})=>{
   const h={Origin:origin};
   if(cookie)h.Cookie=cookie;
   if(csrf)h['x-yance-csrf']=csrf;
   if(body!==undefined)h['content-type']='application/json';
   const response=await fetch(host+route,{method,headers:h,
    body:body===undefined?undefined:JSON.stringify(body)});
   return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')};
  };
  return {call,close:()=>new Promise(resolve=>server.close(resolve)),changed:()=>changed};
 }
 test('W47 actual HTTP catalog→config→select→config fits single W46 exact DTO, cloud only',async()=>{
  const f=await fixture();
  try{
   const c=await f.call(PRIVATE_ROUTES.catalog);
   assert.equal(c.status,200);
   const pub=publicModelCatalog(c.body);
   assert.deepEqual(pub.map(x=>x.id),['openrouter','openai','local']);
   assert.equal((await f.call(PRIVATE_ROUTES.config)).status,401);
   const s=await f.call('/api/v2/local-session/first-party',{method:'POST',body:{}});
   assert.equal(s.status,200);
   const cookie=s.cookie.split(';')[0],csrf=s.body.csrfToken;
   const before=await f.call(PRIVATE_ROUTES.config,{cookie});
   assert.equal(before.status,200);
   assert.equal(modelCatalog(before.body,pub).configured,false);
   const selected={provider:'openrouter',modelId:'openai/gpt-4o-mini'};
   const post=await f.call(PRIVATE_ROUTES.selection,{method:'POST',cookie,csrf,body:selected});
   assert.equal(post.status,200);
   assert.equal(confirmedModelSelection(post.body,selected).configured,true);
   const after=await f.call(PRIVATE_ROUTES.config,{cookie});
   assert.equal(after.status,200);
   const read=modelCatalog(after.body,pub);
   assert.equal(read.selectedProvider,'openrouter');
   assert.equal(read.selectedModelId,'openai/gpt-4o-mini');
   assert.equal(read.models.find(x=>x.provider==='local').available,false);
   assert.equal(f.changed(),1);
   assert.ok(!/secret|sk-test|apiKey/.test(JSON.stringify(after.body)));
  }finally{await f.close()}
 });
 test('W47 actual HTTP without native signed W54/W55/W43 refuses config even if fake session',async()=>{
  const f=await fixture({ports:false});
  try{
   const a=await f.call('/api/v2/local-session/first-party',{method:'POST',body:{}});
   const cookie=a.cookie.split(';')[0];
   const c=await f.call(PRIVATE_ROUTES.config,{cookie});
   assert.equal(c.status,503);
   assert.equal(c.body.canSend,false);
   assert.equal(f.changed(),0);
  }finally{await f.close()}
 });
}
