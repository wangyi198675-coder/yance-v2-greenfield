// W46 only consumes the original W47 native owner gateway.
// Routes below are integration requirements until W47 signs and mounts them.
// Never call a provider SDK or raw localhost bridge directly from the renderer.
export const CHANNEL_OWNER=Object.freeze({
 FB_PERSONAL:Object.freeze({slug:'fb-personal',source:'OFFICIAL_MAUTRIX_META'}),
 FB_PAGE:Object.freeze({slug:'fb-page',source:'PANCAKE_NATIVE'}),
 WHATSAPP_PERSONAL:Object.freeze({slug:'whatsapp-personal',source:'BAILEYS_NATIVE_SDK'}),
 TELEGRAM_PERSONAL:Object.freeze({slug:'telegram-personal',source:'TDLIB_JSON_NATIVE'})
});
const deny=x=>{throw Error(x)};
export function providerPath(channel,action){
 const c=CHANNEL_OWNER[channel];
 if(!c||!['status','setup'].includes(action))deny('CHANNEL_OWNER_ROUTE_INVALID');
 return '/api/v2/providers/'+c.slug+'/'+action;
}
async function read({channel,action,fetchImpl=globalThis.fetch}){
 if(typeof fetchImpl!=='function')deny('CHANNEL_OWNER_FETCH_REQUIRED');
 const response=await fetchImpl(providerPath(channel,action),{
  method:'GET',credentials:'same-origin',cache:'no-store',
  redirect:'error',referrerPolicy:'no-referrer'
 });
 if(!response?.ok)deny('CHANNEL_OWNER_HTTP_'+(response?.status||'UNAVAILABLE'));
 return response.json();
}
export function parseChannelState(channel,payload){
 const owner=CHANNEL_OWNER[channel];
 if(!owner||payload?.ok!==true||payload.channel!==channel||
   payload.source!==owner.source||payload.canSend!==false||
   !['WAITING_USER_AUTH','OFFLINE','ONLINE_VERIFIED'].includes(payload.status)||
   (payload.status==='ONLINE_VERIFIED'&&payload.authorizedByNativeOwner!==true))
  deny('CHANNEL_OWNER_UNVERIFIED_STATE');
 return Object.freeze({state:payload.status,online:payload.status==='ONLINE_VERIFIED'});
}
export function parseChannelSetup(channel,payload,now=Date.now()){
 const owner=CHANNEL_OWNER[channel];
 if(!owner||payload?.channel!==channel||payload.canSend!==false||
   payload.source!==owner.source||payload.userDecisionRequired!==true||
   !['OFFICIAL_SETUP_REQUIRED','WAITING_USER_AUTH','WAITING_QR_SCAN'].includes(payload.nextAction))
  deny('CHANNEL_OWNER_UNVERIFIED_SETUP');
 let qr=null;
 if(payload.nextAction==='WAITING_QR_SCAN'){
  if(channel!=='WHATSAPP_PERSONAL'||
    typeof payload.qrImageDataUrl!=='string'||
    !/^data:image\/png;base64,[A-Za-z0-9+/=]{100,250000}$/.test(payload.qrImageDataUrl)||
    !Number.isSafeInteger(payload.qrExpiresAt)||payload.qrExpiresAt<=now||
    !Number.isSafeInteger(payload.qrGeneration)||payload.qrGeneration<1)
   deny('CHANNEL_NATIVE_QR_NOT_VERIFIED');
  qr=Object.freeze({src:payload.qrImageDataUrl,expiresAt:payload.qrExpiresAt});
 }else if(payload.qrImageDataUrl!==undefined)deny('CHANNEL_UNEXPECTED_QR');
 let officialDocs=null;
 if(payload.officialSetup!==undefined){
  const url=new URL(payload.officialSetup);
  const allowed=channel==='FB_PERSONAL'?['docs.mau.fi']:
    channel==='FB_PAGE'?['pages.fm','developers.facebook.com']:
    channel==='TELEGRAM_PERSONAL'?['core.telegram.org']:[];
  if(url.protocol!=='https:'||url.username||url.password||
     !allowed.includes(url.hostname)||url.hash)
   deny('CHANNEL_UNTRUSTED_SETUP_URL');
  officialDocs=url.href;
 }
 let officialConnectUrl=null;
 if(payload.officialConnectUrl!==undefined){
  if(channel!=='FB_PERSONAL'||payload.nextAction!=='WAITING_USER_AUTH'||
     payload.officialConnectUrl!=='http://127.0.0.1:29321/api/v2/providers/fb-personal/connect')
    deny('CHANNEL_UNTRUSTED_NATIVE_AUTH_URL');
  officialConnectUrl=payload.officialConnectUrl;
 }
 return Object.freeze({nextAction:payload.nextAction,qr,officialDocs,officialConnectUrl});
}
export const checkChannel=async(args)=>parseChannelState(args.channel,await read({...args,action:'status'}));
export const setupChannel=async(args)=>parseChannelSetup(args.channel,await read({...args,action:'setup'}));
export function channelError(e){
 const v=String(e?.message||e||'');
 if(v.includes('CHANNEL_OWNER_HTTP_401'))return '本机身份尚未授权，不能连接该账号';
 if(v.includes('CHANNEL_OWNER_HTTP_403'))return '该平台授权已撤销或无权限';
 if(v.includes('CHANNEL_OWNER_HTTP_404'))return 'W47 尚未连接该平台的原生授权入口';
 if(v.includes('CHANNEL_OWNER_HTTP_503'))return '平台原生 SDK 或 Worker 尚未就绪';
 return '原生平台回执无法核验，未连接账号';
}


// R4 FB_PAGE native user action. GET /setup is documentation ONLY; it cannot
// start an authorization session. The actual W27 START is a CSRF-guarded POST,
// available exclusively to an original W54 NATIVE_FIRST_PARTY installation.
const PAGE_ACTIONS=Object.freeze({
 start:'start',pages:'pages',bind:'bind',refresh:'refresh'
});
export async function invokeFbPageNativeAuthorization({
 action,selectedProviderPageId,fetchImpl=globalThis.fetch
}={}){
 if(!Object.hasOwn(PAGE_ACTIONS,action))deny('W27_PAGE_ACTION_NOT_ALLOWED');
 if(typeof fetchImpl!=='function')deny('CHANNEL_OWNER_FETCH_REQUIRED');
 const current=await fetchImpl('/api/v2/local-session/status',{
  method:'GET',credentials:'same-origin',cache:'no-store',
  redirect:'error',referrerPolicy:'no-referrer'
 });
 if(!current?.ok)deny('W54_NATIVE_SESSION_STATUS_HTTP_'+(current?.status||'UNAVAILABLE'));
 const s=await current.json();
 if(s?.sessionKind!=='NATIVE_FIRST_PARTY'||s?.authorized!==true||
   typeof s.csrfToken!=='string'||!/^[a-f0-9]{64}$/.test(s.csrfToken))
  deny('W54_NATIVE_FIRST_PARTY_SESSION_REQUIRED');
 const body=action==='bind'?{selectedProviderPageId}:{};
 if(action==='bind'&&(typeof selectedProviderPageId!=='string'||
  !/^[0-9]{1,40}$/.test(selectedProviderPageId)))
  deny('W27_VERIFIED_PAGE_SELECTION_REQUIRED');
 const reply=await fetchImpl('/api/v2/providers/fb-page/authorization/'+PAGE_ACTIONS[action],{
  method:'POST',credentials:'same-origin',cache:'no-store',
  redirect:'error',referrerPolicy:'no-referrer',
  headers:{'content-type':'application/json','x-yance-csrf':s.csrfToken},
  body:JSON.stringify(body)
 });
 if(!reply?.ok)deny('W27_NATIVE_AUTH_HTTP_'+(reply?.status||'UNAVAILABLE'));
 const value=await reply.json();
 const statuses={
  start:['WAITING_USER_AUTH'],pages:['PAGE_SELECTION_REQUIRED'],
  bind:['AUTHORIZED_READ_ONLY'],refresh:[
    'WAITING_USER_AUTH','AUTHORIZED_READ_ONLY','REVOKED','REVOKED_OR_REBOUND'
  ]
 };
 if(value?.ok!==true||value?.channel!=='FB_PAGE'||
  value?.source!=='PANCAKE_NATIVE'||value?.canSend!==false||
  !statuses[action].includes(value.status))
  deny('W27_NATIVE_AUTH_RESPONSE_UNVERIFIED');
 if(action==='start'&&
  (value.entryAvailable!==true||value.credentialInput!=='NATIVE_PROTECTED_ONLY'))
  deny('W27_PROTECTED_TOKEN_ENTRY_NOT_VERIFIED');
 if(action==='pages'&&(!Array.isArray(value.pages)||value.pages.length>100||
   value.pages.some(x=>typeof x?.providerPageId!=='string'||
     !/^[0-9]{1,40}$/.test(x.providerPageId))))
  deny('W27_PAGE_CHOICES_NOT_VERIFIED');
 if(action==='bind'&&(
  value.identityVerified!==true||
  value.providerPageId!==selectedProviderPageId||
  !Number.isSafeInteger(value.bindingRevision)||value.bindingRevision<1))
  deny('W24_PAGE_BINDING_NOT_VERIFIED');
 return Object.freeze(value);
}


// Token bytes exist only as a temporary user form value and one authenticated
// same-origin POST to ORIGINAL W55 custody. Never cache, echo, or log secrets.
export async function saveFbPageCredentialConfiguration({
 pageId,pagePublicApiToken,fetchImpl=globalThis.fetch
}={}){
 if(typeof fetchImpl!=='function')deny('W55_SECURE_FETCH_REQUIRED');
 if(typeof pageId!=='string'||!/^[0-9]{1,40}$/.test(pageId)||
   typeof pagePublicApiToken!=='string'||pagePublicApiToken.length<8||pagePublicApiToken.length>480)
   deny('W55_TOKEN_INPUT_REQUIRED');
 const auth=await fetchImpl('/api/v2/local-session/status',{
  method:'GET',credentials:'same-origin',cache:'no-store',
  redirect:'error',referrerPolicy:'no-referrer'
 });
 if(!auth?.ok)deny('W55_CURRENT_LOCAL_SESSION_UNAVAILABLE');
 let s=await auth.json();
 if(s?.authorized!==true){
  // Reuse original Web-private session on explicit Save; no extra login.
  const started=await fetchImpl('/api/v2/local-session/web-private-start',{
   method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',
   referrerPolicy:'no-referrer',headers:{'content-type':'application/json'},body:'{}'
  });
  if(!started?.ok)deny('W55_EXISTING_WEB_SESSION_UNAVAILABLE');
  const renewed=await fetchImpl('/api/v2/local-session/status',{
   method:'GET',credentials:'same-origin',cache:'no-store',
   redirect:'error',referrerPolicy:'no-referrer'
  });
  if(!renewed?.ok)deny('W55_EXISTING_WEB_SESSION_UNAVAILABLE');
  s=await renewed.json();
 }
 if(s?.authorized!==true||
   !['WEB_LOCAL_PRIVATE','NATIVE_FIRST_PARTY'].includes(s.sessionKind)||
   !/^[a-f0-9]{64}$/.test(s.csrfToken??''))
   deny('W55_CURRENT_LOCAL_SESSION_REQUIRED');
 const response=await fetchImpl('/api/v2/providers/fb-page/authorization/configure',{
  method:'POST',credentials:'same-origin',cache:'no-store',
  redirect:'error',referrerPolicy:'no-referrer',
  headers:{'content-type':'application/json','x-yance-csrf':s.csrfToken},
  body:JSON.stringify({pageId,pagePublicApiToken})
 });
 if(!response?.ok)deny('W55_PANCAKE_CONFIG_HTTP_'+(response?.status??'UNAVAILABLE'));
 const receipt=await response.json();
 if(receipt?.ok!==true||receipt.status!=='CREDENTIALS_SAVED_NOT_PAGE_AUTHORIZED'||
   receipt.source!=='W55_OS_PROTECTED_CURRENT_USER'||
   receipt.credentialValueReturned!==false||receipt.canSend!==false)
   deny('W55_STORAGE_RECEIPT_UNVERIFIED');
 return Object.freeze({status:receipt.status,saved:true});
}
