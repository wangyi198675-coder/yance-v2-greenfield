// W47 single existing W43 PRIVATE Agent model selection boundary.
// User cloud keys MUST remain in original W55 approved native vault;
// never receive / return an API Key from HTTP, headers, localStorage or logs.
// Default ports are NULL until W54/W55/W43 security-signed native adapters.
import {timingSafeEqual} from 'node:crypto';
const catalog=Object.freeze([
 Object.freeze({provider:'OPENROUTER_USER_API',displayName:'OpenRouter',requiresUserApiKey:true,requiresLocalModel:false}),
 Object.freeze({provider:'OPENAI_USER_API',displayName:'OpenAI API',requiresUserApiKey:true,requiresLocalModel:false}),
 Object.freeze({provider:'LLAMACPP_LOCAL_QWEN3_8B_FREE',displayName:'Local Qwen3',requiresUserApiKey:false,requiresLocalModel:true})
]);
const maxBody=2048;
const write=(res,status,value)=>{
 res.writeHead(status,{'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store','x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer','cross-origin-resource-policy':'same-origin',
  'x-frame-options':'DENY','vary':'Origin, Sec-Fetch-Site'});
 res.end(JSON.stringify(value))
};
const deny=(res,status,error)=>write(res,status,{ok:false,error,canSend:false});
const isProvider=v=>['LLAMACPP_LOCAL_QWEN3_8B_FREE','OPENROUTER_USER_API','OPENAI_USER_API'].includes(v);
const validModel=v=>typeof v==='string'&&v.length>=2&&v.length<=128&&
 /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(v);
const validSelection=s=>s&&isProvider(s.provider)&&validModel(s.modelId);
// W43 public SDK provenance is canonical. W55 intentionally retains its
// separate OS Credential Manager target names, never exposed as HTTP DTO.
const nativeKeyProvider=provider=>provider==='OPENROUTER_USER_API'?'OPENROUTER':
 provider==='OPENAI_USER_API'?'OPENAI_API':null;
const csrfOk=(req,s)=>{
 const k=s?.record?.csrf,v=req.headers['x-yance-csrf'];
 return typeof k==='string'&&typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)&&
  timingSafeEqual(Buffer.from(k),Buffer.from(v));
};
async function jsonOnly(req){
 if(req.headers['content-type']!=='application/json')throw {status:415,code:'JSON_REQUIRED'};
 const arr=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>maxBody)throw {status:413,code:'BODY_TOO_LARGE'};arr.push(chunk)}
 let data;try{data=JSON.parse(Buffer.concat(arr).toString('utf8'))}catch{throw {status:422,code:'INVALID_JSON'}}
 if(!data||typeof data!=='object'||Array.isArray(data))throw {status:422,code:'MODEL_SELECTION_REQUIRED'};
 if(Object.keys(data).sort().join('|')!=='modelId|provider'||!validSelection(data))
  throw {status:422,code:'MODEL_SELECTION_INVALID'};
 return data;
}
const safeConfiguration=x=>{
 if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>
  /api.?key|secret|token|password|credential|privatepath|dbpath/i.test(k)))
  return false;
 if(x.selected!==null&&!validSelection(x.selected))return false;
 if(!Array.isArray(x.sources)||x.sources.length>25)return false;
 return x.sources.every(s=>s&&isProvider(s.provider)&&
  typeof s.configured==='boolean'&&typeof s.available==='boolean'&&
  ['READY','SETUP_REQUIRED','MODEL_UNAVAILABLE','CREDENTIAL_VAULT_SEALED',
   'PROVIDER_NOT_YET_SIGNED','COST_AUTHORIZATION_REQUIRED',
   'PROVIDER_NETWORK_UNAVAILABLE','QUOTA_OR_BILLING_REQUIRED'].includes(s.status)&&
  (!Object.hasOwn(s,'models')||(Array.isArray(s.models)&&s.models.length<=150&&
   s.models.every(validModel))));
};
export function createPrivateModelHttp({
 sessionAuthority,webOrigin,resolveNativePrincipal=null,
 modelConfigPort=null,credentialVaultPort=null,w43ModelPort=null,
 localWebModelPort=null,webCloudModelPort=null
}={}){
 if(typeof sessionAuthority?.sessionFor!=='function'||typeof webOrigin!=='string')
  throw Error('W47_MODEL_SESSION_REQUIRED');
 for(const [k,p] of [['resolver',resolveNativePrincipal],['model',modelConfigPort],
  ['vault',credentialVaultPort],['agno',w43ModelPort]]){
  if(p!==null&&(k==='resolver'?typeof p!=='function':typeof p!=='object'))
   throw Error('W47_MODEL_NATIVE_'+k.toUpperCase()+'_PORT_INVALID');
 }
 return async(req,res,url)=>{
  const route=url.pathname;
  const isCatalog=route==='/api/v2/private-brain/model-catalog';
  const isSettings=route==='/api/v2/private-brain/model-config';
  const isSelect=route==='/api/v2/private-brain/model-selection';
  if(!isCatalog&&!isSettings&&!isSelect)return false;
  if((isSelect&&req.method!=='POST')||(!isSelect&&req.method!=='GET')){
   deny(res,405,'METHOD_NOT_ALLOWED');return true;
  }
  if(isCatalog){
   write(res,200,{ok:true,providers:catalog,authoritative:false,
    actualAvailability:'CHECK_AUTHORIZED_MODEL_CONFIG',canSend:false});
   return true;
  }
  const session=sessionAuthority.sessionFor(req);
  // Ordinary no-model onboarding is PUBLIC, READ ONLY and does not require a
  // terminal pair, local model or connected social account. It never exposes
  // WHETHER an actual user's cloud Key/model/history exists. A real model
  // selection, charged Run and private History still require the original
  // current-user native session, CSRF and W55/W43 provider qualifications.
  if(!session&&isSettings&&req.headers.cookie===undefined){
   if(req.headers.origin&&req.headers.origin!==webOrigin){
    deny(res,403,'MODEL_ORIGIN_NOT_ALLOWED');return true
   }
   write(res,200,{ok:true,authoritative:false,
    status:'OPEN_LOCAL_MODEL_SETTINGS',models:[],
    selectedProvider:'',selectedModelId:'',
    providers:catalog,
    requiresTerminalPair:false,requiresSocialAccount:false,
    localModelOptional:true,configurationState:'UNVERIFIED_UNTIL_NATIVE_APP',
    secureCredentialStorage:false,credentialsExposed:false,
    canSend:false,providerAuthorized:false});
   return true;
  }
  if(!session){deny(res,401,'LOCAL_SESSION_REQUIRED');return true}
  if(session.record.kind==='WEB_LOCAL_PRIVATE'){
   // One WEB_LOCAL_PRIVATE current-user session; W55 native WinCred is the
   // only provider key source. Original local Qwen is still optional.
   if(req.headers.origin&&req.headers.origin!==webOrigin){
    deny(res,403,'MODEL_ORIGIN_NOT_ALLOWED');return true
   }
   if(isSelect){
    if(req.headers.origin!==webOrigin||!csrfOk(req,session)){
     deny(res,403,'MODEL_ORIGIN_OR_CSRF_REQUIRED');return true
    }
    let selection;
    try{
     if(req.headers['content-type']!=='application/json')throw {status:415,code:'JSON_REQUIRED'};
     const chunks=[];let n=0;
     for await(const c of req){n+=c.length;if(n>2048)throw {status:413,code:'BODY_TOO_LARGE'};chunks.push(c)}
     selection=JSON.parse(Buffer.concat(chunks).toString('utf8'));
     if(!selection||typeof selection!=='object'||Array.isArray(selection))throw {status:422,code:'MODEL_SELECTION_INVALID'};
    }catch(e){deny(res,e.status??422,e.code??'MODEL_SELECTION_INVALID');return true}
    if(selection.provider==='LLAMACPP_LOCAL_QWEN3_8B_FREE'){
     if(Object.keys(selection).sort().join('|')!=='modelId|provider'||!localWebModelPort){
      deny(res,422,'LOCAL_QWEN_SELECTION_INVALID');return true
     }
     const done=await localWebModelPort.select(selection);
     if(!done.ok){deny(res,done.status,done.error);return true}
     webCloudModelPort?.clearSelection();
    }else{
     if(Object.keys(selection).sort().join('|')!=='confirmPaidCost|modelId|provider'){
      deny(res,422,'CLOUD_MODEL_SELECTION_DTO_INVALID');return true
     }
     if(!webCloudModelPort){deny(res,503,'W55_WEB_NATIVE_WIN_CRED_HOST_NOT_CONNECTED');return true}
     try{await webCloudModelPort.select(selection);localWebModelPort?.clearSelection()}
     catch(e){deny(res,e?.status??503,e?.code??'CLOUD_MODEL_SELECTION_UNAVAILABLE');return true}
    }
   }
   const state=localWebModelPort?await localWebModelPort.source():
    {models:[],ready:false,choice:null};
   let cloudSources=[],cloudSelected=null;
   if(webCloudModelPort){
    try{
     cloudSources=await webCloudModelPort.statuses();
     cloudSelected=await webCloudModelPort.current();
    }catch(e){deny(res,e?.status??503,e?.code??'W55_NATIVE_WIN_CRED_UNAVAILABLE');return true}
   }
   const selectedLocal=!cloudSelected&&state.ready&&state.choice;
   const models=[...state.models];
   if(cloudSelected)models.push({provider:cloudSelected.provider,
    modelId:cloudSelected.modelId,configured:true,available:true,
    keyRequired:true,billingNotice:'本机已配置本人API Key，云端调用可能产生费用；模型服务状态以实际运行回执为准'});
   write(res,200,{ok:true,authoritative:true,models,
    selectedProvider:cloudSelected?.provider??(selectedLocal?'LLAMACPP_LOCAL_QWEN3_8B_FREE':''),
    selectedModelId:cloudSelected?.modelId??(selectedLocal?'qwen3:8b':''),
    cloudSources,requiresPaidCallApproval:!!cloudSelected,
    secureCredentialStorage:!!webCloudModelPort,credentialsExposed:false,
    canSend:false,providerAuthorized:false});
   return true;
  }
  if(req.headers.origin&&req.headers.origin!==webOrigin){
   deny(res,403,'MODEL_ORIGIN_NOT_ALLOWED');return true;
  }
  if(isSelect&&(req.headers.origin!==webOrigin||!csrfOk(req,session))){
   deny(res,403,'MODEL_ORIGIN_OR_CSRF_REQUIRED');return true;
  }
  let selection;
  if(isSelect){try{selection=await jsonOnly(req)}catch(e){deny(res,e.status??422,e.code??'INVALID_REQUEST');return true}}
  if(!resolveNativePrincipal){deny(res,503,'W54_NATIVE_MODEL_PROFILE_NOT_CONNECTED');return true}
  if(!modelConfigPort||typeof modelConfigPort.read!=='function'||
     typeof modelConfigPort.select!=='function'){
   deny(res,503,'W54_PROTECTED_MODEL_CONFIG_NOT_CONNECTED');return true;
  }
  if(!credentialVaultPort||typeof credentialVaultPort.status!=='function'){
   deny(res,503,'W55_PRODUCTION_CREDENTIAL_VAULT_SEALED');return true;
  }
  if(!w43ModelPort||typeof w43ModelPort.capabilities!=='function'){
   deny(res,503,'W43_AGNO_MODEL_PROVIDER_NOT_SIGNED');return true;
  }
  let profile;
  try{profile=await resolveNativePrincipal({session,operation:isSelect?'MODEL_SELECTION':'MODEL_CONFIG'})}
  catch{deny(res,503,'W54_NATIVE_MODEL_PROFILE_UNAVAILABLE');return true}
  if(!profile||profile.source!=='W54_NATIVE_CURRENT_USER'||profile.verified!==true||
     typeof profile.principalRef!=='string'||profile.principalRef.length<8){
   deny(res,503,'W54_NATIVE_MODEL_PROFILE_UNVERIFIED');return true;
  }
  let capabilities;
  try{
   capabilities=await w43ModelPort.capabilities({profile});
  }catch{deny(res,503,'W43_AGNO_MODEL_CAPABILITY_UNAVAILABLE');return true}
  if(!Array.isArray(capabilities)||!capabilities.every(validSelection)){
   deny(res,503,'W43_AGNO_MODEL_CAPABILITY_UNVERIFIED');return true;
  }
  if(isSelect&&!capabilities.some(m=>m.provider===selection.provider&&m.modelId===selection.modelId)){
   deny(res,422,'W43_MODEL_NOT_SUPPORTED');return true
  }
  const vaultState=async provider=>{
   if(provider==='LLAMACPP_LOCAL_QWEN3_8B_FREE')return {configured:true,status:'READY'};
   const v=await credentialVaultPort.status({profile,provider:nativeKeyProvider(provider)});
   if(!v||typeof v.configured!=='boolean')throw Error('W55_VAULT_STATE_UNVERIFIED');
   return {configured:v.configured,status:v.status??(v.configured?'READY':'SETUP_REQUIRED')};
  };
  let store;
  try{
   if(isSelect){
    const v=await vaultState(selection.provider);
    if(!v.configured){deny(res,409,selection.provider==='LLAMACPP_LOCAL_QWEN3_8B_FREE'?
      'MODEL_UNAVAILABLE':'MODEL_CREDENTIAL_SETUP_REQUIRED');return true}
    // W43 owner must confirm price/credit scope before any paid model call.
    if(typeof w43ModelPort.authorizeSelection!=='function'){
     deny(res,503,'W43_MODEL_BILLING_AUTHORIZATION_NOT_SIGNED');return true
    }
    const allowed=await w43ModelPort.authorizeSelection({profile,selection});
    if(allowed!==true){deny(res,403,'CLOUD_MODEL_COST_AUTHORIZATION_REQUIRED');return true}
    store=await modelConfigPort.select({profile,selection}); // W54 native protected persistent store only
   }else store=await modelConfigPort.read({profile});
  }catch{
   deny(res,503,'PROTECTED_MODEL_CONFIGURATION_UNAVAILABLE');return true
  }
  if(!safeConfiguration(store)){
   deny(res,503,'PROTECTED_MODEL_CONFIG_UNVERIFIED');return true
  }
  // Session must remain active after awaited native storage/provider checks.
  const final=sessionAuthority.sessionFor(req);
  if(!final||final.id!==session.id||final.record.rev!==session.record.rev){
   deny(res,401,'LOCAL_SESSION_REVOKED_DURING_MODEL_ACCESS');return true
  }
  // Single W46/W47 canonical signed DTO: do NOT promote public metadata
  // into an authorized model. Availability is native W54 config AND W55
  // protected credential eligibility AND exact original W43 capability.
  const models=[];
  try{
   for(const source of store.sources){
    const credential=await vaultState(source.provider);
    for(const modelId of source.models??[]){
     if(models.length>=24)break;
     if(!capabilities.some(m=>m.provider===source.provider&&m.modelId===modelId))continue;
     const configured=source.configured&&credential.configured;
     models.push({provider:source.provider,modelId,configured,
       available:configured&&source.available&&source.status==='READY',
       keyRequired:source.provider!=='LLAMACPP_LOCAL_QWEN3_8B_FREE',
       billingNotice:source.provider==='LLAMACPP_LOCAL_QWEN3_8B_FREE'?
         '本地可选模型，不消耗云端 API 额度':
         '使用本人独立 API Key，按实际服务商计费；必须通过原生授权'});
    }
   }
  }catch{deny(res,503,'W55_PROTECTED_MODEL_STATUS_UNAVAILABLE');return true}
  const selected=models.find(m=>store.selected&&
    m.provider===store.selected.provider&&m.modelId===store.selected.modelId&&
    m.available&&m.configured);
  // Independent session revocation may occur while native vault was awaited.
  const refreshed=sessionAuthority.sessionFor(req);
  if(!refreshed||refreshed.id!==session.id||refreshed.record.rev!==session.record.rev){
   deny(res,401,'LOCAL_SESSION_REVOKED_DURING_MODEL_STATUS');return true
  }
  write(res,200,{ok:true,authoritative:true,models,
   selectedProvider:selected?.provider??'',selectedModelId:selected?.modelId??'',
   // W55's real production Key lease is not yet signed. No browser
   // POST /credentials, even if Rust's test vault can store fake bytes.
   secureCredentialStorage:false,
   canSend:false,providerAuthorized:false,credentialsExposed:false});
  return true;
 };
}
