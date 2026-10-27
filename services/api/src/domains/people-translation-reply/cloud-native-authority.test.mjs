// W45 synthetic contract tests. NO real OpenRouter/OpenAI keys, SDK cloud runs or paid calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPeopleTranslationReplyService} from './index.mjs';

const h=x=>createHash('sha256').update(x).digest('hex');
const T=2_000_000_000_000, K={tenant:'SYNTHETIC_TEST_ONLY',account:'fixture-cloud-account',
 channel:'FB_PERSONAL',peer_id:'fake-cloud-peer-a',binding_revision:'1'};
const MID='fake-cloud-mid-001', ORIGINAL='Guten Morgen', TRANSLATED='早上好';
const PROV='AGNO_NATIVE_TRANSLATION';
const transcript=({mid=MID,text=ORIGINAL,targetLanguage='zh-CN',identity=K}={})=>
 ({identity,mid,original:text,targetLanguage,source:{kind:'SYNTHETIC_FIXTURE',fixture_id:'fake-cloud-only'}});
const translator=({kind='LOCAL_ENGINE',wrong=false}={})=>({async translate({mid,inputSha256,targetLanguage}){
 return {status:'OK',translatedText:TRANSLATED,sourceLanguage:'de',targetLanguage,
  provenance:{kind,provider:'SERVER_NATIVE_TRANSLATION_SOURCE',requestId:'fake-trans-req-001',
    sourceMid:mid,inputSha256,modelId:'native-translation-model',sdkRunId:'fake-translation-run',
    sdkSessionId:'fake-translation-session',translatedSha256:wrong?'WRONG':h(TRANSLATED)}}}});
const native=({provider='OPENROUTER_USER_API',modelId='vendor/model-routed',
  requestId='fake-cloud-request-1'}={})=>({
  status:'AGNO_RUN_COMPLETED',engine:'OFFICIAL_AGNO_SDK',sdk_pin:'3.1.10',
  provider,model_id:modelId,run_id:'fake-cloud-run-001',session_id:'fake-cloud-session-a',
  user_id:'fake-cloud-user-a',purpose:'QUALITY_EVAL',space:'CONTACT',request_id:requestId,
  original_response:'{"suggestions":[{"text":"Guten Morgen, wie geht es dir heute?","sources":["ORIGINAL"]}]}',
  outbound:'DISABLED',owner_source_sha:'fake-w43-native-owner-sha',
  provenance:{run_id:'fake-cloud-run-001',source:provider,model_id:modelId,purpose:'QUALITY_EVAL'}
});
const cloudRun=(receipt=native(),over={})=>({
  engine:'OFFICIAL_AGNO_SDK',status:'COMPLETED',identity:K,sourceMid:MID,
  originalSha256:h(ORIGINAL),translationSha256:h(TRANSLATED),
  translationRequestId:'fake-trans-req-001',runId:receipt.run_id,
  sessionId:receipt.session_id,userId:receipt.user_id,agentId:'w43-contact-brain',
  requestId:receipt.request_id,provider:receipt.provider,modelId:receipt.model_id,
  sdkPin:'3.1.10',native_receipt:receipt,purpose:'QUALITY_EVAL',
  sourceSHA:receipt.owner_source_sha,
  candidates:[{id:'fake-candidate-001',text:'Guten Morgen, wie geht es dir heute?',
    sources:[{mid:MID,part:'ORIGINAL'}]}],...over
});
const proof=(expected,over={})=>({verified:true,issuer:'W43_NATIVE_AGNO',
  nativePersisted:true,costScopeApproved:true,status:'COMPLETED',
  sdkPin:'3.1.10',...expected,
  accountEpoch:7,consentEpoch:3,issuedAtMs:T-1000,expiresAtMs:T+10000,...over});
async function initialized({provider,modelId,missingW43=false,missingW24=false,
  verifyW43=null,verifyW24=null,attest=()=>true,kind='LOCAL_ENGINE',now=()=>T}={}){
 const service=createPeopleTranslationReplyService({
  translator:translator({kind}),attestAgnoRun:attest,nowMs:now,
  verifyW43NativeCloudRun:missingW43?null:verifyW43||(({expected})=>proof(expected)),
  verifyW24CurrentAuthority:missingW24?null:verifyW24||(()=>({
    valid:true,accountEpoch:7,consentEpoch:3,bindingRevision:'1'}))
 });
 await service.ingestInbound(transcript());
 return {service,run:cloudRun(native({provider,modelId}))};
}

test('OpenRouter native source is accepted via W43+W24 trusted ports with NO local Qwen installation',async()=>{
 const {service,run}=await initialized({provider:'OPENROUTER_USER_API',modelId:'example/router-model'});
 const result=service.acceptAgnoRun(K,MID,run);
 assert.equal(result.candidates.length,1);
 assert.equal(result.candidates[0].provenance.model_provider,run.provider);
 assert.equal(result.candidates[0].provenance.model_id,run.modelId);
 assert.equal(result.candidates[0].provenance.source_class,'W43_NATIVE_CLOUD_ATTESTED');
 assert.equal(result.candidates[0].provenance.quality_qualified,false);
 const draft=service.draftCandidate(K,MID,result.candidates[0].id);
 assert.equal(draft.destination,'EXISTING_BC_COMPOSER');
 assert.equal(draft.action,'INSERT_DRAFT_ONLY');
 assert.equal(draft.delivery,'NOT_REQUESTED');
 assert.equal(typeof service.send,'undefined');
});
test('OpenAI native model id changes do not require static W45 Provider/model allowlist',async()=>{
 const {service,run}=await initialized({provider:'OPENAI_USER_API',modelId:'user-authorized-current-model'});
 const out=service.acceptAgnoRun(K,MID,run);
 assert.equal(out.candidates.length,1);
 assert.equal(out.candidates[0].provenance.model_id,'user-authorized-current-model');
});
test('zero native suggestions means zero, never default recommendations',async()=>{
 const {service,run}=await initialized();
 const out=service.acceptAgnoRun(K,MID,{...run,candidates:[]});
 assert.deepEqual(out.candidates,[]);
});
test('without W43 persisted native receipt verifier cloud is strictly blocked',async()=>{
 const {service,run}=await initialized({missingW43:true});
 assert.throws(()=>service.acceptAgnoRun(K,MID,run),/W43_W24_CLOUD_ATTESTATION_PORTS_REQUIRED/);
 assert.deepEqual(service.getMessage(K,MID).candidates,[]);
});
test('without W24 current authority verifier Cloud is strictly blocked',async()=>{
 const {service,run}=await initialized({missingW24:true});
 assert.throws(()=>service.acceptAgnoRun(K,MID,run),/W43_W24_CLOUD_ATTESTATION_PORTS_REQUIRED/);
});
test('W43 forged source and run fields are rejected before trusted verifier',async()=>{
 for(const edit of [
  r=>({...r,provider:'SPOOFED_PROVIDER'}),
  r=>({...r,runId:'forged'}),
  r=>({...r,sessionId:'different'}),
  r=>({...r,userId:'fake-wrong-user'}),
  r=>({...r,originalSha256:'wrong'}),
  r=>({...r,translationSha256:'wrong'}),
  r=>({...r,translationRequestId:'stale'}),
  r=>({...r,native_receipt:{...r.native_receipt,provenance:{...r.native_receipt.provenance,model_id:'wrong'}}}),
  r=>({...r,native_receipt:{...r.native_receipt,outbound:'ENABLED'}})
 ]){
  const {service,run}=await initialized();
  assert.throws(()=>service.acceptAgnoRun(K,MID,edit(run)),/CLOUD_|STALE_TRANSLATION_OR_ORIGINAL/);
  assert.equal(service.getMessage(K,MID).candidates.length,0);
 }
});
test('changed K or MID cannot use a foreign native cloud receipt',async()=>{
 const {service,run}=await initialized();
 for(const changed of [{identity:{...K,peer_id:'fake-other'}},{identity:{...K,account:'fixture-other'}},
   {sourceMid:'fake-other-mid'}]){
  assert.throws(()=>service.acceptAgnoRun(K,MID,{...run,...changed}),/AGNO_K_MID_MISMATCH/);
 }
});
test('expired, future, overlong or unsigned W43 Cloud proofs are denied',async()=>{
 for(const over of [
  {expiresAtMs:T-1},{issuedAtMs:T+1},{expiresAtMs:T+60*60*1000},
  {verified:false},{nativePersisted:false},{costScopeApproved:false},
  {modelId:'forged-model'},{requestId:'different-request'},{provider:'forged-provider'},
  {consentEpoch:0},{identity:{...K,peer_id:'fake-other'}}
 ]){
  const {service,run}=await initialized({verifyW43:({expected})=>proof(expected,over)});
  assert.throws(()=>service.acceptAgnoRun(K,MID,run),/W43_CLOUD_NATIVE_PROOF_INVALID_OR_EXPIRED/);
 }
});
test('current W24 grant, revocation, consent, account or binding mismatch blocks native Cloud proof',async()=>{
 for(const current of [
  {valid:false,accountEpoch:7,consentEpoch:3,bindingRevision:'1'},
  {valid:true,accountEpoch:8,consentEpoch:3,bindingRevision:'1'},
  {valid:true,accountEpoch:7,consentEpoch:4,bindingRevision:'1'},
  {valid:true,accountEpoch:7,consentEpoch:3,bindingRevision:'2'}
 ]){
  const {service,run}=await initialized({verifyW24:()=>current});
  assert.throws(()=>service.acceptAgnoRun(K,MID,run),/W24_CLOUD_AUTHORITY_REVOKED_OR_STALE/);
 }
});
test('cloud W43 signed Run ID can only be consumed once; no cross-account replay',async()=>{
 const {service,run}=await initialized();
 assert.equal(service.acceptAgnoRun(K,MID,run).candidates.length,1);
 assert.throws(()=>service.acceptAgnoRun(K,MID,run),/AGNO_RUN_REPLAY_DENIED/);
});
test('cloud draft is blocked after expiry or new W24 revoked Consent',async()=>{
 let now=T,live=true;
 const {service,run}=await initialized({now:()=>now,
  verifyW24:()=>({valid:live,accountEpoch:7,consentEpoch:3,bindingRevision:'1'})});
 service.acceptAgnoRun(K,MID,run);
 live=false;
 assert.throws(()=>service.draftCandidate(K,MID,'fake-candidate-001'),/W24_DRAFT_CURRENT_AUTHORITY_REVOKED/);
 live=true;now=T+10000;
 assert.throws(()=>service.draftCandidate(K,MID,'fake-candidate-001'),/CLOUD_DRAFT_AUTHORITY_EXPIRED/);
});
test('Cloud result can never be accepted solely from generic test attestation',async()=>{
 const {service,run}=await initialized({missingW43:true,attest:()=>true});
 assert.throws(()=>service.acceptAgnoRun(K,MID,run),/W43_W24_CLOUD_ATTESTATION_PORTS_REQUIRED/);
});
test('cloud translator without official W43 persisted source is fail-closed and never fabricates Chinese text',async()=>{
 const service=createPeopleTranslationReplyService({translator:translator({kind:PROV})});
 const row=await service.ingestInbound(transcript());
 assert.equal(row.translation.status,'FAILED');assert.equal(row.translation.text,null);
});
test('W43 native translation + W24 epoch verified can carry genuine cloud translation without local Qwen',async()=>{
 const server=createPeopleTranslationReplyService({translator:translator({kind:PROV}),nowMs:()=>T,
  verifyW43NativeTranslation:({expected})=>({verified:true,issuer:'W43_NATIVE_AGNO',
    nativePersisted:true,costScopeApproved:true,status:'COMPLETED',sdkPin:'3.1.10',
    issuedAtMs:T-1000,...expected,expiresAtMs:T+1000,accountEpoch:7,consentEpoch:3}),
  verifyW24CurrentAuthority:()=>({valid:true,accountEpoch:7,consentEpoch:3,bindingRevision:1})});
 const row=await server.ingestInbound(transcript());
 assert.equal(row.translation.status,'TRANSLATED');
 assert.equal(row.translation.text,'早上好');
 assert.equal(row.translation.provenance.verified_native,true);
 assert.equal(row.candidates.length,0);
});
test('a changed translation hash or expired source cannot pass native provenance',async()=>{
 for(const bad of [{translatedSha256:'bad'},{expiresAtMs:T-1}]){
 const server=createPeopleTranslationReplyService({nowMs:()=>T,translator:translator({kind:PROV}),
   verifyW43NativeTranslation:({expected})=>({verified:true,issuer:'W43_NATIVE_AGNO',
     nativePersisted:true,costScopeApproved:true,status:'COMPLETED',sdkPin:'3.1.10',
     issuedAtMs:T-1000,...expected,expiresAtMs:T+1000,accountEpoch:7,consentEpoch:3,...bad}),
   verifyW24CurrentAuthority:()=>({valid:true,accountEpoch:7,consentEpoch:3,bindingRevision:'1'})});
 const row=await server.ingestInbound(transcript());
 assert.equal(row.translation.status,'FAILED');
 assert.equal(row.translation.text,null);
 }
});

test('actual W45 W43 contact bridge accepts future cloud only through BOTH authoritative verification ports',async()=>{
 const {w43ScopedIds,createW43ContactBridge}=await import('./w43-contact-bridge.mjs');
 const ids=w43ScopedIds(K);
 const base=native({provider:'OPENROUTER_USER_API',modelId:'future-approved/model'});
 const receipt={...base,user_id:ids.userId,session_id:ids.sessionId,
    owner_source_sha:'fake-w43-native-owner-sha',request_id:'fake-cloud-request-1',
    original_response:'{"suggestions":[{"text":"Guten Morgen, wie geht es dir heute?","sources":["ORIGINAL"]}]}'};
 const service=createPeopleTranslationReplyService({
  translator:translator(),attestAgnoRun:run=>run.native_receipt===receipt,
  verifyW43NativeCloudRun:({expected})=>proof(expected),
  verifyW24CurrentAuthority:()=>({valid:true,accountEpoch:7,consentEpoch:3,bindingRevision:'1'}),
  nowMs:()=>T});
 await service.ingestInbound(transcript());
 const bridge=createW43ContactBridge({service,runW43:async({scope,thread,prompt})=>{
  assert.equal(scope.account,K.account);assert.equal(thread,'default');assert.match(prompt,/Guten Morgen/);
  return receipt;},
  attestNativeReceipt:async({receipt:actual,sourceSHA})=>
    actual===receipt && sourceSHA==='fake-w43-native-owner-sha'});
 const result=await bridge.propose({identity:K,mid:MID,targetLanguage:'de'});
 assert.equal(result.status,'CANDIDATES_PRESENT');
 assert.equal(result.candidates.length,1);
 assert.equal(result.candidates[0].provenance.model_provider,'OPENROUTER_USER_API');
 assert.equal(result.candidates[0].provenance.quality_qualified,false);
 const draft=service.draftCandidate(K,MID,result.candidates[0].id);
 assert.equal(draft.delivery,'NOT_REQUESTED');
});
test('cloud contact bridge without W43 official source SHA cannot treat callback as signature',async()=>{
 const {createW43ContactBridge,w43ScopedIds}=await import('./w43-contact-bridge.mjs');
 const ids=w43ScopedIds(K);
 const receipt={...native(),user_id:ids.userId,session_id:ids.sessionId,owner_source_sha:undefined};
 const service=createPeopleTranslationReplyService({translator:translator(),attestAgnoRun:()=>true,
  verifyW43NativeCloudRun:({expected})=>proof(expected),
  verifyW24CurrentAuthority:()=>({valid:true,accountEpoch:7,consentEpoch:3,bindingRevision:'1'}),nowMs:()=>T});
 await service.ingestInbound(transcript());
 const bridge=createW43ContactBridge({service,runW43:async()=>receipt,attestNativeReceipt:async()=>true});
 await assert.rejects(bridge.propose({identity:K,mid:MID,targetLanguage:'de'}),/W43_RECEIPT_IDENTITY_OR_PROVIDER_INVALID/);
 assert.equal(service.getMessage(K,MID).candidates.length,0);
});
