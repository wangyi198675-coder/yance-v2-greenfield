// W47 read-only discovery of REAL EXISTING nine-category settings contracts.
// This is NOT a preference database, model settings substitute or fake SAVE.
// W46 consumes the declared ORIGINAL handlers, never POSTs to this read-only route.
const catalog=Object.freeze([
 {id:'general',read:[{method:'GET',path:'/api/v2/runtime/health',scope:'LOCAL_LOOPBACK'}],
  write:[],persistedWrite:false,status:'AUTHORITATIVE_READ_ONLY'},
 {id:'accounts',read:[
  {method:'GET',path:'/api/v2/providers/fb-personal/status',scope:'CURRENT_NATIVE_ACCOUNT_OR_WAITING_USER_AUTH'},
  {method:'GET',path:'/api/v2/providers/fb-page/status',scope:'CURRENT_NATIVE_ACCOUNT_OR_WAITING_USER_AUTH'},
  {method:'GET',path:'/api/v2/providers/whatsapp-personal/status',scope:'CURRENT_NATIVE_ACCOUNT_OR_WAITING_USER_AUTH'},
  {method:'GET',path:'/api/v2/providers/telegram-personal/status',scope:'CURRENT_NATIVE_ACCOUNT_OR_WAITING_USER_AUTH'}],
  write:[],persistedWrite:false,status:'REAL_CHANNEL_AUTH_OWNER_PORT_PENDING'},
 {id:'model',read:[
  {method:'GET',path:'/api/v2/private-brain/model-catalog',scope:'MODEL_CANDIDATES_ONLY'},
  {method:'GET',path:'/api/v2/private-brain/model-config',scope:'CURRENT_PRIVATE_SESSION'},
  {method:'GET',path:'/api/v2/private-brain/cloud-keys',scope:'W55_CURRENT_USER_WIN_CRED_REDACTED'}],
  write:[
   {method:'POST',path:'/api/v2/private-brain/model-selection',scope:'PRIVATE_SESSION_CSRF_AND_PAID_APPROVAL'},
   {method:'POST',path:'/api/v2/private-brain/cloud-keys',scope:'W55_NATIVE_WIN_CRED_CSRF_AND_PAID_APPROVAL'},
   {method:'DELETE',path:'/api/v2/private-brain/cloud-keys',scope:'W55_NATIVE_WIN_CRED_CSRF_REVOKE'}],
  persistedWrite:true,status:'ORIGINAL_PRIVATE_MODEL_PORT_ONLY'},
 {id:'translation',read:[{method:'GET',path:'/api/v2/translations',scope:'W45_VERIFIED_SOURCE_MESSAGE'}],
  write:[],persistedWrite:false,status:'W45_NATIVE_TRANSLATION_AND_ATTESTOR_NOT_CONNECTED'},
 {id:'media',read:[{method:'GET',path:'/api/v2/media/capabilities',scope:'LOCAL_SESSION_W23_NATIVE_FORMATS'}],
  write:[],persistedWrite:false,status:'REAL_ACCOUNT_MEDIA_UPLOAD_HOLD'},
 {id:'theme',read:[],write:[],persistedWrite:false,
  status:'EXISTING_APP_VUE_THEME_EVENTS_ONLY_NO_SERVER_PREFERENCE_STORE'},
 {id:'notify',read:[],write:[],persistedWrite:false,
  status:'W05_NATIVE_NOTIFICATION_SETTINGS_OWNER_PORT_NOT_CONNECTED'},
 {id:'privacy',read:[{method:'GET',path:'/api/v2/local-session/status',scope:'LOCAL_CURRENT_SESSION'}],
  write:[{method:'POST',path:'/api/v2/local-session/logout',scope:'CURRENT_LOCAL_SESSION_ORIGINAL_REVOKE'}],
  persistedWrite:true,status:'EXISTING_SESSION_REVOCATION_ONLY'},
 {id:'diagnostics',read:[
  {method:'GET',path:'/api/v2/runtime/health',scope:'LOCAL_RUNTIME'},
  {method:'GET',path:'/api/v2/runtime/version',scope:'LOCAL_SHA'},
  {method:'GET',path:'/api/v2/runtime/capabilities',scope:'NATIVE_OWNER_AVAILABILITY'}],
  write:[],persistedWrite:false,status:'AUTHORITATIVE_READ_ONLY'}
]);
const send=(res,status,body)=>{
 res.writeHead(status,{'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store','x-content-type-options':'nosniff',
  'cross-origin-resource-policy':'same-origin','vary':'Origin, Sec-Fetch-Site'});
 res.end(JSON.stringify(body));
};
export function createW47NativeSettingsCatalog({sessionAuthority,webOrigin}={}){
 if(typeof sessionAuthority?.sessionFor!=='function'||typeof webOrigin!=='string')
  throw Error('ORIGINAL_LOCAL_SESSION_REQUIRED');
 return async(req,res,url)=>{
  const m=/^\/api\/v2\/settings\/(?:capabilities|([a-z-]{3,30}))$/.exec(url.pathname);
  if(!m)return false;
  if(req.method!=='GET'){
   send(res,405,{ok:false,error:'SETTINGS_DISCOVERY_READ_ONLY',canSend:false});return true;
  }
  if(req.headers.origin&&req.headers.origin!==webOrigin){
   send(res,403,{ok:false,error:'ORIGIN_NOT_ALLOWED',canSend:false});return true;
  }
  const session=sessionAuthority.sessionFor(req);
  if(!session){
   send(res,401,{ok:false,error:'LOCAL_SESSION_REQUIRED',canSend:false});return true;
  }
  if(url.search){
   send(res,422,{ok:false,error:'SETTINGS_QUERY_NOT_SUPPORTED',canSend:false});return true;
  }
  const entries=m[1]?catalog.filter(x=>x.id===m[1]):catalog;
  if(!entries.length){
   send(res,404,{ok:false,error:'SETTINGS_CATEGORY_UNKNOWN',canSend:false});return true;
  }
  send(res,200,{ok:true,authoritative:true,source:'W47_ORIGINAL_SETTINGS_CONTRACT_DISCOVERY',
   dataAuthority:'DECLARED_ORIGINAL_ENDPOINT_PATHS_NOT_SAVED_PREFERENCES',
   categories:entries,canSend:false,noSyntheticWrites:true});
  return true;
 };
}
