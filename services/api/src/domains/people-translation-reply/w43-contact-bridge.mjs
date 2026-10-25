// W45 native bridge: consumes W43's real Agno Run receipt; does NOT own any model/agent.
import {createHash} from 'node:crypto';
import {assertFullK} from './index.mjs';
export const LOCAL_W43_PROVIDER='LLAMACPP_LOCAL_NO_PAID_API';
export const LANGUAGES=Object.freeze({'zh-CN':'中文',en:'English',de:'Deutsch',pl:'polski'});
const W43_SHA='d0987e9c64b937c923b3d32bda7bd05f86a638ba';
export const LOCAL_QWEN3_PROVIDER='LLAMACPP_LOCAL_QWEN3_8B_FREE';
const err=code=>{const e=new Error(code);e.code=code;throw e;};
const digest=x=>createHash('sha256').update(x,'utf8').digest('hex');
const keyOK=x=>typeof x==='string' && /^[A-Za-z0-9_.-]{1,160}$/.test(x);
// The W43 official SDK Scope hashes Python json.dumps tuple with spaces and ensure_ascii=True.
// Restrict to ASCII synthetic IDs so parity is exact. No implied W24 permission issuance.
export function w43ScopedIds(identity,thread='default'){
  const k=assertFullK(identity);
  if(!k.account.startsWith('fixture-')||!k.peer_id.startsWith('fake-') ||
     ![k.account,k.peer_id,thread].every(keyOK)||!/^[1-9]\d*$/.test(k.binding_revision))err('W43_FIXTURE_SCOPE_REQUIRED');
  const revision=Number(k.binding_revision);
  if(!Number.isSafeInteger(revision)||revision<1)err('W43_BINDING_REVISION_INVALID');
  const tuple=[k.tenant,k.account,k.channel,k.peer_id,revision];
  const py=v=>Array.isArray(v)?'['+v.map(py).join(', ')+']':JSON.stringify(v);
  return Object.freeze({
    userId:'w43-contact-user-'+digest(py(tuple)),
    sessionId:'w43-contact-session-'+digest(py([tuple,thread])),
    thread,
    scope:Object.freeze({tenant:k.tenant,account:k.account,space:'CONTACT',
      channel:k.channel,peer_id:k.peer_id,binding_revision:revision})
  });
}
export function w43ReplyPrompt({original,translation,targetLanguage='de'}){
  if(!Object.hasOwn(LANGUAGES,targetLanguage))err('UNSUPPORTED_LANGUAGE');
  if(typeof original!=='string'||typeof translation!=='string')err('INVALID_PROMPT_CONTEXT');
  const language={"zh-CN":"Chinese",en:"English",de:"German",pl:"Polish"}[targetLanguage];
  // The verified translation stays in W45 provenance; do not append its Chinese
  // text to this reply instruction, because the actual model copied the gloss.
  const prompt='fake-/no_think As a fictional friend, reply in '+language+' only. Never echo or translate. ONLY JSON {"suggestions":[{"text":"...","sources":["ORIGINAL"]}]}. Message:'+original;
  if(prompt.length>200)err('W43_PROMPT_200_CHAR_CAP');
  if(/[\u0000-\u001f|]/.test(prompt))err('W43_PROMPT_UNSUPPORTED_CHARACTER');
  return prompt;
}
export function parseW43Candidates({receipt,mid,replyLanguage=null,sourceOriginal=null,sourceTranslation=null}){
  if(replyLanguage!==null&&!Object.hasOwn(LANGUAGES,replyLanguage))err('UNSUPPORTED_LANGUAGE');
  if(!receipt||receipt.status!=='AGNO_RUN_COMPLETED'||!receipt.original_response)return {status:'RUN_UNAVAILABLE',candidates:[]};
  if(typeof receipt.original_response!=='string'||receipt.original_response.length>8000)return {status:'OUTPUT_UNSTRUCTURED',candidates:[]};
  let output;
  try {output=JSON.parse(receipt.original_response);}catch{return {status:'OUTPUT_UNSTRUCTURED',candidates:[]};}
  if(!output||!Array.isArray(output.suggestions)||output.suggestions.length>3)return {status:'OUTPUT_UNSTRUCTURED',candidates:[]};
  const unique=new Set(),suggestions=[];
  for(let i=0;i<output.suggestions.length;i++){
    const item=output.suggestions[i];
    if(!item||typeof item.text!=='string'||!item.text.trim()||item.text.length>650 ||
       !Array.isArray(item.sources)||item.sources.length===0 ||
       item.sources.some(s=>!['ORIGINAL','TRANSLATION'].includes(s))||
       item.sources.length!==new Set(item.sources).size)return {status:'OUTPUT_UNSTRUCTURED',candidates:[]};
    const txt=item.text.trim();
    if(/^(?:\.{2,}|…|example|reply|回复)$/iu.test(txt))return {status:'MODEL_PLACEHOLDER',candidates:[]};
    if(typeof sourceOriginal==='string' && txt===sourceOriginal.trim())return {status:'MODEL_ORIGINAL_ECHO',candidates:[]};
    if(typeof sourceTranslation==='string' && txt===sourceTranslation.trim())return {status:'MODEL_TRANSLATION_ECHO',candidates:[]};
    const han=/[\u3400-\u9fff]/u.test(txt);
    if(replyLanguage==='zh-CN'?!han:(replyLanguage!==null && (han||!/[A-Za-zÀ-ž]/u.test(txt))))
      return {status:'MODEL_LANGUAGE_MISMATCH',candidates:[]};
    if(unique.has(txt))return {status:'OUTPUT_UNSTRUCTURED',candidates:[]};
    unique.add(txt);
    suggestions.push({id:'w45-'+digest(String(receipt.run_id)+'|'+mid+'|'+i).slice(0,20),
      text:txt,sources:item.sources.map(part=>({mid,part}))});
  }
  return {status:suggestions.length?'CANDIDATES_PRESENT':'NO_CANDIDATES',candidates:suggestions};
}
export function createW43ContactBridge({service,runW43,attestNativeReceipt,thread='default'}={}){
  if(!service||typeof service.getMessage!=='function'||typeof service.clearCandidates!=='function'||typeof service.acceptAgnoRun!=='function')err('W45_SERVICE_REQUIRED');
  if(typeof runW43!=='function'||typeof attestNativeReceipt!=='function')err('NATIVE_W43_EXECUTION_AND_ATTESTATION_REQUIRED');
  return Object.freeze({
    async propose({identity,mid,targetLanguage='de'}){
      if(!Object.hasOwn(LANGUAGES,targetLanguage))err('UNSUPPORTED_LANGUAGE');
      const row=service.getMessage(identity,mid);
      if(!['TRANSLATED','FIXTURE_ONLY'].includes(row.translation.status))return {status:'TRANSLATION_NOT_READY',candidates:[]};
      service.clearCandidates(identity,mid); // a failed/new Run must never leave old suggestions enabled
      const ids=w43ScopedIds(row.identity,thread);
      const prompt=w43ReplyPrompt({original:row.original.text,translation:row.translation.text,targetLanguage});
      let receipt;
      try {receipt=await runW43({scope:ids.scope,prompt,thread});}
      catch{return {status:'W43_RUN_FAILED',candidates:[]};}
      if(!receipt||receipt.status!=='AGNO_RUN_COMPLETED')return {status:'W43_RUN_FAILED',candidates:[]};
      if(!row.translation.provenance || row.translation.provenance.synthetic===false && row.translation.provenance.kind!=='LOCAL_ENGINE')err('TRANSLATION_PROVENANCE_INVALID');
      if(receipt.engine!=='OFFICIAL_AGNO_SDK'||receipt.sdk_pin!=='3.1.10' ||
         !((receipt.provider===LOCAL_W43_PROVIDER&&receipt.model_id==='qwen2.5:1.5b'&&receipt.purpose!=='QUALITY_EVAL')||
           (receipt.provider===LOCAL_QWEN3_PROVIDER&&receipt.model_id==='qwen3:8b'&&receipt.purpose==='QUALITY_EVAL'))||
         receipt.space!=='CONTACT'||receipt.user_id!==ids.userId||
         receipt.session_id!==ids.sessionId||!receipt.run_id||
         receipt.outbound!=='DISABLED'||receipt.provenance?.run_id!==receipt.run_id||
         receipt.provenance?.source!==receipt.provider)err('W43_RECEIPT_IDENTITY_OR_PROVIDER_INVALID');
      if(await attestNativeReceipt({receipt,scope:ids.scope,thread,prompt,sourceSHA:W43_SHA})!==true)err('W43_NATIVE_ATTESTATION_REQUIRED');
      const parsed=parseW43Candidates({receipt,mid,replyLanguage:targetLanguage,sourceOriginal:row.original.text,sourceTranslation:row.translation.text});
      if(['OUTPUT_UNSTRUCTURED','MODEL_LANGUAGE_MISMATCH','MODEL_ORIGINAL_ECHO','MODEL_TRANSLATION_ECHO','MODEL_PLACEHOLDER'].includes(parsed.status))return {...parsed,model:{provider:receipt.provider,model_id:receipt.model_id,run_id:receipt.run_id,quality_qualified:false,quality_status:receipt.model_id==='qwen3:8b'?'MODEL_QUALITY_UNREVIEWED':'HEALTHCHECK_ONLY'}};
      const mapped={
        engine:'OFFICIAL_AGNO_SDK',status:'COMPLETED',identity:row.identity,sourceMid:mid,
        originalSha256:row.original.sha256,translationRequestId:row.translation.provenance.request_id,
        runId:receipt.run_id,sessionId:receipt.session_id,agentId:'w43-contact-brain',
        provider:receipt.provider,modelId:receipt.model_id,purpose:receipt.purpose||'HEALTHCHECK',
        sdkPin:receipt.sdk_pin,sourceSHA:W43_SHA,
        candidates:parsed.candidates,native_receipt:receipt,
      };
      const updated=service.acceptAgnoRun(identity,mid,mapped);
      return {status:parsed.status,candidates:updated.candidates,
        model:{provider:receipt.provider,model_id:receipt.model_id,run_id:receipt.run_id,quality_qualified:false,quality_status:receipt.model_id==='qwen3:8b'?'MODEL_QUALITY_UNREVIEWED':'HEALTHCHECK_ONLY'}};
    }
  });
}
