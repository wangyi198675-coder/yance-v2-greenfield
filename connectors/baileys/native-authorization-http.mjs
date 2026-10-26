/**
 * W28 Issue #77 — Owner HTTP route adapter to be mounted by original W47 API.
 * No createServer(), no second local gateway and no transport sender.
 * W47 itself MUST resolve a current signed W54 native first-party Session and
 * host/origin/CSRF/renderer proof on EACH request, not from request headers.
 */
const respond=(res,status,body)=>{
  res.writeHead(status,{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store','pragma':'no-cache','x-content-type-options':'nosniff',
    'x-frame-options':'DENY','referrer-policy':'no-referrer',
    'cross-origin-resource-policy':'same-origin','vary':'Origin, Sec-Fetch-Site',
  });
  res.end(JSON.stringify(body));
};
const denied=(res,status,code)=>respond(res,status,{ok:false,error:code,canSend:false});
const paths=Object.freeze({
  '/api/v2/providers/whatsapp-personal/native/status':{method:'GET',action:'READ_WHATSAPP_STATUS',owner:'readStatus'},
  '/api/v2/providers/whatsapp-personal/native/authorize':{method:'POST',action:'PAIR_OWN_ACCOUNT',owner:'beginPairing'},
  '/api/v2/providers/whatsapp-personal/native/qr':{method:'GET',action:'READ_WHATSAPP_QR',owner:'readQr'},
  '/api/v2/providers/whatsapp-personal/native/disconnect':{method:'POST',action:'DISCONNECT_WHATSAPP',owner:'disconnect'},
  '/api/v2/providers/whatsapp-personal/native/revoke':{method:'POST',action:'REVOKE_WHATSAPP',owner:'revoke'},
  '/api/v2/providers/whatsapp-personal/native/reconnect':{method:'POST',action:'RESUME_EXPLICITLY_APPROVED',owner:'reconnect'},
});
const withLocator=new Set(['PAIR_OWN_ACCOUNT','RESUME_EXPLICITLY_APPROVED']);
async function parseBody(req,withAccount){
  const chunks=[];let n=0;
  for await(const chunk of req){
    n+=chunk.length;
    if(n>1024)throw Object.assign(new Error('REQUEST_BODY_TOO_LARGE'),{code:'REQUEST_BODY_TOO_LARGE'});
    chunks.push(chunk);
  }
  const text=Buffer.concat(chunks).toString('utf8');
  if(!text.trim()){
    if(withAccount)throw Object.assign(new Error('ACCOUNT_LOCATOR_REQUIRED'),{code:'ACCOUNT_LOCATOR_REQUIRED'});
    return {};
  }
  let body;
  try{body=JSON.parse(text)}catch{throw Object.assign(new Error('INVALID_JSON'),{code:'INVALID_JSON'})}
  if(!body||typeof body!=='object'||Array.isArray(body)||
     Object.keys(body).some(k=>k!=='accountLocator')||
     (withAccount?(typeof body.accountLocator!=='string'||
       body.accountLocator.length===0||body.accountLocator.length>256):
       Object.keys(body).length!==0))
    throw Object.assign(new Error('UNTRUSTED_ACTION_BODY'),{code:'UNTRUSTED_ACTION_BODY'});
  return body;
}

export function createBaileysNativeSetupHttpHandler({controller,resolveSignedNativeSession}={}){
  if(typeof resolveSignedNativeSession!=='function'||
    Object.values(paths).some(x=>typeof controller?.[x.owner]!=='function'))
    throw Error('W47_SIGNED_SETUP_HANDLER_DEPENDENCIES_REQUIRED');
  return async function nativeWhatsAppRoute(req,res,url){
    const parsed=url??new URL(req.url||'/', 'http://127.0.0.1');
    const target=paths[parsed.pathname];
    if(!target)return false;
    if(req.method!==target.method||parsed.search) {
      denied(res,405,'NATIVE_METHOD_OR_QUERY_DENIED');return true;
    }
    try{
      const trusted=await resolveSignedNativeSession({request:req,operation:target.action});
      // W47/W54 original verifier, not a new auth system. Explicit CSRF and
      // renderer checks must be made by the original gateway/installed host.
      if(!trusted||trusted.originVerified!==true||trusted.csrfVerified!==true||
        trusted.rendererVerified!==true||!trusted.nativeSession) {
        denied(res,401,'W54_SIGNED_NATIVE_SESSION_REQUIRED');return true;
      }
      const input=req.method==='POST'?await parseBody(req,withLocator.has(target.action)):{};
      const output=await controller[target.owner]({...input,nativeSession:trusted.nativeSession});
      if(output?.ok!==true||output.canSend===true) {
        denied(res,503,'NATIVE_OWNER_INVALID_RESPONSE');return true;
      }
      respond(res,200,{...output,canSend:false});
    }catch(e){
      const code=typeof e?.code==='string'?e.code:'BAILEYS_OWNER_UNAVAILABLE';
      const http=/^(W54_|LOCAL_|NATIVE_SESSION_)/.test(code)?401:
        /^(PLATFORM_|ACCOUNT_REVOKED|CROSS_PRINCIPAL)/.test(code)?403:
        /^(INVALID_JSON|UNTRUSTED_ACTION_BODY|REQUEST_BODY_TOO_LARGE|ACCOUNT_LOCATOR_REQUIRED)/.test(code)?422:
        /^(WORKER_|SETUP_|SDK_QR_|PAIRING_|ACCOUNT_ALREADY_)/.test(code)?409:503;
      denied(res,http,code);
    }
    return true;
  };
}
