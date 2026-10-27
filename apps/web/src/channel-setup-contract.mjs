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
 // Only accept account identities from a positively attested native owner.
 // Never infer a verified account from channel status, login button or mock data.
 let accounts=null;
 if(payload.status==='ONLINE_VERIFIED'&&payload.authorizedByNativeOwner===true&&
    Array.isArray(payload.accounts)&&payload.accounts.length<=100){
  const seen=new Set();
  const accepted=[];
  for(const item of payload.accounts){
   const accountId=typeof item?.accountId==='string'?item.accountId.trim():'';
   const displayName=typeof item?.displayName==='string'?item.displayName.trim():'';
   if(!accountId||accountId.length>160||!displayName||displayName.length>130||
      seen.has(accountId)||item?.identityVerified!==true){
    accounts=null;break;
   }
   seen.add(accountId);
   accepted.push(Object.freeze({accountId,displayName,
     state:item?.state==='ONLINE_VERIFIED'?'ONLINE_VERIFIED':'OFFLINE'}));
  }
  if(accepted.length===payload.accounts.length)accounts=Object.freeze(accepted);
 }
 return Object.freeze({state:payload.status,online:payload.status==='ONLINE_VERIFIED',accounts});
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
