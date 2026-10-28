// W46 signed consumer of actual W47 Owner SHA 857e3a68737e8b7b1bca18969b097f9dee1db825.
// The W47 REST provider ID IS the W43 native Agno Run provider ID.
// Never translate into old lowercase model IDs, synthesize a signed model, or receive an API Key.
const PROVIDER_NAMES=Object.freeze({
 OPENROUTER_USER_API:'OpenRouter',
 OPENAI_USER_API:'OpenAI API',
 LLAMACPP_LOCAL_QWEN3_8B_FREE:'本地 Qwen3',
 CHATGPT_PLAN_SIWC:'ChatGPT'
});
const PROVIDERS=new Set(Object.keys(PROVIDER_NAMES));
const LOCAL='LLAMACPP_LOCAL_QWEN3_8B_FREE';
const MODEL_ID=/^[A-Za-z0-9][A-Za-z0-9._:/-]{1,127}$/;
const OPAQUE=/^[A-Za-z0-9_-]{8,100}$/;
const fail=code=>{throw Error(code)};
const sensitive=/(api.?key|secret|token|password|credential|privatepath|dbpath|lease)/i;
const noSecrets=obj=>{
 if(!obj||typeof obj!=='object'||Array.isArray(obj))fail('W47_MODEL_DTO_INVALID');
 function visit(v){
  if(Array.isArray(v)){v.forEach(visit);return}
  if(v&&typeof v==='object')for(const [k,x] of Object.entries(v)){
   // W47's documented negative declarations and public provider booleans
   // are safe; any other secret/handle/credential property is forbidden.
   if(k==='credentialsExposed'&&x===false)continue;
   if(k==='secureCredentialStorage'&&x===false)continue;
   if(k==='requiresUserApiKey'&&typeof x==='boolean')continue;
   if(sensitive.test(k))fail('W47_MODEL_SECRET_FIELD_EXPOSED');
   visit(x);
  }
 }
 visit(obj);
};
export const PRIVATE_ROUTES=Object.freeze({
 session:'/api/v2/local-session/status',
 webPrivateStart:'/api/v2/local-session/web-private-start',
 catalog:'/api/v2/private-brain/model-catalog',
 config:'/api/v2/private-brain/model-config',
 selection:'/api/v2/private-brain/model-selection',
 turn:'/api/v2/private-brain/turn',
 history:'/api/v2/private-brain/history'
});
export function authStatus(d,now=Date.now()){
 if(!d||d.ok!==true||d.canSend!==false||d.providerAuthorized!==false||
    typeof d.paired!=='boolean')fail('PRIVATE_SESSION_AUTHORITY_INVALID');
 if(!d.paired)return Object.freeze({authorized:false,csrf:null,reason:'SESSION_NOT_ESTABLISHED'});
 if(typeof d.csrfToken!=='string'||!/^[a-f0-9]{64}$/.test(d.csrfToken)||
    !Number.isSafeInteger(d.expiresAt)||d.expiresAt<=now)
    fail('PRIVATE_SESSION_EXPIRED_OR_INCOMPLETE');
 return Object.freeze({authorized:true,csrf:d.csrfToken,expiresAt:d.expiresAt});
}
export function publicModelCatalog(d){
 noSecrets(d);
 if(d.ok!==true||d.authoritative!==false||d.canSend!==false||
    d.actualAvailability!=='CHECK_AUTHORIZED_MODEL_CONFIG'||
    !Array.isArray(d.providers)||d.providers.length!==4)
    fail('W47_PUBLIC_CATALOG_INVALID');
 const seen=new Set();
 const providers=d.providers.map(p=>{
  if(!p||!PROVIDERS.has(p.provider)||seen.has(p.provider)||
     (p.displayName!==PROVIDER_NAMES[p.provider]&&
      !(p.provider===LOCAL&&p.displayName==='Local Qwen3'))||
     typeof p.requiresLocalModel!=='boolean'||
     p.requiresLocalModel!==(p.provider===LOCAL)||
     typeof p.requiresUserApiKey!=='boolean'||
     p.requiresUserApiKey!==['OPENROUTER_USER_API','OPENAI_USER_API'].includes(p.provider))
    fail('W47_PUBLIC_PROVIDER_INVALID');
  seen.add(p.provider);
  return Object.freeze({id:p.provider,name:PROVIDER_NAMES[p.provider],
   requiresLocalModel:p.requiresLocalModel,requiresUserApiKey:p.requiresUserApiKey});
 });
 return Object.freeze(providers);
}
export function validSelection(s){
 return !!s&&typeof s==='object'&&!Array.isArray(s)&&
  PROVIDERS.has(s.provider)&&MODEL_ID.test(s.modelId)&&
  Object.keys(s).sort().join('|')==='modelId|provider';
}
// Authoritative W47 current GET /model-config (never public catalog):
// {ok:true,authoritative:true,models:[{provider,modelId,configured,available,
// keyRequired,billingNotice}],selectedProvider:'',selectedModelId:'',
// secureCredentialStorage:false,canSend:false,providerAuthorized:false,
// credentialsExposed:false}.
export function modelCatalog(d,publicProviders=null){
 noSecrets(d);
 if(d.ok!==true||d.authoritative!==true||d.canSend!==false||
    d.providerAuthorized!==false||d.credentialsExposed!==false||
    d.secureCredentialStorage!==false||!Array.isArray(d.models)||d.models.length>24||
    typeof d.selectedProvider!=='string'||typeof d.selectedModelId!=='string'||
    (!!d.selectedProvider)!==(!!d.selectedModelId))
    fail('W47_SIGNED_MODEL_CONFIG_INVALID');
 const allowed=new Set(publicProviders?.map(p=>p.id)||[...PROVIDERS]);
 const keys=new Set(),models=[];
 for(const m of d.models){
  if(!m||!allowed.has(m.provider)||!PROVIDERS.has(m.provider)||
     !MODEL_ID.test(m.modelId)||typeof m.configured!=='boolean'||
     typeof m.available!=='boolean'||typeof m.keyRequired!=='boolean'||
     m.keyRequired!==['OPENROUTER_USER_API','OPENAI_USER_API'].includes(m.provider)||
     (m.available&&!m.configured)||
     typeof m.billingNotice!=='string'||m.billingNotice.length>400||
     keys.has(m.provider+'|'+m.modelId))
    fail('W47_MODEL_RECORD_UNVERIFIED');
  keys.add(m.provider+'|'+m.modelId);
  models.push(Object.freeze({provider:m.provider,modelId:m.modelId,
   configured:m.configured,available:m.available,keyRequired:m.keyRequired,
   billingNotice:m.billingNotice}));
 }
 const selected=models.find(m=>m.provider===d.selectedProvider&&
   m.modelId===d.selectedModelId&&m.configured&&m.available);
 if(d.selectedProvider&&!selected)fail('W47_SELECTED_MODEL_NOT_QUALIFIED');
 return Object.freeze({models,selectedProvider:d.selectedProvider,
  selectedModelId:d.selectedModelId,configured:!!selected,
  secureCredentialStorage:false});
}
export function confirmedModelSelection(receipt,selection){
 if(!validSelection(selection))fail('W47_MODEL_SELECTION_INVALID');
 const c=modelCatalog(receipt);
 if(!c.configured||c.selectedProvider!==selection.provider||
    c.selectedModelId!==selection.modelId)
    fail('MODEL_SELECTION_POST_NOT_CONFIRMED');
 return c;
}
export function verifiedTurn(d,requested){
 if(!d||d.ok!==true||d.status!=='COMPLETED'||d.canSend!==false||
    d.qualityQualified!==false||d.threadId!==requested.threadId||
    d.requestId!==requested.requestId||typeof d.assistantText!=='string'||
    !d.assistantText.trim()||d.assistantText.length>128000||
    !OPAQUE.test(d.runId)||!OPAQUE.test(d.sessionId)||
    !PROVIDERS.has(requested.provider)||
    d.modelProvider!==requested.provider||d.modelId!==requested.modelId)
    fail('PRIVATE_SIGNED_TURN_MISMATCH');
 return Object.freeze({role:'assistant',content:d.assistantText,
  runId:d.runId,sessionId:d.sessionId,modelProvider:d.modelProvider,
  modelId:d.modelId});
}
export function verifiedHistory(d,threadId){
 if(!d||d.ok!==true||
    !['HISTORY_PRESENT','HISTORY_EMPTY','HISTORY_NOT_FOUND'].includes(d.status)||
    d.threadId!==threadId||d.canSend!==false||d.qualityQualified!==false||
    !Array.isArray(d.messages)||d.messages.length>2000||
    d.messages.some(m=>!m||!['user','assistant','tool'].includes(m.role)||
      typeof m.content!=='string'||m.content.length>128000))
    fail('PRIVATE_HISTORY_AUTHORITY_INVALID');
 return d.messages.map(m=>Object.freeze({role:m.role,content:m.content}));
}
export function privateError(status){
 if(status===401)return '本机 AI 服务尚未连接，暂时无法读取模型设置或历史';
 if(status===403)return '权限不足或尚未批准该模型费用';
 if(status===409)return '模型密钥尚未配置或请求结果存在冲突';
 if(status===422)return '服务端拒绝模型设置或消息格式';
 if(status===503)return '本机 AI 服务暂不可用，请稍后重试';
 return '接口未签署或当前不可用';
}
export async function jsonApi(fetchImpl,url,init={}){
 const r=await fetchImpl(url,{credentials:'same-origin',cache:'no-store',
   redirect:'error',referrerPolicy:'no-referrer',...init});
 if(!r?.ok)fail('PRIVATE_HTTP_'+(r?.status||'UNAVAILABLE'));
 return await r.json();
}
export function endpointBody(route,body,csrf){
 if(typeof csrf!=='string'||!/^[a-f0-9]{64}$/.test(csrf))
   fail('PRIVATE_CSRF_REQUIRED');
 if(route===PRIVATE_ROUTES.selection&&!validSelection(body))
   fail('W47_MODEL_SELECTION_INVALID');
 if(route===PRIVATE_ROUTES.turn&&(!body||typeof body.text!=='string'||
   !body.text.trim()||typeof body.threadId!=='string'||!OPAQUE.test(body.requestId)))
   fail('W47_PRIVATE_TURN_INVALID');
 if(![PRIVATE_ROUTES.selection,PRIVATE_ROUTES.turn].includes(route))
   fail('PRIVATE_POST_ROUTE_INVALID');
 return {method:'POST',
  headers:{'content-type':'application/json','x-yance-csrf':csrf},
  body:JSON.stringify(body)};
}
