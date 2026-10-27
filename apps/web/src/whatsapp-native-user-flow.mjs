// W46 normal-user WhatsApp connection flow -> EXISTING W47 original native Owner.
// Account locator is a server-verified lookup selector, never an Account K or
// a browser authorization claim. No raw Baileys socket, token or QR persistence.
const prefix='/api/v2/providers/whatsapp-personal/native';
const allowedStates=new Set(['WAITING_USER_AUTH','STARTING_NATIVE_SDK',
  'WAITING_QR_SCAN','ONLINE','DISCONNECTED','REVOKED','LOGGED_OUT',
  'HOLD_IDENTITY','HOLD_VAULT']);
const fail=code=>{throw Object.assign(new Error(code),{code})};
const safeQr=q=>q&&q.ok===true&&
  q.source==='BAILEYS_NATIVE_CONNECTION_UPDATE'&&
  typeof q.imageDataUrl==='string'&&
  /^data:image\/png;base64,[A-Za-z0-9+/=]{100,250000}$/.test(q.imageDataUrl)&&
  Number.isSafeInteger(q.expiresAt)&&q.expiresAt>Date.now()&&
  Number.isSafeInteger(q.generation)&&q.generation>=1;
const request=async(path,{fetchImpl=globalThis.fetch,method='GET',csrfToken,body}={})=>{
  if(typeof fetchImpl!=='function')fail('WHATSAPP_FETCH_REQUIRED');
  const headers=method==='POST'?{'Content-Type':'application/json',
    'X-Yance-CSRF':csrfToken??''}:{};
  const response=await fetchImpl(path,{method,headers,
    credentials:'same-origin',cache:'no-store',redirect:'error',
    referrerPolicy:'no-referrer',...(body!==undefined?{body:JSON.stringify(body)}:{})});
  if(!response?.ok)fail('WHATSAPP_HTTP_'+(response?.status??'UNAVAILABLE'));
  const result=await response.json();
  if(result?.ok!==true||result.canSend!==false)fail('WHATSAPP_OWNER_UNVERIFIED');
  return result;
};
async function authorizedCsrf(fetchImpl){
  const response=await fetchImpl('/api/v2/local-session/status',{
    method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',
    referrerPolicy:'no-referrer'});
  if(!response?.ok)fail('WHATSAPP_LOCAL_SESSION_REQUIRED');
  let r=await response.json();
  if(r?.ok===true&&r.paired===false){
    // Start the EXISTING same-origin WEB_LOCAL_PRIVATE session automatically.
    // This is only a local browser cookie, NOT WhatsApp pairing/consent.
    const activated=await fetchImpl('/api/v2/local-session/web-private-start',{
      method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',
      referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},body:'{}'
    });
    if(activated?.ok)r=await activated.json();
  }
  if(r?.ok!==true||r.paired!==true||
    !['NATIVE_FIRST_PARTY','WEB_LOCAL_PRIVATE'].includes(r.sessionKind)||
    !/^[a-f0-9]{64}$/.test(r.csrfToken??'')||
    r.expiresAt<=Date.now())fail('WHATSAPP_LOCAL_SESSION_REQUIRED');
  // Server W47 still independently checks the actual cookie/W24/CSRF; the
  // browser token never authorizes WhatsApp pairing on its own.
  return r.csrfToken;
}
export async function readWhatsAppNative({fetchImpl=globalThis.fetch}={}){
  await authorizedCsrf(fetchImpl);
  const value=await request(prefix+'/status',{fetchImpl});
  if(value.channel!=='WHATSAPP_PERSONAL'||value.source!=='BAILEYS_NATIVE_SDK'||
    !allowedStates.has(value.state)||value.connected!==(value.state==='ONLINE')||
    (value.state==='ONLINE'&&(value.accountIdentityVerified!==true||
     !value.account||!value.account.platformJid)))
    fail('WHATSAPP_NATIVE_STATUS_INVALID');
  return Object.freeze({state:value.state,online:value.state==='ONLINE',
    account:value.state==='ONLINE'?value.account:null,
    historyState:value.historyState??null,qrAvailable:value.qrAvailable===true,
    lastError:value.lastError??null});
}
export async function connectWhatsAppNative({fetchImpl=globalThis.fetch}={}){
  const csrfToken=await authorizedCsrf(fetchImpl);
  const result=await request(prefix+'/authorize',{fetchImpl,method:'POST',
    csrfToken,body:{accountLocator:'current-own-whatsapp'}});
  if(result.channel!=='WHATSAPP_PERSONAL'||
    !['STARTING_NATIVE_SDK','WAITING_QR_SCAN','ONLINE'].includes(result.state))
    fail('WHATSAPP_NATIVE_CONNECT_RESULT_INVALID');
  return Object.freeze({state:result.state,connected:result.connected===true});
}
export async function readWhatsAppNativeQr({fetchImpl}={}){
  const r=await request(prefix+'/qr',{fetchImpl});
  if(!safeQr(r))fail('WHATSAPP_NATIVE_QR_INVALID');
  return Object.freeze({src:r.imageDataUrl,expiresAt:r.expiresAt,
    generation:r.generation});
}
export async function changeWhatsAppNativeConnection(action,{fetchImpl=globalThis.fetch}={}){
  if(!['disconnect','revoke'].includes(action))fail('WHATSAPP_UNSUPPORTED_ACTION');
  const csrfToken=await authorizedCsrf(fetchImpl);
  const r=await request(prefix+'/'+action,{fetchImpl,method:'POST',csrfToken,body:{}});
  if(r.connected!==false||
    (action==='revoke'&&r.state!=='REVOKED')||
    (action==='disconnect'&&r.state!=='WAITING_USER_AUTH'))
    fail('WHATSAPP_NATIVE_ACTION_NOT_CONFIRMED');
  return Object.freeze({state:r.state,connected:false});
}
export function whatsappNativeError(error){
  const code=String(error?.code??error?.message??'');
  if(code==='WHATSAPP_LOCAL_SESSION_REQUIRED'||code==='WHATSAPP_HTTP_401')
    return '当前本机会话尚未就绪，无法连接WhatsApp';
  if(code==='WHATSAPP_HTTP_403')return '当前WhatsApp账号授权已撤销或无权限';
  if(code==='WHATSAPP_HTTP_409')return '当前连接步骤尚未就绪，可重试或检查连接状态';
  if(code==='WHATSAPP_HTTP_503')return 'WhatsApp原生账号连接暂未接通，请查看连接状态';
  return 'WhatsApp连接未通过服务端确认，请检查状态';
}
