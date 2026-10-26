// W47: single HTTP DTO for W43 PRIVATE Agno; no browser identity claims.
import {createHash,timingSafeEqual} from 'node:crypto';
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
const principalValid=p=>p&&p.source==='W54_NATIVE_CURRENT_USER'&&p.verified===true&&
 opaque(p.principalRef)&&opaque(p.installationRef)&&
 typeof p.appLocalDataRoot==='string'&&/^[a-zA-Z]:\\/.test(p.appLocalDataRoot)&&
 p.appLocalDataRoot.length<1024&&!p.appLocalDataRoot.includes('..')&&
 !/[\x00-\x1f]/.test(p.appLocalDataRoot);
const sessionSeal=(s,p)=>Object.freeze({
  principalRef:p.principalRef,installationRef:p.installationRef,
  sessionRef:sha(s.id),sessionRevision:s.record.sessionRevision??1,
  revocationGeneration:s.record.rev??0,expiresAtMs:s.record.expiresAt,
  appLocalDataRoot:p.appLocalDataRoot
});
const sameContext=(a,b)=>a.principalRef===b.principalRef&&a.installationRef===b.installationRef&&
 a.sessionRef===b.sessionRef&&a.sessionRevision===b.sessionRevision&&
 a.revocationGeneration===b.revocationGeneration&&a.appLocalDataRoot===b.appLocalDataRoot;
const w43Turn=r=>r&&r.status==='COMPLETED'&&r.canSend===false&&r.qualityQualified===false&&
 typeof r.assistantText==='string'&&r.assistantText.trim().length>0&&r.assistantText.length<=128000&&
 opaque(r.runId)&&opaque(r.sessionId)&&typeof r.modelProvider==='string'&&
 r.modelProvider.startsWith('LLAMACPP_LOCAL_')&&r.modelId==='qwen3:8b';
const w43History=r=>r&&['HISTORY_PRESENT','HISTORY_EMPTY','HISTORY_NOT_FOUND'].includes(r.status)&&
 r.canSend===false&&r.qualityQualified===false&&opaque(r.sessionId)&&
 Array.isArray(r.messages)&&r.messages.length<=2000&&
 Number.isSafeInteger(r.runCount)&&r.runCount>=0&&Number.isSafeInteger(r.completeTurnCount)&&
 r.completeTurnCount>=0&&r.completeTurnCount<=r.runCount&&
 r.messages.every(m=>m&&['user','assistant','tool'].includes(m.role)&&
 typeof m.content==='string'&&m.content.length<=128000);
const errorMap=e=>{
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
 resolveNativePrincipal=null,w43Port=null,requestLedger=null}={}){
 if(!sessionAuthority?.sessionFor||typeof webOrigin!=='string')throw Error('PRIVATE_SESSION_REQUIRED');
 if(resolveNativePrincipal!==null&&typeof resolveNativePrincipal!=='function')throw Error('BAD_W54_NATIVE_RESOLVER');
 if(w43Port!==null&&(!w43Port.turn||!w43Port.history))throw Error('BAD_W43_PRIVATE_PORT');
 if(requestLedger!==null&&(!requestLedger.claim||!requestLedger.finish||!requestLedger.markUnknown))
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
  const scoped={...original,threadId};
  const ledgerKey=turn?sha([original.installationRef,original.principalRef,threadId,requestId].join('|')):null;
  const payloadHash=turn?sha(text):null;
  if(turn){
   let lock;
   try{lock=await requestLedger.claim({key:ledgerKey,payloadHash,context:original})}
   catch{reject(res,503,'DURABLE_REQUEST_FENCE_UNAVAILABLE');return true}
   // Exact same requestId+text after confirmed durable finish yields cached native receipt.
   // In-progress or unknown-on-restart MUST NEVER call W43 again.
   if(lock?.state==='CONFLICT'){reject(res,409,'REQUEST_ID_PAYLOAD_CONFLICT');return true}
   if(lock?.state==='IN_PROGRESS'){reject(res,409,'REQUEST_ID_IN_PROGRESS');return true}
   if(lock?.state==='UNKNOWN'){reject(res,409,'REQUEST_OUTCOME_UNKNOWN_RECONCILIATION_REQUIRED');return true}
   if(lock?.state==='COMPLETED'){
    try{
     const again=await principal();
     if(!sameContext(original,again)){reject(res,409,'LOCAL_SESSION_REVISION_CONFLICT');return true}
    }catch(e){const f=errorMap(e);reject(res,f.status,f.code);return true}
    if(!w43Turn(lock.receipt)){reject(res,503,'DURABLE_NATIVE_RECEIPT_UNVERIFIED');return true}
    reply(res,200,{ok:true,status:'COMPLETED',threadId,requestId,replayed:true,
     assistantText:lock.receipt.assistantText,runId:lock.receipt.runId,sessionId:lock.receipt.sessionId,
     modelProvider:lock.receipt.modelProvider,modelId:lock.receipt.modelId,
     qualityQualified:false,canSend:false});return true;
   }
   if(lock?.state!=='CLAIMED'){reject(res,503,'DURABLE_REQUEST_FENCE_INVALID');return true}
   let result;
   try{result=await w43Port.turn({serverScope:scoped,checkCurrent:principal},threadId,text,requestId)}
   catch(e){
    try{await requestLedger.markUnknown({key:ledgerKey,payloadHash})}catch{}
    const f=errorMap(e);reject(res,f.status,f.code);return true;
   }
   if(!w43Turn(result)||result.threadId!==threadId){
    try{await requestLedger.markUnknown({key:ledgerKey,payloadHash})}catch{}
    reject(res,503,'W43_NATIVE_RUN_RECEIPT_INVALID');return true;
   }
   // Persistent completion must precede the HTTP acknowledgement.
   try{await requestLedger.finish({key:ledgerKey,payloadHash,receipt:result})}
   catch{reject(res,503,'DURABLE_COMPLETION_PERSIST_FAILED');return true}
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
