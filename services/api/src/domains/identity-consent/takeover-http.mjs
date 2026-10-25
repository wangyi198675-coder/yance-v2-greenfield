/**
 * Nonproduction trusted-backend HTTP adapter over W24 takeover service.
 * Caller MUST inject authoritative resolveTrustedContext(request): Promise<ctx>|ctx.
 * The browser must not self-declare principal/tenant. No listener auto-starts.
 */
import {IdentityDenied} from './identity-consent.mjs';
import {parseIdentityKey,TAKEOVER_GET,TAKEOVER_POST,TakeoverDenied} from './takeover.mjs';

const emit=(res,status,payload)=>{
  res.writeHead(status,{'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store','x-content-type-options':'nosniff'});
  res.end(JSON.stringify(payload));
};
const fail=(code,status)=>{throw new TakeoverDenied(code,status)};
const loopback=a=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(a);
async function jsonBody(req) {
  let size=0,content='';
  for await (const chunk of req) {
    size+=chunk.length;
    if(size>4096)fail('TAKEOVER_BODY_TOO_LARGE',413);
    content+=chunk.toString('utf8');
  }
  try {
    const parsed=JSON.parse(content);
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))fail('INVALID_POST_BODY',422);
    return parsed;
  } catch(e) {
    if(e instanceof TakeoverDenied)throw e;
    fail('INVALID_POST_JSON',422);
  }
}
export function createNativeTakeoverHttpHandler({service,resolveTrustedContext}={}) {
  if(typeof service?.get!=='function'||typeof service?.post!=='function'||
     typeof resolveTrustedContext!=='function')
    throw Error('TRUSTED_W24_TAKEOVER_HTTP_DEPENDENCIES_REQUIRED');
  return async function handler(req,res){
    try{
      if(!loopback(req.socket?.remoteAddress))fail('LOOPBACK_ONLY',403);
      if(req.headers['x-yance-environment']!=='synthetic-only')
        fail('SYNTHETIC_ENVIRONMENT_REQUIRED',403);
      const url=new URL(req.url||'/', 'http://127.0.0.1');
      if(![TAKEOVER_GET,TAKEOVER_POST].includes(url.pathname))fail('NOT_FOUND',404);
      if((url.pathname===TAKEOVER_GET&&req.method!=='GET')||
         (url.pathname===TAKEOVER_POST&&req.method!=='POST'))fail('METHOD_NOT_ALLOWED',405);
      // An upstream session/IPC owner must actually authenticate this request.
      // URL, body, headers alone MUST NOT be treated as a principal.
      const trustedContext=await resolveTrustedContext(req);
      if(!trustedContext||trustedContext.input_domain!=='CONTACT'||!trustedContext.principal_id)
        fail('TRUSTED_CONTEXT_REQUIRED',401);
      if(url.pathname===TAKEOVER_GET){
        if(url.searchParams.size!==1||!url.searchParams.has('k'))
          fail('GET_FULL_K_REQUIRED',422);
        return emit(res,200,service.get({
          trustedContext,identity:parseIdentityKey(url.searchParams.get('k'))
        }));
      }
      if(url.search)fail('POST_QUERY_FORBIDDEN',422);
      const body=await jsonBody(req);
      return emit(res,200,service.post({
        trustedContext,identity:body.identity,
        expectedIdentityKey:body.expectedIdentityKey,
        expectedEpoch:body.expectedEpoch,
        expectedAccountRevocationEpoch:body.expectedAccountRevocationEpoch,
        expectedConsentEpoch:body.expectedConsentEpoch,
        action:body.action,intent:body.intent
      }));
    }catch(e){
      if(e instanceof TakeoverDenied)return emit(res,e.status,{accepted:false,error:e.code});
      if(e instanceof IdentityDenied){
        const stale=/STALE|UNBOUND|REVOKED|EPOCH/.test(e.code);
        return emit(res,stale?409:403,{accepted:false,error:e.code});
      }
      // Never echo secrets / provider errors or claim success on unknown exceptions.
      return emit(res,503,{accepted:false,error:'TAKEOVER_SERVICE_UNAVAILABLE'});
    }
  };
}
