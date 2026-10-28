// W47 thin first-party gateway for W46 EXISTING Accounts UI and original W26–29.
// No login, QR creation, SDK reimplementation, sender, new DB, or secret.
// SDK diagnostics are NOT user-account authority. Only original W24 current K
// + an authenticated W54 native installed-app Session can mark ONLINE_VERIFIED.
const details=Object.freeze({
 'fb-personal':{channel:'FB_PERSONAL',source:'OFFICIAL_MAUTRIX_META',
  docs:'https://docs.mau.fi/bridges/go/setup.html?bridge=meta'},
 'fb-page':{channel:'FB_PAGE',source:'PANCAKE_NATIVE',docs:'https://pages.fm/'},
 'whatsapp-personal':{channel:'WHATSAPP_PERSONAL',source:'BAILEYS_NATIVE_SDK'},
 'telegram-personal':{channel:'TELEGRAM_PERSONAL',source:'TDLIB_JSON_NATIVE',
  docs:'https://core.telegram.org/tdlib/docs/'}
});
const send=(res,code,value)=>{res.writeHead(code,{
 'content-type':'application/json; charset=utf-8','cache-control':'no-store',
 'x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin',
 'referrer-policy':'no-referrer','vary':'Origin, Sec-Fetch-Site'
});res.end(JSON.stringify(value))};
const deny=(res,status,error)=>send(res,status,{ok:false,error,canSend:false});
const sessionCurrent=(authority,req)=>{const s=authority.sessionFor(req);
 return s?.record?.kind==='NATIVE_FIRST_PARTY'?s:null};
const sha40=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const sha64=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
function w26Diagnostics(a){
 return a?.ok===true&&a.channel==='FB_PERSONAL'&&a.provider==='mautrix-meta'&&
  a.source==='REAL_OFFICIAL_BINARY'&&a.binaryIntegrity==='OFFICIAL_SHA_VERIFIED'&&
  sha40(a.upstream?.upstreamCommit)&&sha64(a.upstream?.binarySha256)&&
  a.canSend===false&&a.accountIdentityVerified===false&&
  a.realAccountState==='WAITING_USER_AUTH'&&
  typeof a.bridgeState==='string'&&a.bridgeState.length<=90;
}
export function createNativeProviderGateway({
 sessionAuthority,readW26Status=null,readSdkOwnerStatus=null,
 resolveW54Principal=null,authorizeW24Account=null
}={}){
 if(typeof sessionAuthority?.sessionFor!=='function')throw Error('ORIGINAL_W47_SESSION_REQUIRED');
 if([readW26Status,readSdkOwnerStatus,resolveW54Principal,authorizeW24Account]
  .some(v=>v!==null&&typeof v!=='function'))throw Error('ORIGINAL_NATIVE_OWNER_PORT_INVALID');
 return async(req,res,url)=>{
  const match=/^\/api\/v2\/providers\/(fb-personal|fb-page|whatsapp-personal|telegram-personal)\/(status|setup)$/.exec(url.pathname);
  if(!match)return false;
  if(req.method!=='GET'||url.search){deny(res,405,'NATIVE_PROVIDER_READ_ONLY');return true}
  const info=details[match[1]],action=match[2],accountSession=sessionCurrent(sessionAuthority,req);
  // Public setup contains ONLY original Owner's documented official URLs and
  // an explicit user action; never a signed QR, login state, personal account
  // or credentials. Real QR requires trusted W28/Tauri native renderer path.
  if(action==='setup'&&!accountSession){
   // Reuse the already-running original W26 official login page; this is
   // only a user-initiated OPEN link, never a fabricated authenticated account.
   let w26Connect=null;
   if(info.channel==='FB_PERSONAL'&&readW26Status?.officialConnectUrl){
    try{const actual=await readW26Status();
     if(w26Diagnostics(actual))w26Connect=readW26Status.officialConnectUrl;
    }catch{}
   }
   send(res,200,{channel:info.channel,source:info.source,
    userDecisionRequired:true,nextAction:w26Connect?'WAITING_USER_AUTH':'OFFICIAL_SETUP_REQUIRED',
    ...(w26Connect?{officialConnectUrl:w26Connect}:{}),
    ...(info.docs?{officialSetup:info.docs}:{}),
    canSend:false,nativeSessionRequiredForAccountConnection:true});
   return true;
  }
  if(!accountSession && info.channel!=='FB_PERSONAL'){
   deny(res,401,'W54_SIGNED_INSTALLED_SESSION_REQUIRED');return true
  }
  let sdk=null;
  if(info.channel==='FB_PERSONAL'&&readW26Status){
   try{sdk=await readW26Status();
    if(!w26Diagnostics(sdk))throw Error('W26_REAL_STATUS_NOT_VERIFIED');
   }catch{deny(res,503,'W26_ORIGINAL_BRIDGE_STATUS_UNAVAILABLE');return true}
   // A verified W26 official executable and Matrix registration are only SDK
   // diagnostics; no Facebook account is authenticated or in W24 current K.
   if(!accountSession){
    send(res,200,{ok:true,channel:info.channel,source:info.source,
     status:sdk.nativeProviderSessionConnected===true?
       'UPSTREAM_CONNECTED_BINDING_PENDING':'WAITING_USER_AUTH',
     nativeProviderSessionConnected:sdk.nativeProviderSessionConnected===true,
     authorizedByNativeOwner:false,canSend:false,
     bridgeState:sdk.bridgeState,upstreamVersion:sdk.upstream.version,
     sdkReportedOnly:true,accountIdentityVerified:false});
    return true
   }
  }
  if(!accountSession){deny(res,401,'W54_SIGNED_INSTALLED_SESSION_REQUIRED');return true}
  // W54 must attest the official current Windows process/user and renderer,
  // W24 the actual native provider Account binding and current revocation.
  if(!resolveW54Principal||!authorizeW24Account||!readSdkOwnerStatus){
   if(action==='setup'){
    send(res,200,{channel:info.channel,source:info.source,
     userDecisionRequired:true,nextAction:'OFFICIAL_SETUP_REQUIRED',
     ...(info.docs?{officialSetup:info.docs}:{}),canSend:false,
     nativeAuthorizationAvailable:false});return true
   }
   if(sdk){
    send(res,200,{ok:true,channel:info.channel,source:info.source,
     status:sdk.nativeProviderSessionConnected===true?
       'UPSTREAM_CONNECTED_BINDING_PENDING':'WAITING_USER_AUTH',
     nativeProviderSessionConnected:sdk.nativeProviderSessionConnected===true,
     authorizedByNativeOwner:false,canSend:false,
     sdkReportedOnly:true,accountIdentityVerified:false,
     bridgeState:sdk.bridgeState});return true
   }
   deny(res,503,'ORIGINAL_NATIVE_PROVIDER_NOT_CONNECTED');return true
  }
  let native,reading,authorized;
  try{
   native=await resolveW54Principal({session:accountSession,operation:'READ_PROVIDER_STATUS'});
   if(native?.verified!==true||native.source!=='W54_NATIVE_CURRENT_USER'||
      !native.principalRef||!native.installationRef||
      !Number.isSafeInteger(native.revocationGeneration))
    throw Error('W54_NATIVE_PROFILE_UNVERIFIED');
   reading=await readSdkOwnerStatus({channel:info.channel,native});
   // The upstream Owner MUST attest actual account identity and a real live
   // session; a simple running SDK process is NEVER ONLINE_VERIFIED.
   authorized=reading?.status==='ONLINE_VERIFIED'&&
    reading.authorizedByNativeOwner===true&&reading.accountIdentityVerified===true&&
    await authorizeW24Account({channel:info.channel,native,reading})===true;
   const latest=sessionCurrent(sessionAuthority,req);
   if(!latest||latest.id!==accountSession.id||latest.record.rev!==accountSession.record.rev){
    deny(res,401,'LOCAL_SESSION_REVOKED_DURING_PROVIDER_READ');return true
   }
   const current=await resolveW54Principal({session:latest,operation:'READ_PROVIDER_STATUS'});
   if(current?.verified!==true||current.principalRef!==native.principalRef||
      current.installationRef!==native.installationRef||
      current.revocationGeneration!==native.revocationGeneration){
    deny(res,409,'W54_NATIVE_SESSION_EPOCH_CHANGED');return true
   }
  }catch{deny(res,503,'NATIVE_PROVIDER_OWNER_NOT_VERIFIED');return true}
  // Never expose provider tokens, source identifiers or personal data in
  // the account status/authorization entry. It cannot trigger login on GET.
  if(action==='setup'){
   send(res,200,{channel:info.channel,source:info.source,
    userDecisionRequired:true,nextAction:'OFFICIAL_SETUP_REQUIRED',
    ...(info.docs?{officialSetup:info.docs}:{}),canSend:false});return true
  }
  send(res,200,{ok:true,channel:info.channel,source:info.source,
   status:authorized?'ONLINE_VERIFIED':'WAITING_USER_AUTH',
   authorizedByNativeOwner:authorized,canSend:false,
   accountIdentityVerified:authorized});
  return true;
 };
}
// An explicitly configured LOCAL DEV diagnostic port cannot authorize any
// account/model/send. No arbitrary URL, redirects, cookies or HTTP secrets.
export function makeW26DiagnosticPort(value){
 if(value===undefined||value===null||value==='')return null;
 if(typeof value!=='string'||!/^\d{4,5}$/.test(value)||
  +value<1024||+value>65535)throw Error('W26_DEV_STATUS_PORT_INVALID');
 const read=async()=>{
  const response=await fetch('http://127.0.0.1:'+Number(value)+
   '/api/v2/providers/fb-personal/status',
   {method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(2500)});
  if(!response.ok||!String(response.headers.get('content-type')).includes('application/json'))
   throw Error('W26_REAL_STATUS_UNAVAILABLE');
  const raw=await response.text();
  if(raw.length>12000)throw Error('W26_REAL_STATUS_OVERSIZED');
  return JSON.parse(raw);
 };
 // The original installed W26 manager serves this verified local page.
 // Do not expose an arbitrary URL or treat it as an authenticated account.
 Object.defineProperty(read,'officialConnectUrl',{value:
  Number(value)===29321?'http://127.0.0.1:29321/api/v2/providers/fb-personal/connect':null});
 return read;
}
