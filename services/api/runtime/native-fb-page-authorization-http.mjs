// W47 integration: only routes original W27 native authorization actions.
// Fail closed until W54 first-party Session, W24 and W55 native Owner's
// original adapter have been signed and injected. Does not handle tokens.
const actions=Object.freeze({
 start:'beginAuthorization',
 pages:'listVerifiedPageChoices',
 bind:'confirmPageBinding',
 refresh:'connectionStatus',
 revoke:'revokeAuthorization'
});
const json=(res,status,body)=>{res.writeHead(status,{
 'content-type':'application/json; charset=utf-8','cache-control':'no-store',
 'x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin',
 'referrer-policy':'no-referrer','vary':'Origin, Sec-Fetch-Site'
});res.end(JSON.stringify(body));};
const deny=(res,status,error)=>json(res,status,{ok:false,error,canSend:false});
export function createNativeFbPageAuthorizationHttp({
 sessionAuthority,webOrigin,invokeW27NativeAuthorization=null,resolveW54Principal=null,
 enrollW55PancakeCredentials=null
}={}){
 if(typeof sessionAuthority?.sessionFor!=='function'||!/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(webOrigin))
  throw Error('W47_NATIVE_AUTH_TRUST_REQUIRED');
 if([invokeW27NativeAuthorization,resolveW54Principal]
    .some(x=>x!==null&&typeof x!=='function'))
  throw Error('W27_NATIVE_AUTH_PORT_INVALID');
 return async(req,res,url)=>{
  if(url.pathname==='/api/v2/providers/fb-page/authorization/capabilities'){
   if(req.method!=='GET'){deny(res,405,'METHOD_NOT_ALLOWED');return true;}
   json(res,200,{ok:true,channel:'FB_PAGE',
    ownerPortConnected:!!(invokeW27NativeAuthorization&&resolveW54Principal),
    secureCredentialEnrollment:typeof enrollW55PancakeCredentials==='function',
    canSend:false});return true;
  }
  if(url.pathname==='/api/v2/providers/fb-page/authorization/configure'){
    // Superseded one-Page form must not accept any more secrets.
    deny(res,410,'USE_OFFICIAL_MULTI_PAGE_ONBOARDING');return true;
  }
  const m=/^\/api\/v2\/providers\/fb-page\/authorization\/(start|pages|bind|refresh|revoke)$/.exec(url.pathname);
  if(!m)return false;
  if(req.method!=='POST'){deny(res,405,'USER_ACTION_POST_ONLY');return true}
  if(url.search||req.headers.origin!==webOrigin||
      req.headers['sec-fetch-site']!=='same-origin'||
      req.headers['content-type']!=='application/json'){
   deny(res,403,'W54_SAME_ORIGIN_NATIVE_ACTION_REQUIRED');return true;
  }
  const session=sessionAuthority.sessionFor(req);
  if(!session||session.record?.kind!=='NATIVE_FIRST_PARTY'){
   deny(res,401,'W54_NATIVE_FIRST_PARTY_SESSION_REQUIRED');return true;
  }
  const csrf=req.headers['x-yance-csrf'];
  if(typeof csrf!=='string'||csrf.length!==64||
     csrf!==session.record.csrf){
   deny(res,403,'ORIGINAL_LOCAL_SESSION_CSRF_REQUIRED');return true;
  }
  if(!invokeW27NativeAuthorization||!resolveW54Principal){
   deny(res,503,'W27_W54_NATIVE_AUTH_NOT_CONNECTED');return true;
  }
  const bytes=[];
  let size=0;
  try{
   for await(const block of req){size+=block.length;if(size>1024)throw Error('OVERSIZED');bytes.push(block)}
  }catch{deny(res,413,'AUTH_PAYLOAD_TOO_LARGE');return true;}
  let body;
  try{body=JSON.parse(Buffer.concat(bytes).toString('utf8'))}
  catch{deny(res,422,'INVALID_ACTION_PAYLOAD');return true}
  if(!body||Array.isArray(body)||typeof body!=='object'){
   deny(res,422,'INVALID_ACTION_PAYLOAD');return true;
  }
  const op=m[1];
  if(op==='bind'){
   if(Object.keys(body).length!==1||typeof body.selectedProviderPageId!=='string'||
     !/^[0-9]{1,40}$/.test(body.selectedProviderPageId)){
    deny(res,422,'VERIFIED_PROVIDER_PAGE_CHOICE_REQUIRED');return true;
   }
  }else if(Object.keys(body).length){
   deny(res,422,'ACTION_BODY_MUST_BE_EMPTY');return true;
  }
  let principal;
  try{
   principal=await resolveW54Principal({session,operation:'FB_PAGE_'+op.toUpperCase()});
   if(principal?.verified!==true||principal.source!=='W54_NATIVE_CURRENT_USER'||
      typeof principal.principalRef!=='string'||!principal.principalRef||
      typeof principal.installationRef!=='string'||!principal.installationRef||
      !Number.isSafeInteger(principal.revocationGeneration))
    throw Error('NATIVE_PRINCIPAL_UNVERIFIED');
  }catch{deny(res,403,'W54_NATIVE_PRINCIPAL_UNVERIFIED');return true;}
  try{
   // W27 original ActionPort independently verifies a fresh native gesture
   // for START/PAGES/BIND/REVOKE and current Page, token lease and epochs.
   const result=await invokeW27NativeAuthorization({
     action:actions[op],principal,session,body:op==='bind'?body:{},
     source:'CURRENT_USER_ACTION_W54_ONLY'
   });
   const latest=sessionAuthority.sessionFor(req);
   if(!latest||latest.id!==session.id||latest.record.rev!==session.record.rev){
    deny(res,409,'W54_SESSION_REVOKED_DURING_PAGE_AUTH');return true;
   }
   const current=await resolveW54Principal({session:latest,operation:'FB_PAGE_'+op.toUpperCase()});
   if(current?.verified!==true||current.principalRef!==principal.principalRef||
     current.installationRef!==principal.installationRef||
     current.revocationGeneration!==principal.revocationGeneration){
    deny(res,409,'W54_PRINCIPAL_CHANGED_DURING_PAGE_AUTH');return true;
   }
   const expected={
     start:['WAITING_USER_AUTH'],pages:['PAGE_SELECTION_REQUIRED'],
     bind:['AUTHORIZED_READ_ONLY'],refresh:['WAITING_USER_AUTH','AUTHORIZED_READ_ONLY','REVOKED','REVOKED_OR_REBOUND'],
     revoke:['REVOKED','REVOKED_CREDENTIAL_CLEANUP_PENDING']
   }[op];
   if(!expected.includes(result?.status)||result.canSend!==false||
      (op==='start'&&result.entryAvailable!==true)||
      (op==='pages'&&!Array.isArray(result.pages))||
      (op==='bind'&&result.identityVerified!==true)){
    deny(res,502,'W27_NATIVE_ACTION_RESPONSE_UNVERIFIED');return true;
   }
   // Never expose provider token data or assume Meta ONLINE from Page REST.
   if(op==='pages'){
    const pages=result.pages.map(x=>({
      providerPageId:x?.providerPageId,name:x?.name??null,platform:x?.platform??null
    }));
    if(pages.some(x=>typeof x.providerPageId!=='string'||!/^[0-9]{1,40}$/.test(x.providerPageId))){
     deny(res,502,'W27_PROVIDER_PAGE_IDS_UNVERIFIED');return true;
    }
    json(res,200,{ok:true,channel:'FB_PAGE',source:'PANCAKE_NATIVE',
     status:'PAGE_SELECTION_REQUIRED',pages,canSend:false});return true;
   }
   json(res,200,{ok:true,channel:'FB_PAGE',source:'PANCAKE_NATIVE',
    status:result.status,canSend:false,
    ...(op==='start'?{entryAvailable:true,credentialInput:'NATIVE_PROTECTED_ONLY'}:{}),
    ...(op==='bind'?{providerPageId:result.providerPageId,bindingRevision:result.bindingRevision,identityVerified:true}:{}),
    ...(op==='refresh'?{onlineVerified:false,providerPageId:result.providerPageId??null,bindingRevision:result.bindingRevision??null}:{}),
    ...(op==='revoke'?{credentialCleanup:result.credentialCleanup??null}:{})
   });return true;
  }catch(e){
   const allowed=[401,403,409,422,429,503];
   const code=typeof e?.code==='string'&&/^[A-Z0-9_]{4,90}$/.test(e.code)?e.code:'W27_NATIVE_ACTION_FAILED';
   deny(res,allowed.includes(e?.status)?e.status:503,code);return true;
  }
 };
}


// Adapter ONLY: W09/W47 may inject this after the ORIGINAL W27 factory has
// been constructed from signed W54 gestures, W55 token custody and W24 K.
// Never synthesize these dependencies from browser state or process env.
export function makeOriginalW27NativeInvoker(originalW27){
 const needed=['beginAuthorization','listVerifiedPageChoices',
  'confirmPageBinding','connectionStatus','revokeAuthorization'];
 if(needed.some(k=>typeof originalW27?.[k]!=='function'))
  throw Error('W27_ORIGINAL_NATIVE_ACTION_PORT_REQUIRED');
 return async({action,body}={})=>{
  if(action==='confirmPageBinding')return originalW27.confirmPageBinding({
   selectedProviderPageId:body?.selectedProviderPageId
  });
  if(action==='connectionStatus')return originalW27.connectionStatus({
   refreshProvider:true
  });
  if(!needed.includes(action)||action==='confirmPageBinding'||action==='connectionStatus')
   throw Error('W27_ORIGINAL_ACTION_NOT_ALLOWED');
  return originalW27[action]();
 };
}
