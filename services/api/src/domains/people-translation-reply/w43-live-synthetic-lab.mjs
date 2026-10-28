/** W45 explicitly invoked, synthetic LAB-only W43 Agno real inference demonstration.
 * No hosted endpoint. No W24 grant. No delivery. Never use this subprocess
 * result as an authenticated production cross-service Run attestation.
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {createPeopleTranslationReplyService} from './index.mjs';
import {createW43ContactBridge,parseW43Candidates} from './w43-contact-bridge.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const PIN='d0987e9c64b937c923b3d32bda7bd05f86a638ba';
const MODEL='qwen3:8b', PROVIDER='LLAMACPP_LOCAL_QWEN3_8B_FREE';
const sha=x=>createHash('sha256').update(x,'utf8').digest('hex');
const cases=[
  {src:'zh-CN',target:'en',reply:'zh-CN',original:'你好，最近怎么样？'},
  {src:'en',target:'zh-CN',reply:'en',original:'Hello, how are you?'},
  {src:'de',target:'zh-CN',reply:'de',original:'Guten Morgen!'},
  {src:'pl',target:'zh-CN',reply:'pl',original:'Cześć, jak się masz?'},
];
if(process.env.W45_NONPROD_LAB!=='I_ACCEPT_SYNTHETIC_ONLY')throw Error('NONPROD_EXPLICIT_LAB_OPT_IN_REQUIRED');
if(!process.env.YANCE_W43_SOURCE || !process.env.YANCE_W43_LOCAL_KEY_FILE ||
   !process.env.W45_W43_PYTHON)throw Error('PINNED_W43_SOURCE_PYTHON_AND_LOCAL_KEY_FILE_REQUIRED');
const results=[];
for(const [i,fixture] of cases.entries()){
  const identity={tenant:'SYNTHETIC_TEST_ONLY',account:'fixture-account-1',channel:'FB_PERSONAL',
    peer_id:'fake-w45-'+fixture.src.replace('-','')+'-'+i,binding_revision:'1'};
  const mid='fake-w45-original-'+i;
  const input={identity,mid,original:fixture.original,sourceLanguage:fixture.src,
    translationTarget:fixture.target,replyLanguage:fixture.reply};
  const result=spawnSync(process.env.W45_W43_PYTHON,[join(here,'w43-native-eval.py')],{
    input:JSON.stringify(input),encoding:'utf8',timeout:240000,maxBuffer:128000,
    env:{...process.env,PYTHONIOENCODING:'utf-8'}});
  const lines=(result.stdout||'').split(/\r?\n/).filter(x=>x.startsWith('W45_LAB_RESULT_JSON:'));
  let evidence;
  try{evidence=JSON.parse(lines.at(-1)?.slice('W45_LAB_RESULT_JSON:'.length)||'null');}
  catch{evidence=null;}
  const row={language:fixture.src,target:fixture.target,reply_language:fixture.reply,
    real_translation_run_id:evidence?.translation?.sdkRunId||null,
    real_reply_run_id:evidence?.receipt?.run_id||null,translation:evidence?.translation?.text||null,
    candidate_count:0, candidates:[],status:evidence?.status||'RUNNER_NOT_RETURNED',
    original:fixture.original,translation_source:null,model_quality:'HUMAN_SEMANTIC_REVIEW_NOT_COMPLETED',
    reply_quality:'HUMAN_NATURALNESS_REVIEW_NOT_COMPLETED',outbound:'DISABLED'};
  if(result.status!==0||evidence?.status!=='REAL_NATIVE_TWO_RUNS_UNREVIEWED'){
    results.push({...row,process_exit:result.status,run_failed:true});
    continue;
  }
  const t=evidence.translation,r=evidence.receipt;
  // Verify exact pinned owner SHA and full K/MID/source + actual same-runtime attestation
  // returned by this locally invoked controlled process. This is LAB trust, not W24 JWT.
  assert.equal(evidence.w43_sha,PIN);
  assert.deepEqual(evidence.identity,identity);
  assert.equal(evidence.source_mid,mid);
  assert.equal(evidence.original,fixture.original);
  assert.equal(evidence.original_sha256,sha(fixture.original));
  assert.equal(evidence.native_same_process_attested,true);
  assert.equal(t.same_runtime_attested,true);
  assert.equal(t.provider,PROVIDER);
  assert.equal(t.modelId,MODEL);
  assert.equal(t.sourceLanguage,fixture.src);
  assert.equal(t.targetLanguage,fixture.target);
  assert.equal(r.provider,PROVIDER);
  assert.equal(r.model_id,MODEL);
  assert.equal(r.purpose,'QUALITY_EVAL');
  assert.equal(r.engine,'OFFICIAL_AGNO_SDK');
  assert.equal(r.status,'AGNO_RUN_COMPLETED');
  assert.equal(r.outbound,'DISABLED');
  const service=createPeopleTranslationReplyService({
    translator:{async translate(request){
      assert.equal(request.mid,mid);
      assert.equal(request.original,fixture.original);
      assert.equal(request.targetLanguage,fixture.target);
      assert.equal(request.inputSha256,sha(fixture.original));
      return {status:'OK',translatedText:t.text,sourceLanguage:fixture.src,
        targetLanguage:fixture.target,provenance:{kind:'LOCAL_ENGINE',
          provider:t.provider,requestId:t.requestId,sourceMid:mid,
          inputSha256:request.inputSha256,modelId:t.modelId,sdkRunId:t.sdkRunId,sdkSessionId:t.sessionId}};
    }},
    attestAgnoRun:run=>run?.native_receipt===r &&
      run.provider===PROVIDER && run.sourceSHA===PIN &&
      run.originalSha256===sha(fixture.original)
  });
  const ingest=await service.ingestInbound({identity,mid,original:fixture.original,
    targetLanguage:fixture.target,source:{kind:'SYNTHETIC_FIXTURE',fixture_id:'fake-w45-lab-'+i}});
  assert.equal(ingest.translation.status,'TRANSLATED');
  assert.equal(ingest.translation.provenance.sdk_run_id,t.sdkRunId);
  let expectedPrompt='';
  const bridge=createW43ContactBridge({service,
    runW43:async({scope,prompt,thread})=>{assert.equal(thread,'default');expectedPrompt=prompt;return r;},
    attestNativeReceipt:async({receipt,scope,prompt,thread,sourceSHA})=>
      receipt===r && sourceSHA===PIN && prompt===evidence.reply_prompt &&
      sha(prompt)===evidence.reply_prompt_sha256 && thread==='default' &&
      scope.peer_id===identity.peer_id && evidence.native_same_process_attested===true});
  const accepted=await bridge.propose({identity,mid,targetLanguage:fixture.reply});
  const candidates=accepted.candidates;
  const drafts=candidates.map(x=>service.draftCandidate(identity,mid,x.id));
  for(const draft of drafts){
    assert.equal(draft.action,'INSERT_DRAFT_ONLY');
    assert.equal(draft.destination,'EXISTING_BC_COMPOSER');
    assert.equal(draft.delivery,'NOT_REQUESTED');
  }
  assert.ok(candidates.length>=0&&candidates.length<=3);
  results.push({...row,status:accepted.status,real_translation_run_id:t.sdkRunId,
    real_reply_run_id:r.run_id,translation:t.text,
    translation_source:{sdk:'Agno 3.1.10',provider:PROVIDER,model:MODEL,run_id:t.sdkRunId},
    raw_model_reply:r.original_response,candidate_count:candidates.length,
    candidates:candidates.map(x=>({text:x.text,provenance:x.provenance})),
    draft_count:drafts.length,model_quality:'UNREVIEWED',reply_quality:
      accepted.status==='MODEL_LANGUAGE_MISMATCH'?'LANGUAGE_MISMATCH_RED':'UNREVIEWED'});
}
console.log('W45_SYNTHETIC_REAL_AGNO_LAB_JSON:'+JSON.stringify({
  evidence_source_sha:PIN,backend:'EXISTING_LLAMA_CPP_127.0.0.1_11605',
  real_accounts:false,paid_calls:false,live_sends:0,
  real_runs_completed:results.filter(r=>r.real_translation_run_id&&r.real_reply_run_id).length,
  candidate_total:results.reduce((s,r)=>s+r.candidate_count,0),cases:results}));
