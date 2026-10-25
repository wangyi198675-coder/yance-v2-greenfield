// W45 nonproduction-native People / Translation / Reply service.
// Does not login, send, pay a provider, or implement its own Agent engine.
import { createHash } from 'node:crypto';
const CHANNELS = new Set(['FB_PERSONAL','FB_PAGE','WHATSAPP_PERSONAL','TELEGRAM_PERSONAL']);
const K_FIELDS = ['tenant','account','channel','peer_id','binding_revision'];
const TRANSLATION_LANGUAGES = new Set(['zh-CN','en','de','pl']);
const error = (code) => { const e = new Error(code); e.code=code; throw e; };
const exists = (x) => (typeof x === 'string' || typeof x === 'number') && String(x).trim().length>0;
const clone = (x) => structuredClone(x);
const hash = (x) => createHash('sha256').update(x,'utf8').digest('hex');

export function assertFullK(value) {
  if (!value || typeof value!=='object' || Array.isArray(value)) error('INVALID_K');
  for (const field of K_FIELDS) if(!exists(value[field])) error('MISSING_K_'+field);
  if(value.tenant!=='SYNTHETIC_TEST_ONLY') error('REAL_TENANT_FORBIDDEN');
  if(!CHANNELS.has(value.channel)) error('BAD_CHANNEL');
  // W24 alone owns binding validity, issuer, and revocation.
  return Object.fromEntries(K_FIELDS.map(field=>[field,String(value[field])]));
}
export function fullKKey(value) {
  const k=assertFullK(value);
  return JSON.stringify(K_FIELDS.map(field=>k[field])); // delimiter-safe isolation
}
function inboundShape(v) {
  if(!v || typeof v!=='object') error('INVALID_INBOUND');
  const identity=assertFullK(v.identity);
  if(typeof v.mid!=='string' || !v.mid.startsWith('fake-')) error('REAL_MID_FORBIDDEN');
  if(typeof v.original!=='string' || !v.original.length || v.original.length>20000) error('INVALID_ORIGINAL');
  if(v.source?.kind!=='SYNTHETIC_FIXTURE' || !exists(v.source.fixture_id)) error('SYNTHETIC_SOURCE_REQUIRED');
  const targetLanguage=v.targetLanguage ?? 'zh-CN';
  if(!TRANSLATION_LANGUAGES.has(targetLanguage))error('UNSUPPORTED_TARGET_LANGUAGE');
  return {identity,mid:v.mid,original:v.original,targetLanguage,source:{kind:'SYNTHETIC_FIXTURE',fixture_id:String(v.source.fixture_id)}};
}
function validTranslation(value,record) {
  if(!value || value.status!=='OK' || typeof value.translatedText!=='string' || !value.translatedText.trim()) error('TRANSLATION_OUTPUT_INVALID');
  if(!exists(value.sourceLanguage) || value.targetLanguage!==record.targetLanguage) error('TRANSLATION_LANGUAGE_INVALID');
  const p=value.provenance;
  if(!p || !['LOCAL_ENGINE','SYNTHETIC_FIXTURE'].includes(p.kind) || !exists(p.provider) || !exists(p.requestId)) error('TRANSLATION_PROVENANCE_INVALID');
  if(p.sourceMid && p.sourceMid!==record.mid) error('TRANSLATION_MID_MISMATCH');
  if(p.inputSha256 && p.inputSha256!==record.original.sha256) error('TRANSLATION_HASH_MISMATCH');
  return {
    status:p.kind==='LOCAL_ENGINE'?'TRANSLATED':'FIXTURE_ONLY',
    text:value.translatedText,source_language:String(value.sourceLanguage),target_language:record.targetLanguage,
    attempts:record.translation.attempts,retryable:false,error_code:null,
    provenance:{
      kind:p.kind,provider:String(p.provider),request_id:String(p.requestId),
      source_mid:record.mid,input_sha256:record.original.sha256,
      synthetic:p.kind==='SYNTHETIC_FIXTURE',
      model_id:typeof p.modelId==='string'?p.modelId:null,
      sdk_run_id:typeof p.sdkRunId==='string'?p.sdkRunId:null,
      sdk_session_id:typeof p.sdkSessionId==='string'?p.sdkSessionId:null
    }
  };
}

/** Native DTO layer. Translator execution and W43 Agno attestation are explicit dependencies. */
export function createPeopleTranslationReplyService({translator=null,attestAgnoRun=null,clock=()=>new Date().toISOString()}={}) {
  const records=new Map(),pending=new Map(),consumedRunIds=new Set();
  const key=(identity,mid)=>fullKKey(identity)+'\u0000'+mid;
  function find(identity,mid){const r=records.get(key(identity,mid));if(!r)error('UNKNOWN_K_OR_MID');return r;}
  const snapshot=(r)=>clone({identity:r.identity,mid:r.mid,original:r.original,translation:r.translation,candidates:r.candidates,delivery:'NOT_REQUESTED',draft_only:true});
  async function translateRecord(record){
    const recordId=key(record.identity,record.mid);
    const generation=++record.generation;
    record.candidates=[];
    record.translation={status:'PENDING',text:null,source_language:null,target_language:record.targetLanguage,attempts:record.translation.attempts+1,retryable:false,error_code:null,provenance:null};
    if(!translator || typeof translator.translate!=='function'){
      record.translation={...record.translation,status:'UNAVAILABLE',retryable:true,error_code:'LOCAL_TRANSLATOR_NOT_CONFIGURED'};
      return snapshot(record);
    }
    const attempt=record.translation.attempts;
    const task=(async()=>{
      try {
        const out=await translator.translate({identity:clone(record.identity),mid:record.mid,original:record.original.text,sourceLanguage:'auto',targetLanguage:record.targetLanguage,inputSha256:record.original.sha256,attempt});
        if(generation===record.generation)record.translation=validTranslation(out,record);
      } catch (_err) {
        if(generation===record.generation)record.translation={status:'FAILED',text:null,source_language:null,target_language:record.targetLanguage,attempts:attempt,retryable:true,error_code:'TRANSLATOR_FAILED_OR_INVALID',provenance:null};
      }
      return snapshot(record);
    })();
    pending.set(recordId,task);
    try {return await task;}
    finally {if(pending.get(recordId)===task)pending.delete(recordId);}
  }
  return Object.freeze({
    async ingestInbound(input) {
      const v=inboundShape(input),k=key(v.identity,v.mid),old=records.get(k);
      if(old){
        if(old.original.text!==v.original || old.original.source.fixture_id!==v.source.fixture_id || old.targetLanguage!==v.targetLanguage)error('MID_REPLAY_CONFLICT');
        const task=pending.get(k);if(task)await task;
        return {duplicate:true,...snapshot(old)};
      }
      const r={identity:v.identity,mid:v.mid,targetLanguage:v.targetLanguage,generation:0,original:{text:v.original,sha256:hash(v.original),source:v.source,source_mid:v.mid,received_at:clock()},
        translation:{status:'UNAVAILABLE',text:null,source_language:null,target_language:v.targetLanguage,attempts:0,retryable:true,error_code:'LOCAL_TRANSLATOR_NOT_CONFIGURED',provenance:null},candidates:[]};
      records.set(k,r);
      const result=await translateRecord(r);
      return {duplicate:false,...result};
    },
    getMessage(identity,mid){return snapshot(find(identity,mid));},
    clearCandidates(identity,mid){const r=find(identity,mid);r.candidates=[];return snapshot(r);},
    async retryTranslation(identity,mid){
      const r=find(identity,mid);
      if(!['FAILED','UNAVAILABLE'].includes(r.translation.status))error('TRANSLATION_NOT_RETRYABLE');
      return translateRecord(r);
    },
    acceptAgnoRun(identity,mid,run) {
      const r=find(identity,mid);
      if(!['TRANSLATED','FIXTURE_ONLY'].includes(r.translation.status))error('TRANSLATION_NOT_READY');
      if(typeof attestAgnoRun!=='function' || attestAgnoRun(run)!==true)error('OFFICIAL_AGNO_RUN_NOT_VERIFIED');
      if(!run || run.engine!=='OFFICIAL_AGNO_SDK' || run.status!=='COMPLETED')error('INVALID_AGNO_RUN');
      if(fullKKey(run.identity)!==fullKKey(r.identity) || run.sourceMid!==r.mid)error('AGNO_K_MID_MISMATCH');
      if(run.translationRequestId!==r.translation.provenance.request_id || run.originalSha256!==r.original.sha256)error('AGNO_STALE_TRANSLATION_OR_ORIGINAL');
      if(!exists(run.runId)||!exists(run.sessionId)||!exists(run.agentId))error('AGNO_TRACE_REQUIRED');
      if(run.provider==='LLAMACPP_LOCAL_QWEN3_8B_FREE' && consumedRunIds.has(String(run.runId)))error('AGNO_RUN_REPLAY_DENIED');
      if(run.provider){
        const accepted=(run.provider==='LLAMACPP_LOCAL_NO_PAID_API' && run.modelId==='qwen2.5:1.5b') ||
          (run.provider==='LLAMACPP_LOCAL_QWEN3_8B_FREE' && run.modelId==='qwen3:8b' && run.purpose==='QUALITY_EVAL');
        if(!accepted)error('MODEL_PROVIDER_PAIR_NOT_AUTHORIZED');
      }
      if(!Array.isArray(run.candidates) || run.candidates.length>3)error('AGNO_CANDIDATES_COUNT_INVALID');
      const seen=new Set();
      const candidates=run.candidates.map(item=>{
        if(!exists(item?.id) || typeof item.text!=='string' || !item.text.trim() || seen.has(item.id))error('AGNO_CANDIDATE_INVALID');
        seen.add(item.id);
        if(!Array.isArray(item.sources) || item.sources.length===0 || item.sources.some(s=>s.mid!==r.mid || !['ORIGINAL','TRANSLATION'].includes(s.part)))error('AGNO_CITATION_INVALID');
        return {id:String(item.id),text:item.text,action:'DRAFT_ONLY',provenance:{engine:'OFFICIAL_AGNO_SDK',run_id:String(run.runId),session_id:String(run.sessionId),agent_id:String(run.agentId),model_provider:run.provider||'TEST_FIXTURE_NO_PROVIDER',model_id:run.modelId||null,sdk_pin:run.sdkPin||null,quality_qualified:false,quality_status:run.modelId==='qwen3:8b'?'MODEL_QUALITY_UNREVIEWED':'HEALTHCHECK_ONLY',source_mid:r.mid,sources:item.sources.map(s=>({mid:s.mid,part:s.part}))}};
      });
      if(run.provider==='LLAMACPP_LOCAL_QWEN3_8B_FREE')consumedRunIds.add(String(run.runId));
      r.candidates=candidates;
      return snapshot(r);
    },
    draftCandidate(identity,mid,candidateId) {
      const r=find(identity,mid),c=r.candidates.find(c=>c.id===candidateId);
      if(!c)error('CANDIDATE_NOT_FOUND_FOR_K_MID');
      return clone({destination:'EXISTING_BC_COMPOSER',action:'INSERT_DRAFT_ONLY',identity:r.identity,source_mid:r.mid,candidate_id:c.id,text:c.text,provenance:c.provenance,delivery:'NOT_REQUESTED'});
    }
  });
}

/** Optional actual HTTP wire to a LOCAL LibreTranslate engine; no cloud fallback. */
export function createLoopbackLibreTranslateAdapter({endpoint='http://127.0.0.1:5000/translate',fetchImpl=globalThis.fetch}={}){
  const url=new URL(endpoint);
  if(url.protocol!=='http:' || !['localhost','127.0.0.1','[::1]'].includes(url.hostname) || url.pathname!=='/translate' || url.username || url.password || url.search || url.hash)error('NON_LOOPBACK_TRANSLATOR_FORBIDDEN');
  if(typeof fetchImpl!=='function')error('FETCH_REQUIRED');
  return Object.freeze({
    async translate({mid,original,inputSha256,attempt,targetLanguage='zh-CN'}) {
      if(!TRANSLATION_LANGUAGES.has(targetLanguage))error('UNSUPPORTED_TARGET_LANGUAGE');
      const resp=await fetchImpl(url.href,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({q:original,source:'auto',target:targetLanguage==='zh-CN'?'zh':targetLanguage,format:'text'}),signal:AbortSignal.timeout(5000)});
      if(!resp.ok)error('LOCAL_TRANSLATOR_HTTP_ERROR');
      const json=await resp.json();
      if(typeof json.translatedText!=='string' || !json.translatedText.trim())error('LOCAL_TRANSLATOR_RESPONSE_INVALID');
      return {status:'OK',translatedText:json.translatedText,sourceLanguage:json.detectedLanguage?.language||'und',targetLanguage,
        provenance:{kind:'LOCAL_ENGINE',provider:'LibreTranslate(loopback)',requestId:String(mid)+':attempt:'+attempt,sourceMid:mid,inputSha256}};
    }
  });
}
