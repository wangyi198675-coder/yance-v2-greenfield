// W46 signed UI interpretation of W47's server-owned cookie session.
// Browser JavaScript state is NEVER session authority. A user can fake the DOM,
// but W47 still checks its HttpOnly session, origin, CSRF and server issuer.
export const PAIRING_CODE=/^[a-f0-9]{64}$/;
const MAX_SESSION_TTL_MS=15*60_000; // W47 authority module hard maximum.
export function checkedStatus(payload,{now=Date.now()}={}){
 if(!payload||payload.ok!==true||typeof payload.paired!=='boolean'||
    payload.canSend!==false||payload.providerAuthorized!==false)
   throw Error('LOCAL_SESSION_UNTRUSTED_STATUS');
 if(!payload.paired)return Object.freeze({available:true,paired:false,expiresAt:null,csrfToken:''});
 if(!Number.isSafeInteger(payload.expiresAt)||
    payload.expiresAt<=now||payload.expiresAt>now+MAX_SESSION_TTL_MS||
    typeof payload.csrfToken!=='string'||!PAIRING_CODE.test(payload.csrfToken))
   throw Error('LOCAL_SESSION_INCOMPLETE_OR_EXPIRED');
 return Object.freeze({available:true,paired:true,
   expiresAt:payload.expiresAt,csrfToken:payload.csrfToken});
}
// Do not reflect uncontrolled HTTP error values into the UI. In particular
// a malicious response containing the submitted code must never echo it.
const KNOWN_CODES=Object.freeze({
 PAIRING_NOT_APPROVED:'配对码无效、已使用或已过期',
 TRUSTED_NATIVE_PAIRING_NOT_AVAILABLE:'本机终端配对尚未启用',
 TRUSTED_NATIVE_PAIRING_UNAVAILABLE:'本机终端授权暂不可用',
 LOCAL_SESSION_REQUIRED:'当前本机会话无效',
 LOCAL_SESSION_CSRF_REQUIRED:'当前本机会话校验失败',
 LOCAL_SESSION_ORIGIN_REQUIRED:'请求来源未获允许',
 ONE_TIME_PAIRING_CODE_REQUIRED:'配对码格式不正确',
 INVALID_JSON:'服务端拒绝无效的数据格式',
 LOCAL_SESSION_METHOD_NOT_ALLOWED:'当前操作不可用'
});
export function safeSessionError(payload,status){
 if(typeof payload?.error==='string'&&Object.hasOwn(KNOWN_CODES,payload.error))
   return KNOWN_CODES[payload.error];
 return Number.isInteger(status)&&status>=400?
   '服务端拒绝请求（HTTP '+status+'）':'当前操作未获得服务端确认';
}
export const validPairingCode=x=>typeof x==='string'&&PAIRING_CODE.test(x);
