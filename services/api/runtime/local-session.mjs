// W47: minimal in-memory local session; local user session != provider consent.
// The issuer is a SERVER-INJECTED verifier of an actual user-approved native action.
// The production W47 API deliberately passes no issuer until W54 signs that action.
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';

const COOKIE='yance_local_session';
const TTL_MS=5*60*1000;
const MAX_REQUEST_BYTES=2048;
const digest=s=>createHash('sha256').update(s).digest('hex');
const json=(res,status,value,headers={})=>{
 res.writeHead(status,{'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store','x-content-type-options':'nosniff',...headers});
 res.end(JSON.stringify(value));
};
const reject=(res,status,error)=>json(res,status,{ok:false,error,canSend:false});
const cookieFor=id=>COOKIE+'='+id+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=300';
const eraseCookie=()=>COOKIE+'=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0';
const cookieId=req=>{
 const hdr=req.headers.cookie;
 if(typeof hdr!=='string'||hdr.length>4096)return null;
 const found=hdr.split(';').map(x=>x.trim()).filter(x=>x.startsWith(COOKIE+'='));
 if(found.length!==1)return null;
 const id=found[0].slice(COOKIE.length+1);
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
export function createLocalSessionAuthority({approvePairing=null,now=()=>Date.now(),ttlMs=TTL_MS}={}){
 if(approvePairing!==null&&typeof approvePairing!=='function')throw Error('TRUSTED_ISSUER_MUST_BE_SERVER_CALLBACK');
 if(!Number.isSafeInteger(ttlMs)||ttlMs<1000||ttlMs>15*60*1000)throw Error('SESSION_TTL_OUT_OF_RANGE');
 const sessions=new Map();
 let revision=0;
 const expire=()=>{
  for(const [key,v] of sessions)if(now()>=v.expiresAt)sessions.delete(key);
 };
 const sessionFor=req=>{
  expire();
  const id=cookieId(req);
  if(!id)return null;
  const record=sessions.get(digest(id));
  return record&&record.rev===revision?{id,record}:null;
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
  sessions.set(digest(id),{csrf,expiresAt,rev:revision});
  return {id,csrf,expiresAt};
 };
 const revoke=req=>{
  const current=sessionFor(req);
  if(!current)return false;
  sessions.delete(digest(current.id));
  return true;
 };
 const revokeAll=()=>{sessions.clear();revision++};
 return Object.freeze({sessionFor,redeem,revoke,revokeAll,get issuerAvailable(){return approvePairing!==null}});
}
export function createLocalSessionHttpApi({authority,webOrigin}){
 if(!authority||typeof authority.sessionFor!=='function')throw Error('SESSION_AUTHORITY_REQUIRED');
 return async function handle(req,res,url){
  const path=url.pathname;
  if(!path.startsWith('/api/v2/local-session/'))return false;
  if(path==='/api/v2/local-session/status'&&req.method==='GET'){
   const active=authority.sessionFor(req);
   json(res,200,active?{ok:true,paired:true,expiresAt:active.record.expiresAt,
    csrfToken:active.record.csrf,canSend:false,providerAuthorized:false}:
    {ok:true,paired:false,canSend:false,providerAuthorized:false,
     reason:authority.issuerAvailable?'LOCAL_SESSION_NOT_PAIRED':'TRUSTED_NATIVE_PAIRING_NOT_AVAILABLE'});
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
    {'set-cookie':cookieFor(result.id)});
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
   json(res,200,{ok:true,paired:false,canSend:false},{'set-cookie':eraseCookie()});
   return true;
  }
  reject(res,405,'LOCAL_SESSION_METHOD_NOT_ALLOWED');
  return true;
 };
}
