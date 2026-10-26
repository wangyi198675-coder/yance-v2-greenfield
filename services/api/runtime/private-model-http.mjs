// W47 single existing W43 PRIVATE Agent model selection boundary.
// User cloud keys MUST remain in original W55 approved native vault;
// never receive / return an API Key from HTTP, headers, localStorage or logs.
// Default ports are NULL until W54/W55/W43 security-signed native adapters.
import {timingSafeEqual} from 'node:crypto';
const catalog=Object.freeze([
 Object.freeze({provider:'openrouter',displayName:'OpenRouter',requiresUserApiKey:true,requiresLocalModel:false}),
 Object.freeze({provider:'openai',displayName:'OpenAI API',requiresUserApiKey:true,requiresLocalModel:false}),
 Object.freeze({provider:'local',displayName:'Local Qwen3',requiresUserApiKey:false,requiresLocalModel:true})
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
const isProvider=v=>['local','openrouter','openai'].includes(v);
const validModel=v=>typeof v==='string'&&v.length>=2&&v.length<=128&&
 /^[A-Za-z0-9][A-Za-z0-9._:/+-]*$/.test(v);
const validSelection=s=>s&&isProvider(s.provider)&&validModel(s.modelId);
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
 modelConfigPort=null,credentialVaultPort=null,w43ModelPort=null
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
  if(!session){deny(res,401,'LOCAL_SESSION_REQUIRED');return true}
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
   if(provider==='local')return {configured:true,status:'READY'};
   const v=await credentialVaultPort.status({profile,provider});
   if(!v||typeof v.configured!=='boolean')throw Error('W55_VAULT_STATE_UNVERIFIED');
   return {configured:v.configured,status:v.status??(v.configured?'READY':'SETUP_REQUIRED')};
  };
  let store;
  try{
   if(isSelect){
    const v=await vaultState(selection.provider);
    if(!v.configured){deny(res,409,selection.provider==='local'?
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
  const sources=store.sources.map(({provider,configured,available,status,models})=>
   ({provider,configured,available,status,...(models?{models}:{})}));
  write(res,200,{ok:true,selected:store.selected,sources,
   canSend:false,providerAuthorized:false,credentialsExposed:false});
  return true;
 };
}
