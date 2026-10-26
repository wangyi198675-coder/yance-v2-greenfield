// W47 same-origin Web PRIVATE Key onboarding: only transient inbound secret to
// ORIGINAL W55 native WinCred/DPAPI, NEVER a getter, log or browser storage.
// No social account, outgoing send or Agent run is authorized here.
import {timingSafeEqual} from 'node:crypto';
const hdr={'content-type':'application/json; charset=utf-8',
 'cache-control':'no-store','x-content-type-options':'nosniff',
 'x-frame-options':'DENY','referrer-policy':'no-referrer',
 'cross-origin-resource-policy':'same-origin','vary':'Origin, Sec-Fetch-Site'};
const send=(res,status,data)=>{res.writeHead(status,hdr);res.end(JSON.stringify(data))};
const deny=(res,status,error)=>send(res,status,{ok:false,error,canSend:false});
const csrfOk=(req,s)=>{
 const a=req.headers['x-yance-csrf'],b=s?.record?.csrf;
 return typeof a==='string'&&typeof b==='string'&&
 /^[0-9a-f]{64}$/.test(a)&&/^[0-9a-f]{64}$/.test(b)&&
 timingSafeEqual(Buffer.from(a),Buffer.from(b));
};
async function json(req){
 if(req.headers['content-type']!=='application/json')
  throw {status:415,code:'JSON_REQUIRED'};
 const chunks=[];let n=0;
 for await(const x of req){n+=x.length;if(n>2048)throw {status:413,code:'BODY_TOO_LARGE'};chunks.push(x)}
 try{
  const v=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!v||typeof v!=='object'||Array.isArray(v))throw 0;
  return v;
 }catch{throw {status:422,code:'INVALID_JSON'}}
}
export function createWebPrivateCloudHttp({
 sessionAuthority,webOrigin,webCloudPort=null
}={}){
 if(typeof sessionAuthority?.sessionFor!=='function'||typeof webOrigin!=='string')
  throw Error('W47_WEB_PRIVATE_SESSION_REQUIRED');
 return async(req,res,url)=>{
  if(url.pathname!=='/api/v2/private-brain/cloud-keys')return false;
  if(!['GET','POST','DELETE'].includes(req.method)){
   deny(res,405,'METHOD_NOT_ALLOWED');return true
  }
  const s=sessionAuthority.sessionFor(req);
  if(!s||s.record.kind!=='WEB_LOCAL_PRIVATE'){
   deny(res,401,'WEB_LOCAL_PRIVATE_SESSION_REQUIRED');return true
  }
  if(req.headers.origin&&req.headers.origin!==webOrigin){
   deny(res,403,'ORIGIN_NOT_ALLOWED');return true
  }
  if(req.method!=='GET'&&(req.headers.origin!==webOrigin||!csrfOk(req,s))){
   deny(res,403,'ORIGIN_OR_CSRF_REQUIRED');return true
  }
  if(!webCloudPort){
   deny(res,503,'W55_WEB_NATIVE_WIN_CRED_HOST_NOT_CONNECTED');return true
  }
  let input;
  if(req.method!=='GET'){
   try{input=await json(req)}catch(e){deny(res,e.status??422,e.code??'INVALID_JSON');return true}
   const keys=Object.keys(input).sort().join('|');
   const expected=req.method==='POST'?
    (input.expectedRevision===undefined?'apiKey|provider':'apiKey|expectedRevision|provider'):
    'expectedRevision|provider';
   if(keys!==expected){
    deny(res,422,'CLOUD_KEY_DTO_INVALID');return true
   }
  }
  let result;
  try{
   if(req.method==='GET'){
    if([...url.searchParams].length)throw {status:422,code:'CLOUD_STATUS_QUERY_INVALID'};
    result=await webCloudPort.statuses();
    if(!Array.isArray(result)||result.length!==2)throw {status:503,code:'W55_NATIVE_KEY_STATUS_INVALID'};
    result={providers:result};
   }else if(req.method==='POST'){
    result=await webCloudPort.save(input);
   }else result=await webCloudPort.revoke(input);
  }catch(e){deny(res,e?.status??503,e?.code??'W55_NATIVE_CREDENTIAL_UNAVAILABLE');return true}
  const current=sessionAuthority.sessionFor(req);
  if(!current||current.id!==s.id||current.record.rev!==s.record.rev){
   deny(res,401,'WEB_PRIVATE_SESSION_REVOKED');return true
  }
  send(res,200,{ok:true,...result,credentialValueReturned:false,canSend:false});
  return true;
 };
}
