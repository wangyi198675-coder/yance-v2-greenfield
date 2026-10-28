// Original FB_PAGE capability probe: W47 same-origin private session + W55
// OS custody. This is NOT a W24/W44 current-K proof or a W25 inbound bridge.
// Never export token, Page ID, contact, chat or message into status metadata.
const headers=Object.freeze({
 'content-type':'application/json; charset=utf-8','cache-control':'no-store',
 'x-content-type-options':'nosniff','x-frame-options':'DENY',
 'referrer-policy':'no-referrer','vary':'Origin, Sec-Fetch-Site'
});
const reply=(res,status,value)=>{res.writeHead(status,headers);res.end(JSON.stringify(value))};
const code=e=>typeof e?.code==='string'&&/^[A-Z0-9_]{4,85}$/.test(e.code)?
 e.code:'FB_PAGE_NATIVE_CREDENTIAL_STATUS_UNAVAILABLE';
export function createFbPageNativeStatusHttp({sessionAuthority,webOrigin,custody}={}){
 if(typeof sessionAuthority?.sessionFor!=='function'||
  !/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(webOrigin))
  throw Error('EXISTING_W47_PRIVATE_SESSION_REQUIRED');
 return async(req,res,url)=>{
  if(url.pathname!=='/api/v2/providers/fb-page/native/status')return false;
  if(req.method!=='GET')return reply(res,405,{ok:false,error:'GET_ONLY',canSend:false}),true;
  if(req.headers.origin&&req.headers.origin!==webOrigin||
     req.headers['sec-fetch-site']!=='same-origin'||url.search)
   return reply(res,403,{ok:false,error:'CURRENT_SAME_ORIGIN_REQUIRED',canSend:false}),true;
  const session=sessionAuthority.sessionFor(req);
  if(!session||!['WEB_LOCAL_PRIVATE','NATIVE_FIRST_PARTY'].includes(session.record?.kind))
   return reply(res,401,{ok:false,error:'TRUSTED_LOCAL_SESSION_REQUIRED',canSend:false}),true;
  if(!custody)return reply(res,503,{ok:false,error:'W55_PANCAKE_NATIVE_NOT_CONNECTED',
   canSend:false}),true;
  try{
   const current=await custody.status();
   if(!current.configured||current.revoked){
    reply(res,200,{ok:true,channel:'FB_PAGE',status:'PANCAKE_ACCOUNT_UNCONFIGURED',
     accountVerified:false,credentialRevision:current.revision,
     credentialRevoked:current.revoked===true,storedPageCount:0,
     w24CurrentKVerified:false,w25InboundConnected:false,
     canSend:false});
    return true;
   }
   // The W55 credential callback stays entirely within the trusted API.
   // Never list page IDs or sensitive server state in this capability route.
   const count=await custody.withCredentials((entry,revision)=>{
    if(revision!==current.revision)throw Object.assign(new Error('STALE_W55_REVISION'),{code:'STALE_W55_REVISION',status:409});
    return Object.values(entry.pages).filter(x=>typeof x==='string').length;
   });
   reply(res,200,{ok:true,channel:'FB_PAGE',
    status:count>0?'PAGE_TOKENS_STORED_W24_BINDING_REQUIRED':'PAGE_TOKEN_REQUIRED',
    accountVerified:true,credentialRevision:current.revision,credentialRevoked:false,
    storedPageCount:count,w24CurrentKVerified:false,
    w25InboundConnected:false,canSend:false});
  }catch(e){
   reply(res,e.status||503,{ok:false,error:code(e),canSend:false});
  }
  return true;
 };
}
