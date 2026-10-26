import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PRIVATE_ROUTES,authStatus,modelCatalog,verifiedTurn,verifiedHistory,
 privateError,jsonApi,endpointBody} from '../src/private-brain-ui-contract.mjs';
const valid={ok:true,paired:true,csrfToken:'a'.repeat(64),expiresAt:1799999999000,
 canSend:false,providerAuthorized:false};
const source=(models,provider='',model='')=>({
 ok:true,authoritative:true,canSend:false,models,
 selectedProvider:provider,selectedModelId:model,secureCredentialStorage:true
});
const cloud={provider:'OPENROUTER',modelId:'openai/gpt-4o-mini',available:true,configured:true,
 keyRequired:true,billingNotice:'user charges'};
const noLocal={provider:'LLAMACPP_LOCAL_QWEN3_8B_FREE',modelId:'qwen3:8b',available:false,configured:false};
const run={ok:true,status:'COMPLETED',canSend:false,qualityQualified:false,
 threadId:'personal',requestId:'req_12345678',assistantText:'real native text',
 runId:'run_12345678',sessionId:'sess_12345678',
 modelProvider:'OPENROUTER',modelId:'openai/gpt-4o-mini'};
const h={ok:true,status:'HISTORY_PRESENT',threadId:'personal',canSend:false,
 qualityQualified:false,messages:[{role:'user',content:'Q'},{role:'assistant',content:'A'}]};
test('session cannot become paired from browser boolean or missing CSRF',()=>{
 assert.equal(authStatus({ok:true,paired:false,canSend:false,providerAuthorized:false}).authorized,false);
 assert.throws(()=>authStatus({...valid,csrfToken:undefined},1799999000000));
 assert.throws(()=>authStatus({...valid,canSend:true},1799999000000));
 assert.throws(()=>authStatus({...valid,expiresAt:0},1799999000000));
 assert.equal(authStatus(valid,1799999000000).authorized,true);
});
test('cloud-only configured remains selectable if local Qwen missing; local optional',()=>{
 const m=modelCatalog(source([cloud,noLocal],cloud.provider,cloud.modelId));
 assert.equal(m.configured,true);assert.equal(m.selectedProvider,'OPENROUTER');
 assert.equal(m.models.find(x=>x.provider==='LLAMACPP_LOCAL_QWEN3_8B_FREE').available,false);
 assert.equal(m.models.find(x=>x.provider==='OPENROUTER').available,true);
});
test('no configured model gives empty selection without making up a model',()=>{
 const m=modelCatalog(source([{...cloud,configured:false},noLocal]));
 assert.equal(m.configured,false);assert.equal(m.selectedModelId,'');
});
test('OpenAI API server-selected model allowed only from signed read catalogue',()=>{
 const m=modelCatalog(source([{...cloud,provider:'OPENAI_API',modelId:'gpt-4o-mini'}],'OPENAI_API','gpt-4o-mini'));
 assert.equal(m.selectedProvider,'OPENAI_API');
});
test('unknown/unqualified/duplicate provider/model rejected',()=>{
 assert.throws(()=>modelCatalog(source([{...cloud,provider:'UNKNOWN'}])));
 assert.throws(()=>modelCatalog(source([cloud,cloud])));
 assert.throws(()=>modelCatalog(source([noLocal],noLocal.provider,noLocal.modelId)));
 assert.throws(()=>modelCatalog({...source([cloud]),authoritative:false}));
 assert.throws(()=>modelCatalog({...source([cloud]),canSend:true}));
});
test('local Qwen selection can work without a cloud key vault signed',()=>{
 const l={...noLocal,available:true,configured:true};
 const c=modelCatalog({...source([l],l.provider,l.modelId),secureCredentialStorage:false});
 assert.equal(c.configured,true);assert.equal(c.secureCredentialStorage,false);
});
test('model result requires real W43 matching run/request/model and cannot fake completed',()=>{
 assert.equal(verifiedTurn(run,{threadId:'personal',requestId:'req_12345678',provider:cloud.provider,modelId:cloud.modelId}).role,'assistant');
 for(const x of [{status:'PAUSED'},{status:'UNKNOWN'},{canSend:true},{qualityQualified:true},
 {modelId:'qwen3:8b'},{assistantText:''},{requestId:'req_changed'}])
  assert.throws(()=>verifiedTurn({...run,...x},{threadId:'personal',requestId:'req_12345678',provider:cloud.provider,modelId:cloud.modelId}));
});
test('history read must be authoritative, no fake messages',()=>{
 assert.deepEqual(verifiedHistory(h,'personal'),h.messages);
 for(const x of [{ok:false},{status:'PENDING'},{canSend:true},{threadId:'other'},{messages:[{role:'system',content:'bad'}]}])
  assert.throws(()=>verifiedHistory({...h,...x},'personal'));
});
test('CSRF and only official private API routes qualify to write',()=>{
 assert.equal(endpointBody(PRIVATE_ROUTES.turn,{threadId:'personal',text:'hi',requestId:'req_12345678'},'a'.repeat(64)).method,'POST');
 assert.throws(()=>endpointBody(PRIVATE_ROUTES.turn,{},''));
 assert.throws(()=>endpointBody('/api/v2/send',{},'a'.repeat(64)));
});
test('fetch reads same origin no-store with no redirects; HTTP error is not success',async()=>{
 const calls=[];
 const result=await jsonApi(async(url,init)=>{calls.push({url,init});return {ok:true,json:async()=>({ok:true})}},PRIVATE_ROUTES.history);
 assert.equal(result.ok,true);assert.equal(calls[0].init.credentials,'same-origin');
 assert.equal(calls[0].init.cache,'no-store');assert.equal(calls[0].init.redirect,'error');
 await assert.rejects(()=>jsonApi(async()=>({ok:false,status:503}),PRIVATE_ROUTES.models),/PRIVATE_HTTP_503/);
 assert.match(privateError(503),/不可用/);
});
test('ONLY existing ONE BRAIN and no pairing code or second Composer mounted',()=>{
 const parent=readFileSync(new URL('../src/BCProductWorkspaceCandidate.vue',import.meta.url),'utf8');
 const brain=readFileSync(new URL('../src/BCPrivateBrainWorkspace.vue',import.meta.url),'utf8');
 assert.equal((parent.match(/<BCPrivateBrainWorkspace/g)||[]).length,1);
 assert.equal((parent.match(/<BCLocalSessionConnector/g)||[]).length,0);
 assert.equal((brain.match(/<BCPrivateBrainWorkspace/g)||[]).length,0);
 assert.equal((brain.match(/<BCNativeComposer/g)||[]).length,0);
 assert.doesNotMatch(brain,/64位配对|一次性配对码|终端.*pair|localStorage|sessionStorage/);
 assert.match(brain,/设置AI模型/);
 assert.match(brain,/OpenRouter/);assert.match(brain,/OpenAI API/);assert.match(brain,/本地 Qwen3/);
 assert.match(brain,/PRIVATE_ROUTES.history/);assert.match(brain,/PRIVATE_ROUTES.turn/);
});
