import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {createFunctionModelRoutingStore} from './function-model-routing.mjs';
import {createFunctionModelRoutingHttp} from './function-model-routing-http.mjs';
const local={provider:'LLAMACPP_LOCAL_QWEN3_8B_FREE',modelId:'qwen3:8b',configured:true,available:true};
const cloud={provider:'OPENROUTER_USER_API',modelId:'anthropic/claude-sonnet-4',configured:true,available:true};
const root=()=>mkdtempSync(join(tmpdir(),'yance-func-model-'));
const err=async(fn,status)=>{try{await fn();assert.fail('expected failure')}catch(e){assert.equal(e.status,status)}};
test('function assignments persist independently; restart restores each; no keys or consent stored',async()=>{
 const dir=root();try{
  let offered=[local,cloud];const init=()=>createFunctionModelRoutingStore({appLocalDataRoot:dir,readEligibleModels:async()=>offered});
  const store=init();
  const a=await store.select({functionId:'TRANSLATE',provider:local.provider,modelId:local.modelId,expectedRevision:0});
  assert.equal(a.revision,1);assert.equal(a.assignments.find(x=>x.functionId==='TRANSLATE').eligible,true);
  const b=await init().select({functionId:'REPLY_SUGGESTIONS',provider:cloud.provider,modelId:cloud.modelId,expectedRevision:1,confirmPaidCost:true});
  assert.equal(b.revision,2);
  const again=await init().current();
  assert.deepEqual(again.assignments.find(x=>x.functionId==='TRANSLATE').choice,{provider:local.provider,modelId:local.modelId});
  assert.deepEqual(again.assignments.find(x=>x.functionId==='REPLY_SUGGESTIONS').choice,{provider:cloud.provider,modelId:cloud.modelId});
  assert.equal(again.paidCallsTriggered,false);assert.equal(again.routingExecution,'NOT_WIRED_TO_W43');
  const disk=readFileSync(join(dir,'function-ai-model-routing.json'),'utf8');
  assert.equal(disk.includes('confirmPaidCost'),false);
  assert.equal(disk.includes('apiKey'),false);
  await err(()=>store.select({functionId:'PRIVATE_BRAIN',provider:local.provider,modelId:local.modelId,expectedRevision:1}),409);
  await err(()=>store.select({functionId:'TRANSLATE',provider:cloud.provider,modelId:cloud.modelId,expectedRevision:2}),403);
  offered=[local];const stale=await init().current();
  assert.equal(stale.assignments.find(x=>x.functionId==='REPLY_SUGGESTIONS').status,'SOURCE_NO_LONGER_ELIGIBLE');
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('reject fake CHATGPT plan, unsupported model, arbitrary account/peer and corrupted store',async()=>{
 const dir=root();try{
  const port=createFunctionModelRoutingStore({appLocalDataRoot:dir,readEligibleModels:async()=>[local]});
  await err(()=>port.select({functionId:'TRANSLATE',provider:'CHATGPT_PLAN_SIWC',modelId:'gpt-6',expectedRevision:0}),409);
  await err(()=>port.select({functionId:'CONTACT::ALICE',provider:local.provider,modelId:local.modelId,expectedRevision:0}),422);
  await err(()=>port.select({functionId:'EXPERT_TASKS',provider:local.provider,modelId:'not/actual',expectedRevision:0}),409);
  await err(()=>port.select({functionId:'PRIVATE_BRAIN',provider:local.provider,modelId:local.modelId,expectedRevision:0,extraPaid:true}),422).catch(e=>{throw e});
  writeFileSync(join(dir,'function-ai-model-routing.json'),JSON.stringify({version:1,revision:1,assignments:{TRANSLATE:{provider:local.provider,modelId:local.modelId}},apiKey:'secret'}));
  await err(()=>port.current(),503);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
const origin='http://127.0.0.1:44778',csrf='a'.repeat(64);
async function fixture(){
 const dir=root();let active=true;const session={id:'S1',record:{kind:'WEB_LOCAL_PRIVATE',rev:1,csrf}};
 const handler=createFunctionModelRoutingHttp({sessionAuthority:{sessionFor(req){return active&&req.headers.cookie==='session=valid'?session:null}},
  webOrigin:origin,appLocalDataRoot:dir,readEligibleModels:async()=>[local,cloud]});
 const server=createServer((req,res)=>{void handler(req,res,new URL(req.url,origin))});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+server.address().port;
 const req=async(method='GET',body=null,opt={})=>{
  const res=await fetch(base+'/api/v2/model-routing',{method,
   headers:{cookie:opt.cookie||'session=valid',...(method==='POST'?{'content-type':'application/json','x-yance-csrf':opt.csrf??csrf,origin:opt.origin??origin}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {status:res.status,body:await res.json()};
 };
 return {req,revoke:()=>{active=false},close:async()=>{await new Promise(ok=>server.close(ok));rmSync(dir,{recursive:true,force:true})}};
}
test('real HTTP GET/POST/GET protected by session, CSRF, CAS and disabled sending',async()=>{
 const f=await fixture();try{
  assert.equal((await f.req('GET',null,{cookie:'session=bad'})).status,401);
  const initial=await f.req();assert.equal(initial.status,200);assert.equal(initial.body.revision,0);
  const body={functionId:'TRANSLATE',provider:local.provider,modelId:local.modelId,expectedRevision:0,confirmPaidCost:false};
  assert.equal((await f.req('POST',body,{csrf:'b'.repeat(64)})).status,403);
  assert.equal((await f.req('POST',body,{origin:'http://evil.example'})).status,403);
  assert.equal((await f.req('POST',{...body,accountId:'evil'})).status,422);
  assert.equal((await f.req('POST',body)).status,200);
  assert.equal((await f.req('POST',body)).status,409);
  const recovered=await f.req();assert.equal(recovered.body.revision,1);
  assert.equal(recovered.body.assignments.find(x=>x.functionId==='TRANSLATE').choice.modelId,'qwen3:8b');
  assert.equal(recovered.body.canSend,false);
  f.revoke();assert.equal((await f.req()).status,401);
 }finally{await f.close()}
});
