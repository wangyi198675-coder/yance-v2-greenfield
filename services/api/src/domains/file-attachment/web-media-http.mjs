// W23 Web-first actual binary upload/read routes. Caller mounts this under /api if needed.
// Auth and CSRF session validation are injected from the host, not invented here.
import {MediaError,PersistentMediaAssets,mediaCapabilities} from './web-media.mjs';
const fail=code=>{throw new MediaError(code)};
const json=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(body))};
const errStatus=code=>['ACCESS_DENIED','ASSET_NOT_FOUND_OR_FORBIDDEN','AUTH_REVISION_CHANGED'].includes(code)?403:
 ['BLOB_UNAVAILABLE','BLOB_AUTH_FAILED','INDEX_UNAVAILABLE'].includes(code)?503:
 ['SIZE_LIMIT','BODY_TOO_LARGE'].includes(code)?413:
 ['IDEMPOTENCY_CONFLICT','UPLOAD_EXPIRED','UPLOAD_ALREADY_COMPLETED','ASSET_NOT_READY','ASSET_GONE'].includes(code)?409:400;
async function take(req,limit){
 const parts=[];let sum=0;
 for await(const p of req){sum+=p.length;if(sum>limit)fail('BODY_TOO_LARGE');parts.push(p)}
 return Buffer.concat(parts);
}
const uuid=s=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s||'');
export function createWebMediaHttpHandler({service,resolveIdentity,checkCsrf}={}){
 if(!(service instanceof PersistentMediaAssets)||typeof resolveIdentity!=='function'||typeof checkCsrf!=='function')fail('TRUSTED_PORTS_REQUIRED');
 return async function mediaHandler(req,res){
  try{
   const path=new URL(req.url,'http://localhost').pathname.replace(/^\/api(?=\/v2\/media\/)/,'');
   if(path!=='/v2/media/capabilities'&&!path.startsWith('/v2/media/'))return json(res,404,{error:'NOT_FOUND'});
   // checkCsrf must verify the host's authenticated session & origin for all mutating requests.
   if(!['GET','HEAD'].includes(req.method)&&await checkCsrf(req)!==true)return json(res,403,{error:'CSRF_DENIED'});
   const ctx=await resolveIdentity(req);
   if(!ctx||typeof ctx.actor!=='string'||!ctx.k)return json(res,401,{error:'AUTH_REQUIRED'});
   let status=200,result;
   if(path==='/v2/media/capabilities'&&req.method==='GET')result=mediaCapabilities();
   else if(path==='/v2/media/upload-sessions'&&req.method==='POST'){
    if(!String(req.headers['content-type']||'').startsWith('application/json'))fail('JSON_REQUIRED');
    let b;try{b=JSON.parse((await take(req,8192)).toString('utf8'))}catch(e){if(e instanceof MediaError)throw e;fail('INVALID_JSON')}
    if(!b||typeof b!=='object'||Array.isArray(b))fail('INVALID_JSON');
    result=await service.begin({...b,actor:ctx.actor,k:ctx.k});status=201;
   }else{
    const parts=path.split('/'); const id=parts[3];
    if(!uuid(id))return json(res,404,{error:'NOT_FOUND'});
    if(parts.length===5&&parts[4]==='content'&&req.method==='PUT'){
     const mime=String(req.headers['content-type']||'').split(';')[0].trim();
     const actualLength=Number(req.headers['content-length']);
     if(!Number.isSafeInteger(actualLength)||actualLength<=0)fail('CONTENT_LENGTH_REQUIRED');
     if(actualLength>48*1024*1024)fail('SIZE_LIMIT');
     const bytes=await take(req,48*1024*1024);
     // Media service checks declared MIME against sniffed actual bytes and original session.
     result=await service.upload({...ctx,asset_id:id,bytes,mime});status=200;
    }else if(parts.length===5&&parts[4]==='content'&&req.method==='GET'){
     const out=await service.read({...ctx,asset_id:id});
     res.writeHead(200,{'content-type':out.metadata.mime,'content-length':out.bytes.length,'cache-control':'no-store, private',
      'content-disposition':'attachment; filename="attachment.'+out.metadata.mime.split('/')[1].replace(/[^a-z0-9]/g,'')+'"',
      'x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"});
     res.end(out.bytes);out.bytes.fill(0);return;
    }else if(parts.length===4&&req.method==='GET')result=await service.metadata({...ctx,asset_id:id});
    else if(parts.length===4&&req.method==='DELETE')result=await service.delete({...ctx,asset_id:id});
    else return json(res,404,{error:'NOT_FOUND'});
   }
   return json(res,status,result);
  }catch(e){const code=e instanceof MediaError?e.code:'MEDIA_INTERNAL_ERROR';return json(res,e instanceof MediaError?errStatus(code):500,{error:code})}
 };
}
