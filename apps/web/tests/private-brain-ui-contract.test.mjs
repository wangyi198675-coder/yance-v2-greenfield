import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PRIVATE_ROUTES,authStatus,publicModelCatalog,modelCatalog,
 confirmedModelSelection,verifiedTurn,verifiedHistory,privateError,jsonApi,endpointBody
} from '../src/private-brain-ui-contract.mjs';
const publicDto={ok:true,authoritative:false,canSend:false,
 actualAvailability:'CHECK_AUTHORIZED_MODEL_CONFIG',
 providers:[
  {provider:'openrouter',displayName:'OpenRouter',requiresUserApiKey:true,requiresLocalModel:false},
  {provider:'openai',displayName:'OpenAI API',requiresUserApiKey:true,requiresLocalModel:false},
  {provider:'local',displayName:'Local Qwen3',requiresUserApiKey:false,requiresLocalModel:true}
 ]};
const sources=[
 {provider:'openrouter',configured:true,available:true,status:'READY',models:['openai/gpt-4o-mini']},
 {provider:'openai',configured:false,available:false,status:'SETUP_REQUIRED',models:['gpt-4o-mini']},
 {provider:'local',configured:false,available:false,status:'MODEL_UNAVAILABLE',models:['qwen3:8b']}
];
const make=(selection=null,src=sources)=>({ok:true,selected:selection,sources:src,canSend:false,
 providerAuthorized:false,credentialsExposed:false});
const select={provider:'openrouter',modelId:'openai/gpt-4o-mini'};
const turn={ok:true,status:'COMPLETED',canSend:false,qualityQualified:false,threadId:'personal',
 requestId:'req_12345678',assistantText:'native text',runId:'run_12345678',
 sessionId:'sess_12345678',modelProvider:'OPENROUTER_USER_API',modelId:'openai/gpt-4o-mini'};
const history={ok:true,status:'HISTORY_PRESENT',threadId:'personal',canSend:false,
 qualityQualified:false,messages:[{role:'user',content:'question'},{role:'assistant',content:'native answer'}]};
test('exact W47 publicly descriptive catalog is never actual ready or priced',()=>{
 const p=publicModelCatalog(publicDto);assert.equal(p.length,3);
 assert.deepEqual(p.map(x=>x.id),['openrouter','openai','local']);
 assert.throws(()=>publicModelCatalog({...publicDto,authoritative:true}));
 assert.throws(()=>publicModelCatalog({...publicDto,canSend:true}));
});
test('W47 private config lower case openrouter/cloud-only is valid without local Qwen',()=>{
 const p=publicModelCatalog(publicDto);
 const m=modelCatalog(make(select),p);
 assert.equal(m.configured,true);assert.equal(m.selectedProvider,'openrouter');
 assert.equal(m.models.find(x=>x.provider==='local').available,false);
 assert.equal(m.models.find(x=>x.provider==='openrouter').modelId,'openai/gpt-4o-mini');
 assert.equal(m.secureCredentialStorage,false); // NO browser vault writes
});
test('no chosen model remains setup required; optional local Qwen can be selected only if READY',()=>{
 assert.equal(modelCatalog(make(),publicModelCatalog(publicDto)).configured,false);
 assert.throws(()=>modelCatalog(make({provider:'local',modelId:'qwen3:8b'})));
 const ready=make({provider:'local',modelId:'qwen3:8b'},
  [{provider:'local',configured:true,available:true,status:'READY',models:['qwen3:8b']}]);
 assert.equal(modelCatalog(ready).selectedProvider,'local');
});
test('OpenAI API can be selected only from actual W47 signed private sources',()=>{
 const m=modelCatalog(make({provider:'openai',modelId:'gpt-4o-mini'},
 [{provider:'openai',configured:true,available:true,status:'READY',models:['gpt-4o-mini']}]));
 assert.equal(m.selectedProvider,'openai');
 assert.throws(()=>modelCatalog(make({provider:'openai',modelId:'gpt-4o-mini'})));
});
test('W47 model selection POST receipt and GET must match actual selected pair',()=>{
 assert.equal(confirmedModelSelection(make(select),select).configured,true);
 for(const r of [make(),make({provider:'openai',modelId:'gpt-4o-mini'}),{...make(select),credentialsExposed:true}])
  assert.throws(()=>confirmedModelSelection(r,select));
});
test('W47 rejects invalid provider, status, extra sources, stale selected and duplicates',()=>{
 assert.throws(()=>modelCatalog(make(null,[{...sources[0],provider:'OPENROUTER'}])));
 assert.throws(()=>modelCatalog(make(null,[{...sources[0],status:'READY',available:false}])));
 assert.throws(()=>modelCatalog(make(null,[sources[0],sources[0]])));
 assert.throws(()=>modelCatalog({...make(),canSend:true}));
 assert.throws(()=>modelCatalog({...make(),providerAuthorized:true}));
});
test('no secret, token, credential or key bytes can be accepted from HTTP model DTO',()=>{
 for(const field of ['apiKey','credentialHandle','privatePath','secret','token','password']){
  assert.throws(()=>modelCatalog({...make(select),[field]:'confidential_value'}));
  assert.throws(()=>publicModelCatalog({...publicDto,[field]:'confidential_value'}));
 }
});
test('real signed turn must match native selected provider/model and original request',()=>{
 assert.equal(verifiedTurn(turn,{threadId:'personal',requestId:'req_12345678',...select}).role,'assistant');
 for(const x of [{status:'PAUSED'},{status:'UNKNOWN'},{modelProvider:'OPENAI_USER_API'},
  {modelProvider:'OPENROUTER_FAKE'},
  {modelId:'qwen3:8b'},{canSend:true},{qualityQualified:true},{assistantText:''},
  {requestId:'req_CHANGED'}])
  assert.throws(()=>verifiedTurn({...turn,...x},{threadId:'personal',requestId:'req_12345678',...select}));
});
test('history remains sole source and rejects fabricated or cross-thread content',()=>{
 assert.equal(verifiedHistory(history,'personal').length,2);
 for(const x of [{ok:false},{status:'PAUSED'},{threadId:'another'},{canSend:true},
  {messages:[{role:'system',content:'prompt'}]}])
  assert.throws(()=>verifiedHistory({...history,...x},'personal'));
});
test('W47 endpoint shape: selection only {provider,modelId}, no plaintext credential route',()=>{
 const body=endpointBody(PRIVATE_ROUTES.selection,select,'a'.repeat(64));
 assert.equal(body.method,'POST');assert.deepEqual(JSON.parse(body.body),select);
 assert.equal(PRIVATE_ROUTES.catalog,'/api/v2/private-brain/model-catalog');
 assert.equal(PRIVATE_ROUTES.config,'/api/v2/private-brain/model-config');
 assert.equal(PRIVATE_ROUTES.selection,'/api/v2/private-brain/model-selection');
 assert.equal(Object.hasOwn(PRIVATE_ROUTES,'credential'),false);
 assert.equal(Object.hasOwn(PRIVATE_ROUTES,'models'),false);
 assert.throws(()=>endpointBody(PRIVATE_ROUTES.selection,{...select,apiKey:'sk-test'},'a'.repeat(64)));
 assert.throws(()=>endpointBody('/api/v2/private-brain/credentials',{},'a'.repeat(64)));
 assert.throws(()=>endpointBody(PRIVATE_ROUTES.selection,select,''));
});
test('session is server owned, no browser boolean implies authorization',()=>{
 const ok={ok:true,paired:true,csrfToken:'a'.repeat(64),expiresAt:Date.now()+300000,
  canSend:false,providerAuthorized:false};
 assert.equal(authStatus(ok).authorized,true);
 assert.equal(authStatus({ok:true,paired:false,canSend:false,providerAuthorized:false}).authorized,false);
 assert.throws(()=>authStatus({...ok,csrfToken:''}));
 assert.throws(()=>authStatus({...ok,canSend:true}));
});
test('same-origin session cookie required and failed HTTP cannot be model success',async()=>{
 const calls=[];
 await jsonApi(async(url,init)=>{calls.push({url,init});return {ok:true,json:async()=>({ok:true})}},PRIVATE_ROUTES.config);
 assert.equal(calls[0].init.credentials,'same-origin');assert.equal(calls[0].init.cache,'no-store');
 assert.equal(calls[0].init.redirect,'error');
 await assert.rejects(()=>jsonApi(async()=>({ok:false,status:401}),PRIVATE_ROUTES.config),/PRIVATE_HTTP_401/);
 assert.match(privateError(503),/不可用/);
});
test('sole BRAIN consumes W47 names and no API key input, terminal pairing, second Composer/sender',()=>{
 const brain=readFileSync(new URL('../src/BCPrivateBrainWorkspace.vue',import.meta.url),'utf8');
 const parent=readFileSync(new URL('../src/BCProductWorkspaceCandidate.vue',import.meta.url),'utf8');
 assert.equal((parent.match(/<BCPrivateBrainWorkspace/g)||[]).length,1);
 assert.doesNotMatch(parent,/BCLocalSessionConnector/);
 assert.doesNotMatch(brain,/BCLocalSessionConnector|BCNativeComposer|MessageDelivery|localStorage|sessionStorage/);
 assert.doesNotMatch(brain,/type="password"|<input[^>]*api.?key/i);
 assert.doesNotMatch(brain,/PRIVATE_ROUTES.credential|PRIVATE_ROUTES.models|saveKey\(/);
 assert.match(brain,/PRIVATE_ROUTES.catalog/);assert.match(brain,/PRIVATE_ROUTES.config/);
 assert.match(brain,/PRIVATE_ROUTES.history/);assert.match(brain,/PRIVATE_ROUTES.turn/);
});

test('W43 SDK cloud and local EXACT native provider receipt IDs, distinct from W47 selections',()=>{
 const cases=[
  {provider:'openrouter',modelId:'openai/gpt-4o-mini',native:'OPENROUTER_USER_API'},
  {provider:'openai',modelId:'gpt-4o-mini',native:'OPENAI_USER_API'},
  {provider:'local',modelId:'qwen3:8b',native:'LLAMACPP_LOCAL_QWEN3_8B_FREE'}
 ];
 for(const row of cases){
  const receipt={...turn,modelProvider:row.native,modelId:row.modelId};
  const request={threadId:'personal',requestId:'req_12345678',provider:row.provider,modelId:row.modelId};
  assert.equal(verifiedTurn(receipt,request).modelProvider,row.native);
  assert.throws(()=>verifiedTurn({...receipt,modelProvider:row.provider},request),/PRIVATE_SIGNED_TURN_MISMATCH/);
 }
});
