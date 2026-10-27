// W47's ONLY browser-facing gateway to the original W23 native encrypted media.
// W23 owns PersistentMediaAssets, scope authorization and binary HTTP behavior;
// W24/W44/W55 native owners must supply all current trusted ports together.
// No HTTP/local-host/client supplied K, no substitute key or second media store.
import {timingSafeEqual} from 'node:crypto';
import {PersistentMediaAssets,mediaCapabilities} from '../src/domains/file-attachment/web-media.mjs';
import {createWebMediaHttpHandler} from '../src/domains/file-attachment/web-media-http.mjs';

const send=(res,status,value)=>{
 res.writeHead(status,{'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store','x-content-type-options':'nosniff',
  'cross-origin-resource-policy':'same-origin','vary':'Origin, Sec-Fetch-Site'});
 res.end(JSON.stringify(value));
};
const deny=(res,status,error)=>send(res,status,{ok:false,error,canSend:false});
const csrfMatches=(req,s)=>{
 const raw=req.headers['x-yance-csrf'],trusted=s?.record?.csrf;
 return typeof raw==='string'&&/^[a-f0-9]{64}$/.test(raw)&&
  typeof trusted==='string'&&/^[a-f0-9]{64}$/.test(trusted)&&
  timingSafeEqual(Buffer.from(raw),Buffer.from(trusted));
};
const allowedMethod=(method,path)=>{
 if(path==='/api/v2/media/capabilities')return method==='GET';
 if(path==='/api/v2/media/upload-sessions')return method==='POST';
 if(/^\/api\/v2\/media\/[a-f0-9-]{36}\/content$/i.test(path))
  return method==='PUT'||method==='GET';
 if(/^\/api\/v2\/media\/[a-f0-9-]{36}$/i.test(path))
  return method==='GET'||method==='DELETE';
 return null;
};
/**
 * Original W23 service must already be opened with the durable W55-protected
 * 32-byte key and a W24/W44-effective-grant authority.check callback.
 * Only original trusted native Owner code can inject these three ports.
 * In the current PR105 runtime all ports are intentionally NULL, as there
 * is no real user-authorized ChannelAccount or stable owner media key.
 */
export function createW47WebMediaHttp({
 sessionAuthority,webOrigin,
 mediaService=null,resolveAuthorizedMediaScope=null,checkCurrentMediaScope=null
}={}){
 if(typeof sessionAuthority?.sessionFor!=='function'||typeof webOrigin!=='string')
  throw Error('W47_MEDIA_SESSION_PORT_REQUIRED');
 if(mediaService!==null&&!(mediaService instanceof PersistentMediaAssets))
  throw Error('W23_ORIGINAL_ENCRYPTED_STORE_REQUIRED');
 if([resolveAuthorizedMediaScope,checkCurrentMediaScope].some(x=>x!==null&&typeof x!=='function'))
  throw Error('W24_W44_TRUSTED_MEDIA_PORT_INVALID');
 // All three must arrive simultaneously from the verified owner handoff.
 const joined=mediaService!==null&&resolveAuthorizedMediaScope!==null&&
  checkCurrentMediaScope!==null;
 if(!joined&&(mediaService!==null||resolveAuthorizedMediaScope!==null||checkCurrentMediaScope!==null))
  throw Error('W23_W24_W44_W55_ALL_PORTS_REQUIRED');
 const latest=(req)=>sessionAuthority.sessionFor(req);
 const getAuthorized=async req=>{
  const before=latest(req);
  if(!before||before.record?.kind!=='NATIVE_FIRST_PARTY')return null;
  const asserted=await resolveAuthorizedMediaScope({session:before,operation:'READ_MEDIA_SCOPE'});
  if(!asserted||asserted.verified!==true||asserted.source!=='W24_W44_CURRENT_NATIVE'||
     asserted.realAccountVerified!==true||asserted.grantCurrent!==true||
     typeof asserted.actor!=='string'||!asserted.actor||
     !asserted.k||typeof asserted.k!=='object'||
     ['tenant','account','channel','peer_id','binding_revision'].some(f=>
       typeof asserted.k[f]!=='string'||!asserted.k[f]||
       asserted.k[f].startsWith('SYNTHETIC_TEST_ONLY'))||
     !Number.isSafeInteger(asserted.grantRevision)||
     !Number.isSafeInteger(asserted.consentRevision)||
     !Number.isSafeInteger(asserted.custodyEpoch)||
     !Number.isSafeInteger(asserted.revocationEpoch))
   return null;
  const check=await checkCurrentMediaScope({session:before,asserted,operation:'READ_MEDIA_SCOPE'});
  const after=latest(req);
  if(check!==true||!after||after.id!==before.id||after.record.rev!==before.record.rev)return null;
  return {actor:asserted.actor,k:{...asserted.k}};
 };
 const w23Handler=joined?createWebMediaHttpHandler({
  service:mediaService,
  resolveIdentity:getAuthorized,
  checkCsrf:async req=>{
   const s=latest(req);
   return !!s&&s.record?.kind==='NATIVE_FIRST_PARTY'&&
    req.headers.origin===webOrigin&&csrfMatches(req,s);
  }
 }):null;
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/v2/media/'))return false;
  const s=latest(req);
  if(!s){deny(res,401,'LOCAL_SESSION_REQUIRED');return true}
  if(req.headers.origin&&req.headers.origin!==webOrigin){
   deny(res,403,'ORIGIN_NOT_ALLOWED');return true
  }
  const method=allowedMethod(req.method,url.pathname);
  if(method===null){deny(res,404,'W23_MEDIA_ROUTE_NOT_FOUND');return true}
  if(!method){deny(res,405,'METHOD_NOT_ALLOWED');return true}
  if(req.method!=='GET'&&(req.headers.origin!==webOrigin||!csrfMatches(req,s))){
   deny(res,403,'LOCAL_SESSION_OR_CSRF_REQUIRED');return true
  }
  if(url.search){deny(res,422,'W23_MEDIA_QUERY_NOT_SUPPORTED');return true}
  // Original W23 is the authority for formats, never AI media providers.
  if(url.pathname==='/api/v2/media/capabilities'){
   const eligible=joined&&(await getAuthorized(req))!==null;
   send(res,200,{ok:true,authoritative:true,source:'W23_NATIVE_WEB_MEDIA',
    ...mediaCapabilities(),
    attachment_store:eligible?'LOCAL_ENCRYPTED_AVAILABLE_WITH_AUTHORITY':
     'REAL_ACCOUNT_MEDIA_UPLOAD_HOLD',
    currentAccountAuthorized:eligible,canUpload:eligible,canRead:eligible,canDelete:eligible,
    libraryListing:{available:false,reason:'W23_PRINCIPAL_SCOPED_LIST_API_NOT_IMPLEMENTED'},
    canSend:false});
   return true;
  }
  if(!joined){deny(res,503,'REAL_ACCOUNT_MEDIA_UPLOAD_HOLD');return true}
  if(s.record.kind!=='NATIVE_FIRST_PARTY'||await getAuthorized(req)===null){
   deny(res,403,'W24_W44_CURRENT_MEDIA_SCOPE_REQUIRED');return true
  }
  // W23 owns each create/upload/read/delete, performs its own repeated
  // AUTH revision checks and original encrypted bytes custody.
  await w23Handler(req,res);
  return true;
 };
}
