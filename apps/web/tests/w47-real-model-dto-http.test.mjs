// QA-ONLY corrected fixture pointing at ACTUAL W47 857e3a signed HTTP implementation.
// This replaces stale lowercase fixture in an isolated disposable c5a joint QA worktree.
// NOT committed into the W46 Owner-only two-file delta.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {publicModelCatalog,modelCatalog,confirmedModelSelection,PRIVATE_ROUTES}
 from '../src/private-brain-ui-contract.mjs';
const root=process.env.YANCE_W47_MODEL_DIR;
const CLOUD='OPENROUTER_USER_API',OPENAI='OPENAI_USER_API',LOCAL='LLAMACPP_LOCAL_QWEN3_8B_FREE';
if(!root){
 test('Real signed W47 source must be specified',{skip:'YANCE_W47_MODEL_DIR'},()=>{});
}else{
 const owner=await import(pathToFileURL(root+'\\local-session.mjs').href);
 const m=await import(pathToFileURL(root+'\\private-model-http.mjs').href);
 const origin='http://127.0.0.1:48761';
 async function fixture({ports=true,authorized=true}={}){
  const authority=owner.createLocalSessionAuthority({
   approveNativeLaunch:async()=>true,nativeTtlMs:120000
  });
  const local=owner.createLocalSessionHttpApi({authority,webOrigin:origin});
  const verified={source:'W54_NATIVE_CURRENT_USER',verified:true,
   principalRef:'TEST_ONLY_FAKE_CURRENT_USER_0001',installationRef:'TEST_ONLY_FAKE_INSTALL_0001'};
  const capabilities=[
   {provider:CLOUD,modelId:'openai/gpt-4o-mini'},
   {provider:OPENAI,modelId:'gpt-4o-mini'},
   {provider:LOCAL,modelId:'qwen3:8b'}
  ];
  let selected=null,count=0;
  const config={
   read:async()=>({selected,sources:[
    {provider:CLOUD,configured:true,available:true,status:'READY',models:['openai/gpt-4o-mini']},
    {provider:OPENAI,configured:false,available:false,status:'SETUP_REQUIRED',models:['gpt-4o-mini']},
    {provider:LOCAL,configured:false,available:false,status:'MODEL_UNAVAILABLE',models:['qwen3:8b']}
   ]}),
   select:async({selection})=>{selected=selection;count++;return config.read()}
  };
  const model=m.createPrivateModelHttp({
   sessionAuthority:authority,webOrigin:origin,
   resolveNativePrincipal:ports?async()=>verified:null,
   modelConfigPort:ports?config:null,
   credentialVaultPort:ports?{status:async({provider})=>({
    configured:provider==='OPENROUTER'})}:null,
   w43ModelPort:ports?{
    capabilities:async()=>capabilities,
    authorizeSelection:async({selection})=>authorized&&selection.provider===CLOUD
   }:null
  });
  const server=createServer(async(req,res)=>{
   const url=new URL(req.url,'http://127.0.0.1');
   try{
    if(url.pathname.startsWith('/api/v2/local-session/'))return void(await local(req,res,url));
    if(url.pathname.startsWith('/api/v2/private-brain/model-'))return void(await model(req,res,url));
    res.writeHead(404);res.end('{}');
   }catch{res.writeHead(503);res.end('{}')}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const host='http://127.0.0.1:'+server.address().port;
  const call=async(route,{method='GET',body,cookie,csrf,from=origin}={})=>{
   const headers={Origin:from};
   if(cookie)headers.Cookie=cookie;
   if(csrf)headers['x-yance-csrf']=csrf;
   if(body!==undefined)headers['content-type']='application/json';
   const resp=await fetch(host+route,{method,headers,
    body:body===undefined?undefined:JSON.stringify(body)});
   return {status:resp.status,data:await resp.json(),cookie:resp.headers.get('set-cookie')};
  };
  return {call,close:()=>new Promise(resolve=>server.close(resolve)),count:()=>count,
   authority};
 }
 test('actual canonical W47 HTTP public/provider→signed config→POST selected→GET same K',async()=>{
  const f=await fixture();
  try{
   const p=await f.call(PRIVATE_ROUTES.catalog);
   assert.equal(p.status,200);
   const publicSources=publicModelCatalog(p.data);
   assert.deepEqual(publicSources.map(x=>x.id),[CLOUD,OPENAI,LOCAL]);
   const publicSetup=await f.call(PRIVATE_ROUTES.config);
   assert.equal(publicSetup.status,200);
   assert.equal(publicSetup.data.authoritative,false);
   assert.equal(publicSetup.data.status,'OPEN_LOCAL_MODEL_SETTINGS');
   assert.equal(publicSetup.data.requiresTerminalPair,false);
   assert.equal(publicSetup.data.credentialsExposed,false);
   const auth=await f.call('/api/v2/local-session/first-party',{method:'POST',body:{}});
   assert.equal(auth.status,200);
   const cookie=auth.cookie.split(';')[0],csrf=auth.data.csrfToken;
   const before=await f.call(PRIVATE_ROUTES.config,{cookie});
   assert.equal(before.status,200);
   assert.equal(modelCatalog(before.data,publicSources).configured,false);
   const selected={provider:CLOUD,modelId:'openai/gpt-4o-mini'};
   const post=await f.call(PRIVATE_ROUTES.selection,
     {method:'POST',body:selected,cookie,csrf});
   assert.equal(post.status,200);
   assert.equal(confirmedModelSelection(post.data,selected).configured,true);
   const after=await f.call(PRIVATE_ROUTES.config,{cookie});
   assert.equal(after.status,200);
   const validated=modelCatalog(after.data,publicSources);
   assert.equal(validated.selectedProvider,CLOUD);
   assert.equal(validated.selectedModelId,selected.modelId);
   assert.equal(validated.models.find(x=>x.provider===LOCAL).available,false);
   assert.equal(f.count(),1);
   assert.ok(!/sk-test|secret|apiKey/.test(JSON.stringify(after.data)));
  }finally{await f.close()}
 });
 test('real W47 HTTP, missing native security ports deny authorized-looking fixture',async()=>{
  const f=await fixture({ports:false});
  try{
   const boot=await f.call('/api/v2/local-session/first-party',{method:'POST',body:{}});
   assert.equal(boot.status,200);
   const result=await f.call(PRIVATE_ROUTES.config,{cookie:boot.cookie.split(';')[0]});
   assert.equal(result.status,503);assert.equal(result.data.canSend,false);
   assert.equal(f.count(),0);
  }finally{await f.close()}
 });
 test('real W47 HTTP wrong origin, missing CSRF, missing cloud key and billing fail closed',async()=>{
  const f=await fixture({authorized:false});
  try{
   const boot=await f.call('/api/v2/local-session/first-party',{method:'POST',body:{}});
   const cookie=boot.cookie.split(';')[0],csrf=boot.data.csrfToken;
   const selected={provider:CLOUD,modelId:'openai/gpt-4o-mini'};
   const badOrigin=await f.call(PRIVATE_ROUTES.selection,
    {method:'POST',body:selected,cookie,csrf,from:'https://evil.example'});
   assert.equal(badOrigin.status,403);
   const missing=await f.call(PRIVATE_ROUTES.selection,{method:'POST',body:selected,cookie});
   assert.equal(missing.status,403);
   const unpaid=await f.call(PRIVATE_ROUTES.selection,{method:'POST',body:selected,cookie,csrf});
   assert.equal(unpaid.status,403);
   const unconfigured=await f.call(PRIVATE_ROUTES.selection,
    {method:'POST',body:{provider:OPENAI,modelId:'gpt-4o-mini'},cookie,csrf});
   assert.equal(unconfigured.status,409);
   const legacy=await f.call(PRIVATE_ROUTES.selection,
    {method:'POST',body:{provider:'openrouter',modelId:'openai/gpt-4o-mini'},cookie,csrf});
   assert.equal(legacy.status,422);
   assert.equal(f.count(),0);
  }finally{await f.close()}
 });
}
