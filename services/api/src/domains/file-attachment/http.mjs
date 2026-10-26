// Minimal synthetic-only HTTP adapter for W23. No listener is started by import.
// resolveIdentity(request) MUST be injected by W24's trusted server authentication boundary.
// Never derive principal/K from JSON body or arbitrary headers.
import { AssetError, FileAttachmentService } from './file-attachment.mjs';
const MAX_JSON=131072;
const fail=(code)=>{throw new AssetError(code)};
async function jsonBody(req){
 const parts=[];let size=0;
 for await(const piece of req){size+=piece.length;if(size>MAX_JSON)fail('BODY_TOO_LARGE');parts.push(piece)}
 if(!size)return {};
 try{const value=JSON.parse(Buffer.concat(parts).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))fail('BAD_JSON');return value}
 catch(e){if(e instanceof AssetError)throw e;fail('BAD_JSON')}
}
const errorStatus=code=>['ACCESS_DENIED','ASSET_NOT_FOUND_OR_FORBIDDEN','CAPABILITY_INVALID','AUTH_REVISION_CHANGED'].includes(code)?403:
 ['SIZE_LIMIT','BODY_TOO_LARGE'].includes(code)?413:
 ['IDEMPOTENCY_CONFLICT','ASSET_NOT_READY','DUPLICATE_DERIVATIVE','UPLOAD_EXPIRED'].includes(code)?409:400;
const respond=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(body))};
function decodeSyntheticBase64(str){
 if(typeof str!=='string'||str.length>MAX_JSON||!/^[A-Za-z0-9+/]*={0,2}$/.test(str)||str.length%4!==0)fail('BAD_BASE64');
 const value=Buffer.from(str,'base64');if(value.toString('base64')!==str)fail('BAD_BASE64');return value;
}
export function createSyntheticAssetHttpHandler({service,resolveIdentity}={}){
 if(!(service instanceof FileAttachmentService)||typeof resolveIdentity!=='function')fail('TRUSTED_HTTP_PORTS_REQUIRED');
 return async function handler(req,res){
  try{
   const url=new URL(req.url,'http://127.0.0.1');
   if(!url.pathname.startsWith('/v2/assets/')&&url.pathname!=='/v2/assets/upload-sessions')return respond(res,404,{error:'NOT_FOUND'});
   const auth=await resolveIdentity(req);
   if(!auth||typeof auth.actor!=='string'||!auth.k)return respond(res,401,{error:'AUTH_REQUIRED'});
   const ctx={actor:auth.actor,k:auth.k};
   const path=url.pathname,method=req.method;
   let result,status=200;
   if(path==='/v2/assets/upload-sessions'&&method==='POST'){
    const body=await jsonBody(req);result=await service.beginUpload({...body,...ctx});status=201;
   }else if(/^\/v2\/assets\/upload-sessions\/[^/]+\/complete$/.test(path)&&method==='POST'){
    const body=await jsonBody(req),session_id=path.split('/')[4];
    result=await service.completeUpload({...ctx,session_id,bytes:decodeSyntheticBase64(body.bytes_base64)});
   }else if(path==='/v2/assets/read'&&method==='POST'){
    const body=await jsonBody(req);
    const bytes=await service.readWithCapability({...ctx,read_handle:body.read_handle});
    result={synthetic_bytes_base64:bytes.toString('base64')};bytes.fill(0);
   }else if(/^\/v2\/assets\/[^/]+\/read-capabilities$/.test(path)&&method==='POST'){
    const body=await jsonBody(req);result=await service.issueReadCapability({...ctx,asset_id:path.split('/')[3],ttl_ms:body.ttl_ms});
   }else if(/^\/v2\/assets\/[^/]+\/derivatives$/.test(path)&&method==='POST'){
    const body=await jsonBody(req);result=await service.registerDerivative({...ctx,asset_id:path.split('/')[3],provider_ref:body.provider_ref});status=201;
   }else if(/^\/v2\/assets\/[^/]+$/.test(path)&&method==='GET'){
    result=await service.getMetadata({...ctx,asset_id:path.split('/')[3]});
   }else if(/^\/v2\/assets\/[^/]+$/.test(path)&&method==='DELETE'){
    result=await service.revokeAsset({...ctx,asset_id:path.split('/')[3]});
   }else return respond(res,404,{error:'NOT_FOUND'});
   return respond(res,status,result);
  }catch(err){
   const code=err instanceof AssetError?err.code:'INTERNAL_ERROR';
   return respond(res,err instanceof AssetError?errorStatus(code):500,{error:code});
  }
 };
}
