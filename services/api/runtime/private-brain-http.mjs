// W47: single HTTP DTO for W43 PRIVATE Agno; no browser identity claims.
import {createHash,timingSafeEqual} from 'node:crypto';
import {win32} from 'node:path';
const maxBody=16*1024;
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store',
  'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer',
  'cross-origin-resource-policy':'same-origin','vary':'Origin, Sec-Fetch-Site'};
const reply=(res,status,data)=>{res.writeHead(status,headers);res.end(JSON.stringify(data))};
const reject=(res,status,error)=>reply(res,status,{ok:false,error,canSend:false});
const validThread=t=>typeof t==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(t);
const validRequest=t=>typeof t==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(t);
const sha=t=>createHash('sha256').update(t).digest('hex');
async function body(req){
 if(req.headers['content-type']!=='application/json')throw {status:415,error:'JSON_REQUIRED'};
 if(req.headers['content-length']&&Number(req.headers['content-length'])>maxBody)throw {status:413,error:'BODY_TOO_LARGE'};
 const parts=[];let len=0;
 for await(const c of req){len+=c.length;if(len>maxBody)throw {status:413,error:'BODY_TOO_LARGE'};parts.push(c)}
 let value;try{value=JSON.parse(Buffer.concat(parts).toString('utf8'))}catch{throw {status:422,error:'INVALID_JSON'}}
 if(!value||typeof value!=='object'||Array.isArray(value))throw {status:422,error:'JSON_OBJECT_REQUIRED'};
 return value;
}
const csrf=(req,s)=>{
 const v=req.headers['x-yance-csrf'],k=s?.record?.csrf;
 return typeof v==='string'&&typeof k==='string'&&/^[a-f0-9]{64}$/.test(v)&&
   /^[a-f0-9]{64}$/.test(k)&&timingSafeEqual(Buffer.from(v),Buffer.from(k));
};
const opaque=s=>typeof s==='string'&&s.length>=8&&s.length<=256&&
 /^[\x21-\x7e]+$/.test(s)&&!/[\\\/|?&#:"<>]/.test(s);
const principalValid=p=>p&&
 (p.source==='W54_NATIVE_CURRENT_USER'||
  (p.source==='WEB_LOCAL_PRIVATE'&&p.webPrivateOnly===true&&
   p.modelBackend==='unconfigured'&&p.extraChargeApproved===false))&&
 p.verified===true&&
 opaque(p.principalRef)&&opaque(p.installationRef)&&
 typeof p.appLocalDataRoot==='string'&&/^[a-zA-Z]:\\/.test(p.appLocalDataRoot)&&
 p.appLocalDataRoot.length<1024&&!p.appLocalDataRoot.includes('..')&&
 !/[\x00-\x1f]/.test(p.appLocalDataRoot);
const nativeModelClaim=p=>{
 // These fields can come ONLY from the injected W54/W55 signed server port.
 // No browser DTO, cookie value, environment or profile text grants paid use.
 const backend=p.modelBackend;
 if(backend===undefined)return {
  modelBackend:'unconfigured',modelId:'',modelSelectionEpoch:0,
  modelUserSelected:false,extraChargeApproved:false,
  protectedCredentialAttested:false
 };
 if(!['llamacpp','openrouter','openai','unconfigured'].includes(backend)||
    typeof p.modelId!=='string'||p.modelId.length>128||
    !Number.isSafeInteger(p.modelSelectionEpoch)||p.modelSelectionEpoch<0)
   throw {httpStatus:503};
 const cloud=backend==='openrouter'||backend==='openai';
 const originalProtectedFile=typeof p.cloudKeyFile==='string'&&
   win32.isAbsolute(p.cloudKeyFile)&&!p.cloudKeyFile.includes('..')&&
   !/[\\x00-\\x1f]/.test(p.cloudKeyFile);
 // The normal installed personal mode uses ORIGINAL WinCred W55 with a
 // private W47->W43 stdio Key callback, not a plaintext cloudKeyFile.
 // This marker is supplied only by the already-verified NATIVE principal.
 const nativeWinCred=p.cloudCredentialSource==='W55_NATIVE_WIN_CRED'&&
   p.cloudKeyFile===undefined;
 if(cloud&&(p.modelSelectionEpoch<1||p.modelUserSelected!==true||
   p.extraChargeApproved!==true||p.protectedCredentialAttested!==true||
    !((p.cloudSecretMode==='W55_NATIVE_CALLBACK'&&p.cloudCredentialSource===undefined&&p.cloudKeyFile===undefined)||
      (p.cloudSecretMode===undefined&&nativeWinCred)||
      (p.cloudSecretMode===undefined&&p.cloudCredentialSource===undefined&&originalProtectedFile))))
   throw {httpStatus:503};
 return {
  modelBackend:backend,modelId:p.modelId,
  modelSelectionEpoch:p.modelSelectionEpoch,
  modelUserSelected:p.modelUserSelected===true,
  extraChargeApproved:p.extraChargeApproved===true,
  protectedCredentialAttested:p.protectedCredentialAttested===true,
  ...(cloud&&p.cloudSecretMode==='W55_NATIVE_CALLBACK'?{cloudSecretMode:'W55_NATIVE_CALLBACK'}:{}),
  ...(cloud&&nativeWinCred?{cloudCredentialSource:'W55_NATIVE_WIN_CRED'}:{}),
  ...(cloud&&p.cloudSecretMode===undefined&&p.cloudCredentialSource===undefined&&originalProtectedFile?{cloudKeyFile:p.cloudKeyFile}:{})
 };
};
const sessionSeal=(s,p)=>Object.freeze({
  principalRef:p.principalRef,installationRef:p.installationRef,
  sessionRef:sha(s.id),sessionRevision:s.record.sessionRevision??1,
  revocationGeneration:s.record.rev??0,expiresAtMs:s.record.expiresAt,
  appLocalDataRoot:p.appLocalDataRoot,
  ...nativeModelClaim(p)
});
const sameContext=(a,b)=>a.principalRef===b.principalRef&&a.installationRef===b.installationRef&&
 a.sessionRef===b.sessionRef&&a.sessionRevision===b.sessionRevision&&
 a.revocationGeneration===b.revocationGeneration&&a.appLocalDataRoot===b.appLocalDataRoot&&
 a.modelBackend===b.modelBackend&&a.modelId===b.modelId&&
 a.modelSelectionEpoch===b.modelSelectionEpoch&&
 a.cloudKeyFile===b.cloudKeyFile&&a.cloudSecretMode===b.cloudSecretMode&&a.cloudCredentialSource===b.cloudCredentialSource&&
 a.modelUserSelected===b.modelUserSelected&&
 a.extraChargeApproved===b.extraChargeApproved&&
 a.protectedCredentialAttested===b.protectedCredentialAttested;
const w43Turn=(r,selection=null)=>r&&r.status==='COMPLETED'&&r.canSend===false&&r.qualityQualified===false&&
 typeof r.assistantText==='string'&&r.assistantText.trim().length>0&&r.assistantText.length<=128000&&
 opaque(r.runId)&&opaque(r.sessionId)&&typeof r.modelProvider==='string'&&
 (selection?(r.modelId===selection.modelId&&
   (selection.provider==='LLAMACPP_LOCAL_QWEN3_8B_FREE'?r.modelProvider==='LLAMACPP_LOCAL_QWEN3_8B_FREE':
    selection.provider==='OPENROUTER_USER_API'?r.modelProvider==='OPENROUTER_USER_API':
    selection.provider==='OPENAI_USER_API'&&r.modelProvider==='OPENAI_USER_API')):
   r.modelProvider.startsWith('LLAMACPP_LOCAL_')&&r.modelId==='qwen3:8b');
const w43History=r=>r&&['HISTORY_PRESENT','HISTORY_EMPTY','HISTORY_NOT_FOUND'].includes(r.status)&&
 r.canSend===false&&r.qualityQualified===false&&opaque(r.sessionId)&&
 Array.isArray(r.messages)&&r.messages.length<=2000&&
 Number.isSafeInteger(r.runCount)&&r.runCount>=0&&Number.isSafeInteger(r.completeTurnCount)&&
 r.completeTurnCount>=0&&r.completeTurnCount<=r.runCount&&
 r.messages.every(m=>m&&['user','assistant','tool'].includes(m.role)&&
 typeof m.content==='string'&&m.content.length<=128000);
const errorMap=e=>{
 // The W43 original Agno port reports safe machine-readable model setup
 // statuses. Do not turn ordinary no-model usage into an opaque IPC failure.
 const native=typeof e?.code==='string'?e.code.replace(/^W43_NATIVE_PRIVATE_/, ''):'';
 if(['MODEL_SETUP_REQUIRED','LOCAL_MODEL_UNAVAILABLE',
     'CLOUD_API_KEY_SETUP_REQUIRED','CLOUD_PROTECTED_CREDENTIAL_UNAVAILABLE',
     'CLOUD_MODEL_SELECTION_OR_CREDENTIAL_UNAVAILABLE',
     'W55_PROTECTED_CREDENTIAL_NOT_ATTESTED'].includes(native))
  return {status:503,code:native};
 if(e?.http_status===401||e?.httpStatus===401)return {status:401,code:'LOCAL_SESSION_REVOKED_OR_EXPIRED'};
 if(e?.http_status===409||e?.httpStatus===409)return {status:409,code:'LOCAL_SESSION_REVISION_CONFLICT'};
 if(e?.http_status===422||e?.httpStatus===422)return {status:422,code:'W43_REQUEST_INVALID'};
 return {status:503,code:'W43_NATIVE_PRIVATE_UNAVAILABLE'};
};
/**
 * W54 resolver and W43 port are injected privately by the server at startup.
 * W43 port shape: turn(context,thread_id,text,request_id), history(context,thread_id).
 * Durable W09/W43-approved request ledger is REQUIRED before a real POST Run.
 * In absence of all three signed ports the production server remains sealed.
 */
export function createPrivateBrainHttp({sessionAuthority,webOrigin,
 resolveNativePrincipal=null,w43Port=null,requestLedger=null,
 resolveSignedModelSelection=null}={}){
 if(!sessionAuthority?.sessionFor||typeof webOrigin!=='string')throw Error('PRIVATE_SESSION_REQUIRED');
 if(resolveSignedModelSelection!==null&&typeof resolveSignedModelSelection!=='function')
  throw Error('W43_SIGNED_MODEL_SELECTION_PORT_INVALID');
 if(resolveNativePrincipal!==null&&typeof resolveNativePrincipal!=='function')throw Error('BAD_W54_NATIVE_RESOLVER');
 if(w43Port!==null&&(!w43Port.turn||!w43Port.history))throw Error('BAD_W43_PRIVATE_PORT');
 if(requestLedger!==null&&(!requestLedger.claim||!requestLedger.finish||!requestLedger.markUnknown||!requestLedger.reconcile))
  throw Error('BAD_PRIVATE_DURABLE_LEDGER');
 return async(req,res,url)=>{
  const turn=url.pathname==='/api/v2/private-brain/turn',hist=url.pathname==='/api/v2/private-brain/history';
  if(!turn&&!hist)return false;
  if((turn&&req.method!=='POST')||(hist&&req.method!=='GET')){
   reject(res,405,'METHOD_NOT_ALLOWED');return true;
  }
  const current=sessionAuthority.sessionFor(req);
  if(!current){reject(res,401,'LOCAL_SESSION_REQUIRED');return true}
  if(req.headers.origin&&req.headers.origin!==webOrigin){reject(res,403,'ORIGIN_NOT_ALLOWED');return true}
  if(turn&&(req.headers.origin!==webOrigin||!csrf(req,current))){
   reject(res,403,'LOCAL_SESSION_OR_CSRF_REQUIRED');return true;
  }
  let threadId='personal',text,requestId;
  if(turn){
   let v;try{v=await body(req)}catch(e){reject(res,e.status||422,e.error||'INVALID_INPUT');return true}
   if(Object.keys(v).sort().join('|')!==['requestId','text','threadId'].filter(k=>Object.hasOwn(v,k)).sort().join('|')||
      !Object.hasOwn(v,'text')||!Object.hasOwn(v,'requestId')||
      !validThread(v.threadId??'personal')||!validRequest(v.requestId)||
      typeof v.text!=='string'||!v.text.trim()||v.text.length>4000||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v.text)){
    reject(res,422,'PRIVATE_TURN_DTO_INVALID');return true;
   }
   threadId=v.threadId??'personal';text=v.text;requestId=v.requestId;
  }else{
   for(const k of url.searchParams.keys()){
    if(k!=='threadId'||url.searchParams.getAll(k).length!==1){reject(res,422,'PRIVATE_HISTORY_QUERY_INVALID');return true}
   }
   threadId=url.searchParams.get('threadId')??'personal';
   if(!validThread(threadId)){reject(res,422,'PRIVATE_HISTORY_THREAD_INVALID');return true}
  }
  if(!resolveNativePrincipal){reject(res,503,'W54_TRUSTED_CURRENT_USER_MISSING');return true}
  if(!w43Port){reject(res,503,'W43_ORIGINAL_PRIVATE_PORT_MISSING');return true}
  if(turn&&!requestLedger){reject(res,503,'DURABLE_REQUEST_REPLAY_FENCE_MISSING');return true}
  const principal=async()=>{
   const s=sessionAuthority.sessionFor(req);
   if(!s)throw {httpStatus:401};
   const p=await resolveNativePrincipal({session:s,operation:turn?'PRIVATE_TURN':'PRIVATE_HISTORY'});
   if(!principalValid(p))throw {httpStatus:503};
   return sessionSeal(s,p);
  };
  let original;try{original=await principal()}catch(e){const f=errorMap(e);reject(res,f.status,f.code);return true}
  // PRIVATE History works with no configured inference model. An ordinary
  // new question must prompt model setup BEFORE legacy model-select/ledger.
  if(turn&&original.modelBackend==='unconfigured'){
   reject(res,503,'MODEL_SETUP_REQUIRED');return true;
  }
  let signedSelection=null;
  if(turn&&(resolveSignedModelSelection||
    ['openrouter','openai'].includes(original.modelBackend))){
   // A configured local user's own native W54/W55 model claim is sufficient;
   // do not require a redundant selection service just to call original Agno.
   try{signedSelection=resolveSignedModelSelection?
    await resolveSignedModelSelection({verifiedContext:original,threadId}):{
     provider:original.modelBackend==='openrouter'?'OPENROUTER_USER_API':'OPENAI_USER_API',
     modelId:original.modelId
    }}
   catch{reject(res,503,'W43_SIGNED_MODEL_SELECTION_UNAVAILABLE');return true}
   const permitted=signedSelection&&['LLAMACPP_LOCAL_QWEN3_8B_FREE','OPENAI_USER_API','OPENROUTER_USER_API'].includes(signedSelection.provider)&&
    typeof signedSelection.modelId==='string'&&signedSelection.modelId.length>1&&signedSelection.modelId.length<=128;
   if(!permitted){reject(res,503,'MODEL_CONFIGURATION_REQUIRED');return true}
   const expectedBackend={LLAMACPP_LOCAL_QWEN3_8B_FREE:'llamacpp',
    OPENROUTER_USER_API:'openrouter',OPENAI_USER_API:'openai'}[signedSelection.provider];
   // W54 current user + W55 credential/consent MUST bind the exact selected
   // model and its generation BEFORE native ledger claim or a billable Run.
   if(original.modelBackend!==expectedBackend||
      original.modelId!==signedSelection.modelId||
      !Number.isSafeInteger(original.modelSelectionEpoch)){
    reject(res,409,'NATIVE_MODEL_SELECTION_OR_EPOCH_MISMATCH');return true;
   }
   if(typeof w43Port.supportsSelection!=='function'||
      await w43Port.supportsSelection(signedSelection)!==true){
    // Current W43 3d3992c only supports local qwen3:8b. Never substitute
    // local Qwen for a user-selected cloud model or auto-spend on fallback.
    reject(res,503,'W43_SELECTED_MODEL_EXECUTION_NOT_SIGNED');return true;
   }
  }
  const scoped={...original,threadId,...(signedSelection?{modelSelection:signedSelection}:{})};
  // One authoritative durable identity in W43 original Agno SQLite: never
  // mint a parallel Node hash/DB or trust browser-side principal fields.
  const ledgerArgs={context:{serverScope:scoped,checkCurrent:principal},threadId,requestId,text};
  if(turn){
   let lock;
   try{lock=await requestLedger.claim(ledgerArgs)}
   catch(e){
    const f=errorMap(e);
    reject(res,f.status===503?503:f.status,f.status===503?'DURABLE_REQUEST_FENCE_UNAVAILABLE':f.code);
    return true;
   }
   // Exact same requestId+text after confirmed durable finish yields cached native receipt.
   // In-progress or unknown-on-restart MUST NEVER call W43 again.
   if(lock?.state==='CONFLICT'){reject(res,409,'REQUEST_ID_PAYLOAD_CONFLICT');return true}
   if(lock?.state==='IN_PROGRESS'){reject(res,409,'REQUEST_ID_IN_PROGRESS');return true}
   if(lock?.state==='UNKNOWN'){
    // Reconcile only against original persisted native Agno Run and immutable
    // request fingerprint; no model rerun in an uncertain state.
    try{lock=await requestLedger.reconcile(ledgerArgs)}
    catch(e){const f=errorMap(e);reject(res,f.status,f.code);return true}
    if(lock?.state!=='COMPLETED'){
     reject(res,409,'REQUEST_OUTCOME_UNKNOWN_RECONCILIATION_REQUIRED');return true;
    }
   }
   if(lock?.state==='COMPLETED'){
    try{
     const again=await principal();
     if(!sameContext(original,again)){reject(res,409,'LOCAL_SESSION_REVISION_CONFLICT');return true}
    }catch(e){const f=errorMap(e);reject(res,f.status,f.code);return true}
    if(!w43Turn(lock.receipt,signedSelection)){reject(res,503,'DURABLE_NATIVE_RECEIPT_UNVERIFIED');return true}
    reply(res,200,{ok:true,status:'COMPLETED',threadId,requestId,replayed:true,
     assistantText:lock.receipt.assistantText,runId:lock.receipt.runId,sessionId:lock.receipt.sessionId,
     modelProvider:lock.receipt.modelProvider,modelId:lock.receipt.modelId,
     qualityQualified:false,canSend:false});return true;
   }
   if(lock?.state!=='CLAIMED'){reject(res,503,'DURABLE_REQUEST_FENCE_INVALID');return true}
   let result;
   try{result=await w43Port.turn({serverScope:scoped,checkCurrent:principal},threadId,text,requestId,signedSelection)}
   catch(e){
    try{await requestLedger.markUnknown(ledgerArgs)}catch{}
    const f=errorMap(e);reject(res,f.status,f.code);return true;
   }
   if(!w43Turn(result,signedSelection)||result.threadId!==threadId){
    try{await requestLedger.markUnknown(ledgerArgs)}catch{}
    reject(res,503,'W43_NATIVE_RUN_RECEIPT_INVALID');return true;
   }
   // Persistent completion must precede the HTTP acknowledgement.
   try{await requestLedger.finish({...ledgerArgs,receipt:result})}
   catch(e){
    const f=errorMap(e);
    reject(res,f.status===503?503:f.status,f.status===503?'DURABLE_COMPLETION_PERSIST_FAILED':f.code);
    return true;
   }
   let next;try{next=await principal()}catch(e){const f=errorMap(e);reject(res,f.status,f.code);return true}
   if(!sameContext(original,next)){reject(res,409,'LOCAL_SESSION_REVISION_CONFLICT');return true}
   reply(res,200,{ok:true,status:'COMPLETED',threadId,requestId,replayed:false,
    assistantText:result.assistantText,runId:result.runId,sessionId:result.sessionId,
    modelProvider:result.modelProvider,modelId:result.modelId,
    qualityQualified:false,canSend:false});
  }else{
   let result;try{result=await w43Port.history({serverScope:scoped,checkCurrent:principal},threadId)}
   catch(e){const f=errorMap(e);reject(res,f.status,f.code);return true}
   if(!w43History(result)||result.threadId!==threadId){
    reject(res,503,'W43_NATIVE_HISTORY_UNVERIFIED');return true
   }
   let next;try{next=await principal()}catch(e){const f=errorMap(e);reject(res,f.status,f.code);return true}
   if(!sameContext(original,next)){reject(res,409,'LOCAL_SESSION_REVISION_CONFLICT');return true}
   reply(res,200,{ok:true,status:result.status,threadId,sessionId:result.sessionId,
    messages:result.messages,runCount:result.runCount,completeTurnCount:result.completeTurnCount,
    qualityQualified:false,source:'W43_NATIVE_AGNO_CHAT_HISTORY',canSend:false});
  }
  return true;
 };
}
