// W27/W47 R4 Web-first onboarding. Original W55 DPAPI owns ALL credential
// bytes; original W24/W44 remain sole current account/Peer/K authority.
// This module provides genuine authenticated Page discovery and independent
// per-Page API-token verification, never a second message store or sender.
const site='https://pages.fm';
const send=(res,status,value)=>{res.writeHead(status,{
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store','x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer'
});res.end(JSON.stringify({...value,canSend:false}));};
const fail=(code,status=403)=>Object.assign(new Error(code),{code,status});
const validId=v=>typeof v==='string'&&/^[0-9]{1,40}$/.test(v);
const validToken=v=>typeof v==='string'&&v.length>=8&&v.length<=1600&&
 !/[\s\u0000-\u001f\u007f]/.test(v);
async function official(path,tokenParam,token,fetchImpl){
 const url=new URL(site+path);url.searchParams.set(tokenParam,token);
 try{
  const response=await fetchImpl(url,{
   method:'GET',redirect:'error',cache:'no-store',
   headers:{accept:'application/json'},
   signal:AbortSignal.timeout(12000)
  });
  if(!response||response.status===401||response.status===403)
    throw fail('PANCAKE_TOKEN_REJECTED',401);
  if(response.status===429)throw fail('PANCAKE_RATE_LIMITED',429);
  if(response.status!==200)throw fail('PANCAKE_REMOTE_UNAVAILABLE',503);
  if(Number(response.headers?.get?.('content-length')||0)>2000000)
    throw fail('PANCAKE_RESPONSE_TOO_LARGE',502);
  const raw=await response.text();
  if(Buffer.byteLength(raw,'utf8')>2000000)throw fail('PANCAKE_RESPONSE_TOO_LARGE',502);
  let data;try{data=JSON.parse(raw)}catch{throw fail('PANCAKE_RESPONSE_INVALID',502)}
  if(data?.success===false){
   // Pancake may return HTTP 200 with a structured API error. Do not turn
   // every failure (permissions, account state, upstream limits) into a claim
   // that the user pasted the wrong token. Only bounded numeric codes cross
   // the browser boundary; official raw messages and secrets never do.
   const nativeCode=String(data.error_code??'');
   if(/^[0-9]{1,5}$/.test(nativeCode)){
    if(nativeCode==='102')throw fail('PANCAKE_OFFICIAL_AUTH_102',401);
    throw fail('PANCAKE_OFFICIAL_ERROR_'+nativeCode,502);
   }
   throw fail('PANCAKE_OFFICIAL_FAILURE_UNCLASSIFIED',502);
  }
  return data;
 }catch(e){if(e?.code)throw e;throw fail('PANCAKE_NETWORK_UNAVAILABLE',503)}
 finally{url.searchParams.delete(tokenParam);}
}
async function ownedPages(token,fetchImpl){
 const reply=await official('/api/v1/pages','access_token',token,fetchImpl);
 // The current official GET /api/v1/pages response categorizes pages under
 // pages.activated/inactivated/hidden/nopermission/activated_page_ids.
 // Older responses expose pages as an array. Do not interpret a categorized
 // object as an invalid User Access Token or grant access to nopermission.
 // In production Pancake can return category arrays, category objects keyed
 // by page ID, or nested page lists. Preserve explicit account ownership by
 // accepting only the allowed categories; never include nopermission.
 const items=value=>{
  if(value===null)return [];
  if(Array.isArray(value))return value;
  if(!value||typeof value!=='object')return null;
  if(validId(String(value.id??'')))return [value];
  for(const key of ['data','pages','items','list','results']){
   if(Object.hasOwn(value,key)){
    const nested=value[key];
    if(Array.isArray(nested))return nested;
    if(nested&&typeof nested==='object'&&nested!==value)return items(nested);
    return null;
   }
  }
  const entries=Object.entries(value);
  if(!entries.length)return [];
  if(entries.length>500||entries.some(([id,p])=>
    !validId(id)||!p||typeof p!=='object'||Array.isArray(p)))return null;
  return entries.map(([id,p])=>({...p,id:p.id??id}));
 };
 const groups=['activated','inactivated','hidden'];
 const candidateContainers=[
   reply.pages,reply.categorized,reply.page_list,
   reply.data?.pages,reply.data?.categorized,reply.data?.page_list,
   reply.result?.pages,reply.result?.categorized,reply.result?.page_list,
   reply.payload?.pages,reply.payload?.categorized,
   reply
 ];
 // Root-level categorized is also used by some official API versions.
 // Never select arbitrary object values, which could grant unauthorized pages.
 const rawPages=candidateContainers.find(value=>
   Array.isArray(value)||
   (value&&typeof value==='object'&&groups.some(k=>Object.hasOwn(value,k)))
 )??null;
 const invalidSchema=()=>{
  // Strictly structural telemetry only: no token, page ID/name or raw response.
  // Local QA flag is opt-in, never on by default.
  if(process.env.P0_PANCAKE_SCHEMA_DIAG==='1'){
   const kind=v=>Array.isArray(v)?'array':v===null?'null':typeof v;
   process.stderr.write('[P0_PANCAKE_SCHEMA_ONLY] '+JSON.stringify({
    hasPages:reply.pages!==undefined,hasData:reply.data!==undefined,
    hasCategorized:reply.categorized!==undefined,
    pagesKind:kind(rawPages),
    topLevelKeys:Object.keys(reply).slice(0,20).map(k=>
     /^[a-z][a-z0-9_]{0,36}$/.test(k)&&
     !/(token|secret|password|auth|name|email|phone|customer)/i.test(k)?k:'REDACTED'),
    groups:groups.map(k=>[k,kind(rawPages?.[k])])
   })+'\n');
  }
  throw fail('PANCAKE_ACCOUNT_PAGES_INVALID',502);
 };
 let source;
 if(Array.isArray(rawPages))source=rawPages;
 else if(rawPages&&typeof rawPages==='object'){
  const lists=groups.filter(k=>Object.hasOwn(rawPages,k)).map(k=>items(rawPages[k]));
  if(!lists.length||lists.some(v=>!Array.isArray(v)))invalidSchema();
  source=lists.flat();
 }else invalidSchema();
 if(source.length>500)throw fail('PANCAKE_ACCOUNT_PAGES_INVALID',502);
 const seen=new Set();
 const pages=[];
 for(const p of source){
  const id=String(p?.id??'');
  if(!validId(id)||seen.has(id))continue;
  const platform=String(p?.platform??'').toUpperCase();
  if(platform&&!['FACEBOOK','FB_PAGE','FACEBOOK_PAGE'].includes(platform))continue;
  seen.add(id);
  pages.push({pageId:id,name:typeof p.name==='string'?p.name.slice(0,180):'Facebook Page',platform:'FB_PAGE'});
 }
 return pages;
}
async function verifyPageToken(pageId,token,fetchImpl){
 const r=await official('/api/public_api/v1/pages/'+encodeURIComponent(pageId)+'/users',
   'page_access_token',token,fetchImpl);
 if(!Array.isArray(r.users))throw fail('PANCAKE_PAGE_READ_UNVERIFIED',502);
 return true;
}
async function body(req,max=2048){
 let bytes=0;const chunks=[];
 for await (const c of req){bytes+=c.length;if(bytes>max)throw fail('BODY_TOO_LARGE',413);chunks.push(c)}
 let v;try{v=JSON.parse(Buffer.concat(chunks).toString('utf8'))}
 catch{throw fail('REQUEST_BODY_INVALID',422)}
 if(!v||Array.isArray(v)||typeof v!=='object')throw fail('REQUEST_BODY_INVALID',422);
 return v;
}
export function createPancakeMultiOnboardingHttp({
 sessionAuthority,webOrigin,custody=null,fetchImpl=globalThis.fetch
}={}){
 if(typeof sessionAuthority?.sessionFor!=='function'||
    !/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(webOrigin)||
    typeof fetchImpl!=='function')throw Error('W47_EXISTING_WEB_SESSION_REQUIRED');
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/v2/providers/fb-page/onboarding'))return false;
  const route=url.pathname.slice('/api/v2/providers/fb-page/onboarding'.length);
  if(!['/capabilities','/pages','/account','/page-token'].includes(route)){
   send(res,404,{ok:false,error:'NO_ROUTE'});return true;
  }
  if((req.method==='POST'&&req.headers.origin!==webOrigin)||
      (req.headers.origin&&req.headers.origin!==webOrigin)||
      req.headers['sec-fetch-site']!=='same-origin'||url.search){
   send(res,403,{ok:false,error:'CURRENT_WEB_ORIGIN_REQUIRED'});return true;
  }
  const session=sessionAuthority.sessionFor(req);
  if(!session||!['WEB_LOCAL_PRIVATE','NATIVE_FIRST_PARTY'].includes(session.record?.kind)){
   send(res,401,{ok:false,error:'EXISTING_LOCAL_SESSION_REQUIRED'});return true;
  }
  if(route==='/capabilities'){
   if(req.method!=='GET'){send(res,405,{ok:false,error:'GET_ONLY'});return true}
   send(res,200,{ok:true,channel:'FB_PAGE',multiPage:true,
    credentialReady:!!custody,automaticRotation:false});return true;
  }
  if(!custody){send(res,503,{ok:false,error:'EXISTING_W55_CUSTODY_UNAVAILABLE'});return true}
  if(route==='/pages'){
   if(req.method!=='GET'){send(res,405,{ok:false,error:'GET_ONLY'});return true}
   try{
    const output=await custody.withCredentials(async data=>{
     const pages=await ownedPages(data.userAccessToken,fetchImpl);
     return {pages:pages.map(p=>({...p,
       tokenConfigured:typeof data.pages[p.pageId]==='string',
       state:typeof data.pages[p.pageId]==='string'?
         'PAGE_TOKEN_STORED_W24_NOT_VERIFIED':'PAGE_TOKEN_REQUIRED'
     }))};
    });
    send(res,200,{ok:true,status:'OFFICIAL_ACCOUNT_PAGES',
      pages:output.pages,accountVerified:true});
   }catch(e){send(res,e.status||503,{ok:false,error:e.code||'PANCAKE_PAGES_UNAVAILABLE'})}
   return true;
  }
  if(req.method!=='POST'||req.headers['content-type']!=='application/json'||
     req.headers['x-yance-csrf']!==session.record.csrf){
   send(res,403,{ok:false,error:'CURRENT_USER_CSRF_POST_REQUIRED'});return true;
  }
  try{
   const v=await body(req);
   if(route==='/account'){
    if(Object.keys(v).join('|')!=='userAccessToken'||!validToken(v.userAccessToken))
     throw fail('PANCAKE_ACCOUNT_TOKEN_REQUIRED',422);
    const pages=await ownedPages(v.userAccessToken,fetchImpl);
    const saved=await custody.saveAccount({
      session,userAccessToken:v.userAccessToken,explicitUserEntry:true
    });
    send(res,200,{ok:true,status:'OFFICIAL_ACCOUNT_DISCOVERED',
      userTokenStored:saved.stored,pages:pages.map(p=>({...p,
       tokenConfigured:false,state:'PAGE_TOKEN_REQUIRED'})),
      automaticPageTokenRotation:false,source:'PANCAKE_OFFICIAL_API_AND_W55'});
    return true;
   }
   if(Object.keys(v).sort().join('|')!=='pageAccessToken|pageId'||
      !validId(v.pageId)||!validToken(v.pageAccessToken))
    throw fail('PANCAKE_PAGE_TOKEN_REQUIRED',422);
   // The current account User token, not browser-supplied Page identity,
   // proves page membership before any per-Page credential is stored.
   const membership=await custody.withCredentials(async data=>{
    const pages=await ownedPages(data.userAccessToken,fetchImpl);
    return pages.some(p=>p.pageId===v.pageId);
   });
   if(!membership)throw fail('PAGE_NOT_IN_CURRENT_PANCAKE_ACCOUNT');
   await verifyPageToken(v.pageId,v.pageAccessToken,fetchImpl);
   const saved=await custody.savePage({
    session,pageId:v.pageId,pagePublicApiToken:v.pageAccessToken,
    explicitUserEntry:true
   });
   send(res,200,{ok:true,status:'PAGE_API_CONNECTED_READ_ONLY',
    pageId:v.pageId,credentialStored:saved.stored,
    currentW24PeerBinding:false,source:'PANCAKE_OFFICIAL_API_AND_W55'});
  }catch(e){send(res,e.status||503,{ok:false,error:e.code||'PANCAKE_ONBOARDING_FAILED'})}
  return true;
 };
}
