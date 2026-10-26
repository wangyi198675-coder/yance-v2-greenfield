// W46 read/write *consumer* of W47 and W43 signed PRIVATE authority.
// No local model engine, session, storage, API Key vault, social delivery, or AI fallback.
const SAFE_PROVIDERS=new Set(['OPENROUTER','OPENAI_API','LLAMACPP_LOCAL_QWEN3_8B_FREE']);
const MODEL_KEY=/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const OPAQUE=/^[A-Za-z0-9_-]{8,100}$/;
const failure=(s)=>{throw Error(s)};
export const PRIVATE_ROUTES=Object.freeze({
 session:'/api/v2/local-session/status',
 models:'/api/v2/private-brain/models',
 selection:'/api/v2/private-brain/model-selection',
 credential:'/api/v2/private-brain/credentials',
 turn:'/api/v2/private-brain/turn',
 history:'/api/v2/private-brain/history'
});
export function authStatus(d,now=Date.now()){
 if(!d||d.ok!==true||d.canSend!==false||d.providerAuthorized!==false||
   typeof d.paired!=='boolean')failure('PRIVATE_SESSION_AUTHORITY_INVALID');
 if(!d.paired)return Object.freeze({authorized:false,csrf:null,reason:'SESSION_NOT_ESTABLISHED'});
 if(typeof d.csrfToken!=='string'||!/^[a-f0-9]{64}$/.test(d.csrfToken)||
    !Number.isSafeInteger(d.expiresAt)||d.expiresAt<=now)failure('PRIVATE_SESSION_EXPIRED_OR_INCOMPLETE');
 return Object.freeze({authorized:true,csrf:d.csrfToken,expiresAt:d.expiresAt});
}
export function modelCatalog(d){
 if(!d||d.ok!==true||d.authoritative!==true||d.canSend!==false||
    !Array.isArray(d.models)||d.models.length>24||typeof d.selectedModelId!=='string'||
    typeof d.selectedProvider!=='string'||typeof d.secureCredentialStorage!=='boolean')
    failure('PRIVATE_MODEL_CATALOG_NOT_SIGNED');
 const ids=new Set();
 const models=d.models.map(m=>{
   if(!m||!SAFE_PROVIDERS.has(m.provider)||!MODEL_KEY.test(m.modelId)||
      typeof m.available!=='boolean'||typeof m.configured!=='boolean'||
      (m.keyRequired!==undefined&&typeof m.keyRequired!=='boolean')||
      (m.billingNotice!==undefined&&typeof m.billingNotice!=='string')||
      ids.has(m.provider+'|'+m.modelId))
      failure('PRIVATE_MODEL_RECORD_INVALID');
   ids.add(m.provider+'|'+m.modelId);
   return Object.freeze({provider:m.provider,modelId:m.modelId,available:m.available,
       configured:m.configured,keyRequired:m.keyRequired===true,
       billingNotice:typeof m.billingNotice==='string'?m.billingNotice.slice(0,240):''});
 });
 if((d.selectedModelId||d.selectedProvider)&&
    !models.some(m=>m.modelId===d.selectedModelId&&m.provider===d.selectedProvider&&m.available&&m.configured))
    failure('PRIVATE_SELECTED_MODEL_NOT_QUALIFIED');
 return Object.freeze({models,selectedModelId:d.selectedModelId,selectedProvider:d.selectedProvider,
   configured:!!d.selectedModelId,secureCredentialStorage:d.secureCredentialStorage});
}
export function verifiedTurn(d,requested){
 if(!d||d.ok!==true||d.status!=='COMPLETED'||d.canSend!==false||
    d.qualityQualified!==false||d.threadId!==requested.threadId||d.requestId!==requested.requestId||
    typeof d.assistantText!=='string'||!d.assistantText.trim()||
    d.assistantText.length>128000||!OPAQUE.test(d.runId)||!OPAQUE.test(d.sessionId)||
    d.modelProvider!==requested.provider||d.modelId!==requested.modelId)
    failure('PRIVATE_SIGNED_TURN_MISMATCH');
 return Object.freeze({role:'assistant',content:d.assistantText,
  runId:d.runId,sessionId:d.sessionId,modelProvider:d.modelProvider,modelId:d.modelId});
}
export function verifiedHistory(d,threadId){
 if(!d||d.ok!==true||!['HISTORY_PRESENT','HISTORY_EMPTY','HISTORY_NOT_FOUND'].includes(d.status)||
    d.threadId!==threadId||d.canSend!==false||d.qualityQualified!==false||
    !Array.isArray(d.messages)||d.messages.length>2000||
    d.messages.some(m=>!m||!['user','assistant','tool'].includes(m.role)||
      typeof m.content!=='string'||m.content.length>128000))
    failure('PRIVATE_HISTORY_AUTHORITY_INVALID');
 return d.messages.map(m=>Object.freeze({role:m.role,content:m.content}));
}
export function privateError(status){
 if(status===401)return '本机可信会话不可用。请从受信任的言策程序重新打开';
 if(status===403)return '权限不足，已禁止模型调用';
 if(status===409)return '请求版本冲突或执行结果尚未确认，请先恢复历史';
 if(status===422)return '模型设置或消息格式无效';
 if(status===503)return '受信任的模型服务暂不可用';
 return '此功能尚未接入已签署的服务端接口';
}
export async function jsonApi(fetchImpl,url,init={}){
 const r=await fetchImpl(url,{credentials:'same-origin',cache:'no-store',redirect:'error',
   referrerPolicy:'no-referrer',...init});
 if(!r?.ok)failure('PRIVATE_HTTP_'+(r?.status||'UNAVAILABLE'));
 return await r.json();
}
export function endpointBody(route,body,csrf){
 if(typeof csrf!=='string'||!/^[a-f0-9]{64}$/.test(csrf))
   failure('PRIVATE_CSRF_REQUIRED');
 if(![PRIVATE_ROUTES.selection,PRIVATE_ROUTES.credential,PRIVATE_ROUTES.turn].includes(route))
   failure('PRIVATE_POST_ROUTE_INVALID');
 return {method:'POST',headers:{'content-type':'application/json','x-yance-csrf':csrf},
    body:JSON.stringify(body)};
}
