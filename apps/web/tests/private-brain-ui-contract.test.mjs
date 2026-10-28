// QA-ONLY replacement for stale lowercase provider mocks, NOT an Owner commit.
// Reproduces W47 signed public/auth DTO. No Cloud API or real key.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PRIVATE_ROUTES,authStatus,publicModelCatalog,modelCatalog,confirmedModelSelection,
 verifiedTurn,verifiedHistory,privateError,jsonApi,endpointBody}
 from '../src/private-brain-ui-contract.mjs';
const CLOUD='OPENROUTER_USER_API',OPENAI='OPENAI_USER_API',LOCAL='LLAMACPP_LOCAL_QWEN3_8B_FREE',SIWC='CHATGPT_PLAN_SIWC';
const names=[
 {provider:CLOUD,displayName:'OpenRouter',requiresUserApiKey:true,requiresLocalModel:false},
 {provider:OPENAI,displayName:'OpenAI API',requiresUserApiKey:true,requiresLocalModel:false},
 {provider:LOCAL,displayName:'Local Qwen3',requiresUserApiKey:false,requiresLocalModel:true},
 {provider:SIWC,displayName:'ChatGPT',requiresUserApiKey:false,requiresLocalModel:false}
];
const pub={ok:true,providers:names,authoritative:false,
 actualAvailability:'CHECK_AUTHORIZED_MODEL_CONFIG',canSend:false};
const providerModels=[
 {provider:CLOUD,modelId:'openai/gpt-4o-mini',configured:true,available:true,keyRequired:true,billingNotice:'Paid user API'},
 {provider:OPENAI,modelId:'gpt-4o-mini',configured:false,available:false,keyRequired:true,billingNotice:'API bill'},
 {provider:LOCAL,modelId:'qwen3:8b',configured:false,available:false,keyRequired:false,billingNotice:'local optional'}
];
const config=(provider='',modelId='',models=providerModels)=>({
 ok:true,authoritative:true,models,selectedProvider:provider,selectedModelId:modelId,
 secureCredentialStorage:false,canSend:false,providerAuthorized:false,credentialsExposed:false
});
const selected={provider:CLOUD,modelId:'openai/gpt-4o-mini'};
const run={ok:true,status:'COMPLETED',canSend:false,qualityQualified:false,threadId:'personal',
 requestId:'req_12345678',assistantText:'real W43 answer',runId:'run_12345678',
 sessionId:'sess_12345678',modelProvider:CLOUD,modelId:'openai/gpt-4o-mini'};
const history={ok:true,status:'HISTORY_PRESENT',threadId:'personal',
 canSend:false,qualityQualified:false,messages:[{role:'user',content:'Question'},{role:'assistant',content:'Answer'}]};
test('W47 public SDK model sources include optional official ChatGPT plan',()=>{
 const p=publicModelCatalog(pub);
 assert.deepEqual(p.map(x=>x.id),[CLOUD,OPENAI,LOCAL,SIWC]);
 assert.equal(p[3].requiresUserApiKey,false);
 assert.equal(p[0].requiresLocalModel,false);assert.equal(p[2].requiresLocalModel,true);
 assert.throws(()=>publicModelCatalog({...pub,authoritative:true}));
});
test('W47 Cloud-only authorized config works with no local Qwen',()=>{
 const m=modelCatalog(config(CLOUD,'openai/gpt-4o-mini'),publicModelCatalog(pub));
 assert.equal(m.configured,true);assert.equal(m.selectedProvider,CLOUD);
 assert.equal(m.models.find(x=>x.provider===LOCAL).available,false);
 assert.equal(m.secureCredentialStorage,false);
});
test('No model configured means no selected model, no fabricated readiness',()=>{
 assert.equal(modelCatalog(config()).configured,false);
 assert.throws(()=>modelCatalog(config(LOCAL,'qwen3:8b')));
});
test('OpenAI API provider may be selected if current signed W47 config says READY',()=>{
 const item={...providerModels[1],configured:true,available:true};
 const m=modelCatalog(config(OPENAI,'gpt-4o-mini',[item]));
 assert.equal(m.selectedProvider,OPENAI);
});
test('Official ChatGPT plan is a no-API-Key real-model candidate',()=>{
 const item={provider:SIWC,modelId:'gpt-test',configured:true,
  available:true,keyRequired:false,billingNotice:'Official account sharing'};
 const c=config(SIWC,'gpt-test',[item]);
 const result=modelCatalog(c,publicModelCatalog(pub));
 assert.equal(result.configured,true);
 assert.equal(confirmedModelSelection(c,{provider:SIWC,modelId:'gpt-test'}).configured,true);
 assert.equal(verifiedTurn({...run,modelProvider:SIWC,modelId:'gpt-test'},
  {threadId:'personal',requestId:run.requestId,provider:SIWC,modelId:'gpt-test'}).role,'assistant');
 assert.throws(()=>modelCatalog(config(SIWC,'gpt-test',[{...item,keyRequired:true}])));
});
test('POST selection must match exact authoritative W47 private config receipt',()=>{
 assert.equal(confirmedModelSelection(config(CLOUD,'openai/gpt-4o-mini'),selected).configured,true);
 assert.throws(()=>confirmedModelSelection(config(),selected));
 assert.throws(()=>confirmedModelSelection(config(OPENAI,'gpt-4o-mini'),selected));
});
test('Legacy lowercase provider is rejected and cannot sneak into new W47 DTO',()=>{
 assert.throws(()=>publicModelCatalog({...pub,providers:[{...names[0],provider:'openrouter'},...names.slice(1)]}));
 assert.throws(()=>modelCatalog(config('', '',[{...providerModels[0],provider:'openrouter'}])));
 assert.throws(()=>endpointBody(PRIVATE_ROUTES.selection,{provider:'openrouter',modelId:'openai/gpt-4o-mini'},'a'.repeat(64)));
});
test('Wrong readiness, duplicate model/selection, missing explicit authority rejected',()=>{
 assert.throws(()=>modelCatalog(config('','',[{...providerModels[0],available:true,configured:false}])));
 assert.throws(()=>modelCatalog(config('','',[providerModels[0],providerModels[0]])));
 assert.throws(()=>modelCatalog({...config(),authoritative:false}));
 assert.throws(()=>modelCatalog({...config(),providerAuthorized:true}));
 assert.throws(()=>modelCatalog({...config(),credentialsExposed:true}));
});
test('Never reflect cloud secret/key or private path from W47 HTTP',()=>{
 for(const field of ['apiKey','secret','token','password','credentialHandle','privatePath']){
  assert.throws(()=>modelCatalog({...config(),[field]:'sensitive'}));
  assert.throws(()=>publicModelCatalog({...pub,[field]:'sensitive'}));
 }
});
test('Native official W43 Run provider must equal exact W47 selected ID',()=>{
 assert.equal(verifiedTurn(run,{threadId:'personal',requestId:'req_12345678',...selected}).role,'assistant');
 for(const fail of [{modelProvider:'openrouter'},{modelProvider:OPENAI},{status:'PAUSED'},
  {runId:'fake'},{sessionId:''},{requestId:'req_OTHER'},{modelId:'qwen3:8b'},
  {canSend:true},{qualityQualified:true},{assistantText:''}]){
  assert.throws(()=>verifiedTurn({...run,...fail},{threadId:'personal',requestId:'req_12345678',...selected}));
 }
});
test('Original persisted history only; cross-thread, untrusted status and forged roles reject',()=>{
 assert.equal(verifiedHistory(history,'personal').length,2);
 for(const f of [{ok:false},{threadId:'unrelated'},{status:'UNKNOWN'},{canSend:true},
  {qualityQualified:true},{messages:[{role:'system',content:'hidden'}]}])
  assert.throws(()=>verifiedHistory({...history,...f},'personal'));
});
test('POST only actual selected W47 model fields and original private turn with csrf',()=>{
 const r=endpointBody(PRIVATE_ROUTES.selection,selected,'a'.repeat(64));
 assert.deepEqual(JSON.parse(r.body),selected);
 assert.throws(()=>endpointBody(PRIVATE_ROUTES.selection,{...selected,apiKey:'FAKE'},'a'.repeat(64)));
 assert.throws(()=>endpointBody(PRIVATE_ROUTES.selection,selected,''));
 assert.throws(()=>endpointBody('/api/v2/private-brain/credentials',{},'a'.repeat(64)));
});
test('Unpaired, revoked and expired local session cannot authorize private model',()=>{
 const s={ok:true,paired:true,canSend:false,providerAuthorized:false,
  csrfToken:'a'.repeat(64),expiresAt:Date.now()+300000};
 assert.equal(authStatus(s).authorized,true);
 assert.equal(authStatus({...s,paired:false}).authorized,false);
 assert.throws(()=>authStatus({...s,csrfToken:''}));
 assert.throws(()=>authStatus({...s,expiresAt:0}));
 assert.throws(()=>authStatus({...s,canSend:true}));
});
test('Same origin credentials/caching and HTTP errors fail closed',async()=>{
 const logs=[];
 await jsonApi(async(u,opts)=>{logs.push({u,opts});return {ok:true,json:async()=>({ok:true})}},PRIVATE_ROUTES.config);
 assert.equal(logs[0].opts.credentials,'same-origin');
 assert.equal(logs[0].opts.cache,'no-store');
 await assert.rejects(()=>jsonApi(async()=>({ok:false,status:401}),PRIVATE_ROUTES.config),/PRIVATE_HTTP_401/);
 assert.match(privateError(409),/冲突/);
});
test('Exactly one PRIVATE workspace and no browser API key form or second Composer',()=>{
 const parent=readFileSync(new URL('../src/BCProductWorkspaceCandidate.vue',import.meta.url),'utf8');
 const brain=readFileSync(new URL('../src/BCPrivateBrainWorkspace.vue',import.meta.url),'utf8');
 assert.equal((parent.match(/<BCPrivateBrainWorkspace/g)||[]).length,1);
 assert.equal((brain.match(/<BCNativeComposer/g)||[]).length,0);
 assert.doesNotMatch(brain,/type="password"|localStorage|sessionStorage|PRIVATE_ROUTES.credential/);
 assert.match(brain,/PRIVATE_ROUTES.catalog/);assert.match(brain,/PRIVATE_ROUTES.config/);
});
