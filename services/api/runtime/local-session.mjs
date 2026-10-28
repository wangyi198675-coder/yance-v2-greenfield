// W47: minimal in-memory local session; local user session != provider consent.
// The issuer is a SERVER-INJECTED verifier of an actual user-approved native action.
// The production W47 API deliberately passes no issuer until W54 signs that action.
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';

const COOKIE='yance_local_session';
// Browser cookies ignore TCP ports: multiple loopback preview APIs must not
// overwrite each other's PRIVATE session. Stable opt-in namespace, same W47
// authority/CSRF/HttpOnly policy; default remains byte-for-byte compatible.
const webCookieSuffix=process.env.YANCE_W47_WEB_COOKIE_SUFFIX;
if(webCookieSuffix!==undefined&&!/^[a-z0-9]{8,24}$/.test(webCookieSuffix))
 throw Error('W47_WEB_COOKIE_SUFFIX_INVALID');
const WEB_COOKIE='yance_web_private_session'+(webCookieSuffix?'_'+webCookieSuffix:'');
const p0Trace=process.env.P0_LOCAL_SESSION_DIAG==='1';
const TTL_MS=5*60*1000;
const MAX_REQUEST_BYTES=2048;
const digest=s=>createHash('sha256').update(s).digest('hex');
const json=(res,status,value,headers={})=>{
 res.writeHead(status,{'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store','x-content-type-options':'nosniff',...headers});
 res.end(JSON.stringify(value));
};
const reject=(res,status,error)=>json(res,status,{ok:false,error,canSend:false});
const cookieFor=(id,ttlMs,name=COOKIE)=>name+'='+id+'; HttpOnly; SameSite=Strict; Path=/; Max-Age='+Math.ceil(ttlMs/1000);
const eraseCookie=(name=COOKIE)=>name+'=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0';
const cookieId=(req,name=COOKIE)=>{
 const hdr=req.headers.cookie;
 if(typeof hdr!=='string'||hdr.length>4096)return null;
 const found=hdr.split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='));
 if(found.length!==1)return null;
 const id=found[0].slice(name.length+1);
 return /^[a-f0-9]{64}$/.test(id)?id:null;
};
const headerValue=(req,name)=>typeof req.headers[name]==='string'?req.headers[name]:null;
const readJson=async req=>{
 if(req.headers['content-type']!=='application/json')throw Object.assign(Error('JSON_REQUIRED'),{status:415});
 const chunks=[];let bytes=0;
 for await (const chunk of req){
  bytes+=chunk.length;
  if(bytes>MAX_REQUEST_BYTES)throw Object.assign(Error('BODY_TOO_LARGE'),{status:413});
  chunks.push(chunk);
 }
 let value;
 try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'))}
 catch{throw Object.assign(Error('INVALID_JSON'),{status:422})}
 if(!value||Array.isArray(value)||typeof value!=='object')throw Object.assign(Error('JSON_OBJECT_REQUIRED'),{status:422});
 return value;
};
export function createLocalSessionAuthority({approvePairing=null,
 approveNativeLaunch=null,now=()=>Date.now(),ttlMs=TTL_MS,
 nativeTtlMs=12*60*60*1000}={}){
 if(approvePairing!==null&&typeof approvePairing!=='function')throw Error('TRUSTED_ISSUER_MUST_BE_SERVER_CALLBACK');
 if(approveNativeLaunch!==null&&typeof approveNativeLaunch!=='function')
  throw Error('NATIVE_START_AUTHORITY_MUST_BE_SERVER_CALLBACK');
 if(!Number.isSafeInteger(nativeTtlMs)||nativeTtlMs<60_000||nativeTtlMs>24*60*60*1000)
  throw Error('NATIVE_SESSION_TTL_OUT_OF_RANGE');
 if(!Number.isSafeInteger(ttlMs)||ttlMs<1000||ttlMs>15*60*1000)throw Error('SESSION_TTL_OUT_OF_RANGE');
 const sessions=new Map();
 let revision=0;
 const expire=()=>{
  for(const [key,v] of sessions)if(now()>=v.expiresAt)sessions.delete(key);
 };
 const sessionFor=req=>{
  expire();
  // Browser QA and native apps share hostname 127.0.0.1 but have different
  // ports: keep their cookies separate so QA never overwrites native access.
  for(const name of [COOKIE,WEB_COOKIE]){
   const id=cookieId(req,name);
   if(!id)continue;
   const record=sessions.get(digest(id));
   if(p0Trace&&name===WEB_COOKIE)process.stderr.write('[P0_SESSION_BOOL] '+JSON.stringify({pid:process.pid,route:req.url,recordFound:!!record,revisionValid:record?.rev===revision,kind:record?.kind,sessionCount:sessions.size})+'\n');
   if(record&&record.rev===revision&&
      (record.kind==='WEB_LOCAL_PRIVATE')===(name===WEB_COOKIE))
    return {id,record};
  }
  return null;
 };
 const redeem=async code=>{
  if(approvePairing===null)return {error:'TRUSTED_NATIVE_PAIRING_NOT_AVAILABLE',status:503};
  // The verifier owns the native approval source and must consume a one-time grant.
  // Client code, "actor", localhost, OS username and Origin are NEVER accepted as proof.
  let approved;
  try{approved=await approvePairing(code)}catch{return {error:'TRUSTED_NATIVE_PAIRING_UNAVAILABLE',status:503}}
  if(approved!==true)return {error:'PAIRING_NOT_APPROVED',status:401};
  expire();
  const id=randomBytes(32).toString('hex');
  const csrf=randomBytes(32).toString('hex');
  const expiresAt=now()+ttlMs;
  sessions.set(digest(id),{csrf,expiresAt,rev:revision,kind:'PAIRING'});
  return {id,csrf,expiresAt};
 };
 const beginTrustedFirstParty=async req=>{
  if(approveNativeLaunch===null)return {error:'TRUSTED_NATIVE_APP_LAUNCH_NOT_CONNECTED',status:503};
  // A callback injected only by a W54-reviewed, authenticated native host
  // channel. Origin, same-user files, localhost and arbitrary request headers
  // alone MUST NOT cause it to return true.
  let trusted=false;
  try{trusted=(await approveNativeLaunch(req))===true}catch{
   return {error:'TRUSTED_NATIVE_APP_LAUNCH_UNAVAILABLE',status:503};
  }
  if(!trusted)return {error:'TRUSTED_NATIVE_APP_LAUNCH_REQUIRED',status:401};
  expire();
  const id=randomBytes(32).toString('hex');
  const csrf=randomBytes(32).toString('hex');
  const expiresAt=now()+nativeTtlMs;
  sessions.set(digest(id),{csrf,expiresAt,rev:revision,kind:'NATIVE_FIRST_PARTY'});
  return {id,csrf,expiresAt,ttlMs:nativeTtlMs};
 };
 // Native-host-only composition path. NO HTTP endpoint invokes this method.
 // The W54 signed launch/OS-parent verifier AND WebView2 cookie binder
 // must authorize it first. Browser-submitted strings are never evidence.
 const issueNativeWebView=(nativeHostBinding)=>{
  if(typeof nativeHostBinding!=='string'||!/^[a-f0-9]{64}$/.test(nativeHostBinding))
   throw Error('W54_NATIVE_HOST_BINDING_INVALID');
  expire();
  const id=randomBytes(32).toString('hex');
  const csrf=randomBytes(32).toString('hex');
  const expiresAt=now()+nativeTtlMs;
  sessions.set(digest(id),{csrf,expiresAt,rev:revision,
    kind:'NATIVE_FIRST_PARTY',nativeHostBinding});
  return Object.freeze({cookie:cookieFor(id,nativeTtlMs),expiresAt,csrf});
 };
 // Single-user local Web PRIVATE-only session. Not provider/Windows authority.
 // Server calls this only in an explicitly enabled development Web process.
 const issueWebPrivate=()=>{
  expire();
  const id=randomBytes(32).toString('hex');
  const csrf=randomBytes(32).toString('hex');
  const expiresAt=now()+nativeTtlMs;
  sessions.set(digest(id),{csrf,expiresAt,rev:revision,kind:'WEB_LOCAL_PRIVATE'});
  if(p0Trace)process.stderr.write('[P0_ISSUED_BOOL] '+JSON.stringify({pid:process.pid,sessionCount:sessions.size,revision})+'\n');
  return {id,csrf,expiresAt,ttlMs:nativeTtlMs};
 };
 const revokeNativeHost=(nativeHostBinding)=>{
  if(typeof nativeHostBinding!=='string')return 0;
  let removed=0;
  for(const [k,v] of sessions)if(v.nativeHostBinding===nativeHostBinding){
   sessions.delete(k);removed++;
  }
  return removed;
 };
 const revoke=req=>{
  const current=sessionFor(req);
  if(!current)return false;
  sessions.delete(digest(current.id));
  return true;
 };
 const revokeAll=()=>{sessions.clear();revision++};
 return Object.freeze({sessionFor,redeem,beginTrustedFirstParty,
  issueNativeWebView,issueWebPrivate,revokeNativeHost,revoke,revokeAll,ttlMs,
  get issuerAvailable(){return approvePairing!==null},
  get nativeLaunchAvailable(){return approveNativeLaunch!==null}});
}
export function createLocalSessionHttpApi({authority,webOrigin,enableWebPrivate=false}){
 if(!authority||typeof authority.sessionFor!=='function')throw Error('SESSION_AUTHORITY_REQUIRED');
 return async function handle(req,res,url){
  const path=url.pathname;
  if(!path.startsWith('/api/v2/local-session/'))return false;
  if(path==='/api/v2/local-session/status'&&req.method==='GET'){
   const active=authority.sessionFor(req);
   json(res,200,active?{ok:true,paired:true,
    // PRIVATE local use is authorized by the existing signed local session.
    // Never conflate this with W24/W44 social account/CONTACT permission.
    authorized:['WEB_LOCAL_PRIVATE','NATIVE_FIRST_PARTY'].includes(active.record.kind),
    expiresAt:active.record.expiresAt,
    csrfToken:active.record.csrf,sessionKind:active.record.kind,
    canSend:false,providerAuthorized:false}:
    {ok:true,paired:false,authorized:false,canSend:false,providerAuthorized:false,
     requiresTerminalPair:false,canConfigureModels:true,
     reason:authority.nativeLaunchAvailable?'LOCAL_APP_SESSION_NOT_STARTED':
       'LOCAL_APP_NATIVE_SESSION_NOT_CONNECTED'});
   return true;
  }
  if(path==='/api/v2/local-session/web-private-start'&&req.method==='POST'){
   // Same-origin ONLY; no arbitrary website, iframe, terminal pairing or
   // social provider trust. Explicitly enabled only for local Web staging.
   if(!enableWebPrivate||req.headers.origin!==webOrigin||
      req.headers['sec-fetch-site']!=='same-origin'){
    reject(res,403,'WEB_PRIVATE_LOCAL_ORIGIN_REQUIRED');return true;
   }
   let payload;
   try{payload=await readJson(req)}catch(e){reject(res,e.status||422,e.message);return true}
   if(Object.keys(payload).length!==0){
    reject(res,422,'WEB_PRIVATE_BODY_MUST_BE_EMPTY');return true;
   }
   const existing=authority.sessionFor(req);
   if(existing&&existing.record.kind!=='WEB_LOCAL_PRIVATE'){
    reject(res,403,'WEB_PRIVATE_CANNOT_UPGRADE_SESSION');return true;
   }
   const newSession=existing?{id:existing.id,csrf:existing.record.csrf,
     expiresAt:existing.record.expiresAt,ttlMs:Math.max(1,existing.record.expiresAt-Date.now())}:
     authority.issueWebPrivate();
   json(res,200,{ok:true,paired:true,sessionKind:'WEB_LOCAL_PRIVATE',
      expiresAt:newSession.expiresAt,csrfToken:newSession.csrf,
      canSend:false,providerAuthorized:false},
      {'set-cookie':cookieFor(newSession.id,newSession.ttlMs,WEB_COOKIE)});
   return true;
  }
  if(path==='/api/v2/local-session/first-party'&&req.method==='POST'){
   if(headerValue(req,'origin')!==webOrigin){reject(res,403,'LOCAL_SESSION_ORIGIN_REQUIRED');return true}
   let payload;
   try{payload=await readJson(req)}catch(e){reject(res,e.status||422,e.message);return true}
   if(Object.keys(payload).length!==0){reject(res,422,'NATIVE_LAUNCH_BODY_MUST_BE_EMPTY');return true}
   const previous=authority.sessionFor(req);
   if(previous){json(res,200,{ok:true,paired:true,sessionKind:previous.record.kind,
     expiresAt:previous.record.expiresAt,csrfToken:previous.record.csrf,
     canSend:false,providerAuthorized:false});return true}
   const result=await authority.beginTrustedFirstParty(req);
   if(result.error){reject(res,result.status,result.error);return true}
   json(res,200,{ok:true,paired:true,sessionKind:'NATIVE_FIRST_PARTY',
     expiresAt:result.expiresAt,csrfToken:result.csrf,
     canSend:false,providerAuthorized:false},
     {'set-cookie':cookieFor(result.id,result.ttlMs)});
   return true;
  }
  if(path==='/api/v2/local-session/redeem'&&req.method==='POST'){
   if(headerValue(req,'origin')!==webOrigin){reject(res,403,'LOCAL_SESSION_ORIGIN_REQUIRED');return true}
   let payload;
   try{payload=await readJson(req)}catch(e){reject(res,e.status||422,e.message);return true}
   if(Object.keys(payload).length!==1||typeof payload.pairingCode!=='string'||
      payload.pairingCode.length<32||payload.pairingCode.length>256){
    reject(res,422,'ONE_TIME_PAIRING_CODE_REQUIRED');return true
   }
   const result=await authority.redeem(payload.pairingCode);
   if(result.error){reject(res,result.status,result.error);return true}
   json(res,200,{ok:true,paired:true,expiresAt:result.expiresAt,
    csrfToken:result.csrf,canSend:false,providerAuthorized:false},
    {'set-cookie':cookieFor(result.id,authority.ttlMs)});
   return true;
  }
  if(path==='/api/v2/local-session/logout'&&req.method==='POST'){
   if(headerValue(req,'origin')!==webOrigin){reject(res,403,'LOCAL_SESSION_ORIGIN_REQUIRED');return true}
   const session=authority.sessionFor(req);
   if(!session){reject(res,401,'LOCAL_SESSION_REQUIRED');return true}
   const csrf=headerValue(req,'x-yance-csrf');
   if(!csrf||!/^[a-f0-9]{64}$/.test(csrf)||
      !timingSafeEqual(Buffer.from(session.record.csrf),Buffer.from(csrf))){
    reject(res,403,'LOCAL_SESSION_CSRF_REQUIRED');return true;
   }
   let payload;
   try{payload=await readJson(req)}catch(e){reject(res,e.status||422,e.message);return true}
   if(Object.keys(payload).length!==0){reject(res,422,'LOGOUT_BODY_MUST_BE_EMPTY');return true}
   authority.revoke(req);
   json(res,200,{ok:true,paired:false,canSend:false},{'set-cookie':eraseCookie(session.record.kind==='WEB_LOCAL_PRIVATE'?WEB_COOKIE:COOKIE)});
   return true;
  }
  reject(res,405,'LOCAL_SESSION_METHOD_NOT_ALLOWED');
  return true;
 };
}
