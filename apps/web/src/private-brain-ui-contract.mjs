// W46 consumer of the EXACT W47 native Owner model DTO, SHA 41c9a09b...
// W47 owns the model config / native key vault. Browser cannot upload a plaintext key.
const PROVIDERS=new Set(['openrouter','openai','local']);
// Exactly W43 signed Agno 3.1.10 receipt providers; W47 model selection IDs remain lowercase.
const RUN_PROVIDERS=Object.freeze({
 openrouter:'OPENROUTER_USER_API',openai:'OPENAI_USER_API',
 local:'LLAMACPP_LOCAL_QWEN3_8B_FREE'
});
const PROVIDER_NAMES=Object.freeze({openrouter:'OpenRouter',openai:'OpenAI API',local:'本地 Qwen3'});
const ALLOWED_STATUS=new Set(['READY','SETUP_REQUIRED','MODEL_UNAVAILABLE','CREDENTIAL_VAULT_SEALED',
 'PROVIDER_NOT_YET_SIGNED','COST_AUTHORIZATION_REQUIRED','PROVIDER_NETWORK_UNAVAILABLE',
 'QUOTA_OR_BILLING_REQUIRED']);
const MODEL_ID=/^[A-Za-z0-9][A-Za-z0-9._:/+-]{1,127}$/;
const OPAQUE=/^[A-Za-z0-9_-]{8,100}$/;
const fail=code=>{throw Error(code)};
const secretField=/(api.?key|secret|token|password|credential|privatepath|dbpath|lease)/i;
const noSecrets=obj=>{
 if(!obj||typeof obj!=='object'||Array.isArray(obj))fail('W47_MODEL_DTO_INVALID');
 // No W55 Key, vault handle, path or opaque secret may reach the browser at ANY nesting level.
 function visit(v){
  if(Array.isArray(v)){v.forEach(visit);return}
  if(v&&typeof v==='object')for(const [k,x] of Object.entries(v)){
   if(k==='credentialsExposed'&&x===false){continue}
   if(k==='requiresUserApiKey'&&typeof x==='boolean'){continue}
   if(secretField.test(k))fail('W47_MODEL_SECRET_FIELD_EXPOSED');
   visit(x);
  }
 }
 visit(obj);
};
export const PRIVATE_ROUTES=Object.freeze({
 session:'/api/v2/local-session/status',
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
    !Number.isSafeInteger(d.expiresAt)||d.expiresAt<=now)fail('PRIVATE_SESSION_EXPIRED_OR_INCOMPLETE');
 return Object.freeze({authorized:true,csrf:d.csrfToken,expiresAt:d.expiresAt});
}
export function publicModelCatalog(d){
 noSecrets(d);
 if(d.ok!==true||d.authoritative!==false||d.canSend!==false||
    d.actualAvailability!=='CHECK_AUTHORIZED_MODEL_CONFIG'||!Array.isArray(d.providers)||
    d.providers.length!==3)fail('W47_PUBLIC_CATALOG_INVALID');
 const seen=new Set();
 const providers=d.providers.map(x=>{
  if(!x||!PROVIDERS.has(x.provider)||seen.has(x.provider)||
     (x.displayName!==PROVIDER_NAMES[x.provider]&&
      !(x.provider==='local'&&x.displayName==='Local Qwen3'))||
     typeof x.requiresUserApiKey!=='boolean'||typeof x.requiresLocalModel!=='boolean'||
     x.requiresLocalModel!==(x.provider==='local')||
     x.requiresUserApiKey===(x.provider==='local'))
    fail('W47_PUBLIC_PROVIDER_INVALID');
  seen.add(x.provider);
  return Object.freeze({id:x.provider,name:PROVIDER_NAMES[x.provider],
    requiresLocalModel:x.requiresLocalModel,requiresUserApiKey:x.requiresUserApiKey});
 });
 return Object.freeze(providers);
}
// W47 authenticated GET /model-config: {selected:null|{provider,modelId},
// sources:[{provider,configured,available,status,models?:string[]}],
// canSend:false,providerAuthorized:false,credentialsExposed:false}.
export function modelCatalog(d,publicProviders=null){
 noSecrets(d);
 if(d.ok!==true||d.canSend!==false||d.providerAuthorized!==false||
    d.credentialsExposed!==false||!Array.isArray(d.sources)||d.sources.length>25||
    !(d.selected===null||validSelection(d.selected)))
    fail('W47_SIGNED_MODEL_CONFIG_INVALID');
 const seen=new Set(),models=[],sources=[];
 const allowed=new Set(publicProviders?.map(p=>p.id)||[...PROVIDERS]);
 for(const row of d.sources){
  if(!row||!allowed.has(row.provider)||seen.has(row.provider)||
     typeof row.configured!=='boolean'||typeof row.available!=='boolean'||
     !ALLOWED_STATUS.has(row.status)||
     (row.status==='READY'&&(!row.configured||!row.available))||
     (row.status!=='READY'&&row.available)||
     (row.models!==undefined&&(!Array.isArray(row.models)||row.models.length>150)))
    fail('W47_MODEL_SOURCE_UNVERIFIED');
  seen.add(row.provider);
  sources.push(Object.freeze({provider:row.provider,configured:row.configured,
      available:row.available,status:row.status}));
  const mids=new Set();
  for(const modelId of row.models||[]){
   if(!MODEL_ID.test(modelId)||mids.has(modelId))
     fail('W47_MODEL_RECORD_INVALID');
   mids.add(modelId);
   models.push(Object.freeze({provider:row.provider,modelId,available:row.available,
     configured:row.configured,status:row.status,keyRequired:row.provider!=='local'}));
  }
 }
 if(d.selected&&(!models.some(m=>m.provider===d.selected.provider&&
         m.modelId===d.selected.modelId&&m.available&&m.configured)))
   fail('W47_SELECTED_MODEL_NOT_QUALIFIED');
 const selectedProvider=d.selected?.provider||'',selectedModelId=d.selected?.modelId||'';
 return Object.freeze({models,sources,selectedProvider,selectedModelId,
   configured:!!d.selected,secureCredentialStorage:false});
}
export function validSelection(s){
 return s&&typeof s==='object'&&!Array.isArray(s)&&PROVIDERS.has(s.provider)&&
  MODEL_ID.test(s.modelId)&&Object.keys(s).sort().join('|')==='modelId|provider';
}
export function confirmedModelSelection(receipt,chosen){
 const r=modelCatalog(receipt);
 if(!r.configured||r.selectedProvider!==chosen.provider||r.selectedModelId!==chosen.modelId)
   fail('MODEL_SELECTION_POST_NOT_CONFIRMED');
 return r;
}
export function verifiedTurn(d,requested){
 if(!d||d.ok!==true||d.status!=='COMPLETED'||d.canSend!==false||
    d.qualityQualified!==false||d.threadId!==requested.threadId||d.requestId!==requested.requestId||
    typeof d.assistantText!=='string'||!d.assistantText.trim()||
    d.assistantText.length>128000||!OPAQUE.test(d.runId)||!OPAQUE.test(d.sessionId)||
    d.modelProvider!==RUN_PROVIDERS[requested.provider]||d.modelId!==requested.modelId)
    fail('PRIVATE_SIGNED_TURN_MISMATCH');
 return Object.freeze({role:'assistant',content:d.assistantText,
  runId:d.runId,sessionId:d.sessionId,modelProvider:d.modelProvider,modelId:d.modelId});
}
export function verifiedHistory(d,threadId){
 if(!d||d.ok!==true||!['HISTORY_PRESENT','HISTORY_EMPTY','HISTORY_NOT_FOUND'].includes(d.status)||
    d.threadId!==threadId||d.canSend!==false||d.qualityQualified!==false||
    !Array.isArray(d.messages)||d.messages.length>2000||
    d.messages.some(m=>!m||!['user','assistant','tool'].includes(m.role)||
      typeof m.content!=='string'||m.content.length>128000))
    fail('PRIVATE_HISTORY_AUTHORITY_INVALID');
 return d.messages.map(m=>Object.freeze({role:m.role,content:m.content}));
}
export function privateError(status){
 if(status===401)return '本机可信会话不可用，请从受信任的言策程序打开';
 if(status===403)return '权限不足或尚未批准该模型费用';
 if(status===409)return '模型密钥尚未配置或请求结果存在冲突';
 if(status===422)return '服务端拒绝模型设置或消息格式';
 if(status===503)return '受信任的本机模型服务暂不可用';
 return '接口未签署或当前不可用';
}
export async function jsonApi(fetchImpl,url,init={}){
 const r=await fetchImpl(url,{credentials:'same-origin',cache:'no-store',redirect:'error',
   referrerPolicy:'no-referrer',...init});
 if(!r?.ok)fail('PRIVATE_HTTP_'+(r?.status||'UNAVAILABLE'));
 return await r.json();
}
export function endpointBody(route,body,csrf){
 if(typeof csrf!=='string'||!/^[a-f0-9]{64}$/.test(csrf))
   fail('PRIVATE_CSRF_REQUIRED');
 if(route===PRIVATE_ROUTES.selection&&!validSelection(body))fail('W47_MODEL_SELECTION_INVALID');
 if(route===PRIVATE_ROUTES.turn&&(!body||typeof body.text!=='string'||!body.text.trim()||
   typeof body.threadId!=='string'||!OPAQUE.test(body.requestId)))
   fail('W47_PRIVATE_TURN_INVALID');
 if(![PRIVATE_ROUTES.selection,PRIVATE_ROUTES.turn].includes(route))
   fail('PRIVATE_POST_ROUTE_INVALID');
 return {method:'POST',headers:{'content-type':'application/json','x-yance-csrf':csrf},
    body:JSON.stringify(body)};
}
