// W47 same-origin current-user API for persistent FUNCTION preferences only.
// No API keys, no browser-supplied account/peer, no automatic paid model call.
import {timingSafeEqual} from 'node:crypto';
import {createFunctionModelRoutingStore} from './function-model-routing.mjs';
const write=(res,status,x)=>{res.writeHead(status,{
 'content-type':'application/json; charset=utf-8','cache-control':'no-store',
 'x-content-type-options':'nosniff','referrer-policy':'no-referrer',
 'cross-origin-resource-policy':'same-origin','x-frame-options':'DENY',
 'vary':'Origin, Sec-Fetch-Site'
 });res.end(JSON.stringify(x))};
const deny=(res,status,error)=>write(res,status,{ok:false,error,canSend:false});
const csrfValid=(req,session)=>{
 const expected=session?.record?.csrf,actual=req.headers['x-yance-csrf'];
 return typeof expected==='string'&&typeof actual==='string'&&
 /^[a-f0-9]{64}$/.test(expected)&&/^[a-f0-9]{64}$/.test(actual)&&
 timingSafeEqual(Buffer.from(expected),Buffer.from(actual));
};
const bodyJson=async req=>{
 if(req.headers['content-type']!=='application/json')
  throw {status:415,code:'JSON_REQUIRED'};
 const chunks=[];let n=0;
 for await(const b of req){n+=b.length;if(n>1024)
   throw {status:413,code:'BODY_TOO_LARGE'};chunks.push(b)}
 let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'))}
 catch{throw {status:422,code:'INVALID_JSON'}}
 if(!data||typeof data!=='object'||Array.isArray(data)||
  Object.keys(data).sort().join('|')!=='confirmPaidCost|expectedRevision|functionId|modelId|provider')
  throw {status:422,code:'FUNCTION_MODEL_SELECTION_INVALID'};
 return data;
};
export function createFunctionModelRoutingHttp({
 sessionAuthority,webOrigin,appLocalDataRoot,readEligibleModels,store:providedStore=null
}={}){
 if(typeof sessionAuthority?.sessionFor!=='function'||typeof webOrigin!=='string')
  throw Error('W47_CURRENT_SESSION_REQUIRED');
 // Missing original native root means NO durable user preference, fail closed.
 const store=providedStore??(appLocalDataRoot&&readEligibleModels?
  createFunctionModelRoutingStore({appLocalDataRoot,readEligibleModels}):null);
 return async(req,res,url)=>{
  const catalog=url.pathname==='/api/v2/model-routing/catalog';
  if(url.pathname!=='/api/v2/model-routing'&&!catalog)return false;
  if((!catalog&&url.search)||(catalog&&req.method!=='GET')){
   deny(res,catalog?405:422,catalog?'METHOD_NOT_ALLOWED':'MODEL_ROUTING_QUERY_NOT_ALLOWED');return true
  }
  if(!['GET','POST'].includes(req.method)){deny(res,405,'METHOD_NOT_ALLOWED');return true}
  if(req.headers.origin&&req.headers.origin!==webOrigin){
   deny(res,403,'ORIGIN_NOT_ALLOWED');return true
  }
  const session=sessionAuthority.sessionFor(req);
  if(!session||!['WEB_LOCAL_PRIVATE','NATIVE_FIRST_PARTY'].includes(session.record.kind)){
   deny(res,401,'CURRENT_USER_SESSION_REQUIRED');return true
  }
  if(req.method==='POST'&&(req.headers.origin!==webOrigin||!csrfValid(req,session))){
   deny(res,403,'CURRENT_SESSION_CSRF_REQUIRED');return true
  }
  if(!store){deny(res,503,'ORIGINAL_NATIVE_MODEL_STORAGE_NOT_CONNECTED');return true}
  try{
   let value;
   if(catalog){
    if([...url.searchParams.keys()].some(k=>!['q','offset','limit'].includes(k)||
       url.searchParams.getAll(k).length!==1)){
     deny(res,422,'MODEL_CATALOG_QUERY_INVALID');return true
    }
    const q=url.searchParams.get('q')??'';
    const off=url.searchParams.get('offset')??'0',lim=url.searchParams.get('limit')??'60';
    if(!/^\d{1,4}$/.test(off)||!/^\d{1,3}$/.test(lim)){
     deny(res,422,'MODEL_CATALOG_QUERY_INVALID');return true
    }
    value=await store.catalog({query:q,offset:Number(off),limit:Number(lim)});
   }else value=req.method==='GET'?await store.current():await store.select(await bodyJson(req));
   const final=sessionAuthority.sessionFor(req);
   if(!final||final.id!==session.id||final.record.rev!==session.record.rev){
    deny(res,401,'CURRENT_SESSION_REVOKED_DURING_ROUTING');return true
   }
   write(res,200,value);return true
  }catch(e){deny(res,e?.status??503,e?.code??'MODEL_ROUTING_NATIVE_UNAVAILABLE');return true}
 };
}