// W47 native V2 local read-only API. Endpoint selected per instance at startup.
// Host/Origin protect the browsing surface; they never authenticate a person or provider.
import {createServer} from 'node:http';
import {resolveRuntimeConfig} from './runtime-config.mjs';
import {resolveRuntimeSource} from './runtime-provenance.mjs';
import {createLocalSessionAuthority,createLocalSessionHttpApi} from './local-session.mjs';
import {createOperatorConsoleIssuer} from './local-operator-console.mjs';
import {createPrivateBrainHttp} from './private-brain-http.mjs';
import {createPrivateModelHttp} from './private-model-http.mjs';
import {createNativeOwnerReadHttp} from './native-authoritative-reads.mjs';

const config=resolveRuntimeConfig();
const sha=resolveRuntimeSource(config);
const {bind,port,webOrigin}=config;
// Optional, explicitly started personal-operator terminal pairing only.
// Never create grants from HTTP, localhost, Origin, actor or JS-supplied identity.
const operatorMode=process.env.YANCE_W47_OPERATOR_PAIRING;
if(operatorMode!==undefined&&operatorMode!==''&&operatorMode!=='console')
  throw Error('W47_OPERATOR_PAIRING_MODE_INVALID');
if(operatorMode==='console'&&config.mode!=='installed')
  throw Error('W47_OPERATOR_PAIRING_INSTALLED_MODE_REQUIRED');
let operatorIssuer=null;
const customTtl=process.env.YANCE_W47_LOCAL_SESSION_TTL_MS;
if(customTtl!==undefined&&(!/^[1-9][0-9]{3,5}$/.test(customTtl)||Number(customTtl)>300_000))
  throw Error('W47_SESSION_TTL_INVALID');
const localSessionAuthority=createLocalSessionAuthority({ttlMs:customTtl?Number(customTtl):300_000,approvePairing:
  operatorMode==='console'?async code=>operatorIssuer?.approvePairing(code)??false:null});
if(operatorMode==='console'){
  operatorIssuer=createOperatorConsoleIssuer({revokeSessions:()=>localSessionAuthority.revokeAll()});
  process.stderr.write('W47_LOCAL_OPERATOR_CONSOLE_READY (type pair, cancel or revoke in this terminal)\n');
}
// The native-first-party callback is intentionally absent until W54 verifies
// the actual packaged host/app-instance over an authenticated private channel.
// /local-session/first-party returns 503 rather than auto-approving localhost.
const localSessionHttp=createLocalSessionHttpApi({authority:localSessionAuthority,webOrigin});
// W55 production credential vault is SEALED and original W43 is local-only.
// Never instantiate test-only model/credential adapters in this real server.
const privateModelHttp=createPrivateModelHttp({sessionAuthority:localSessionAuthority,webOrigin});
// Do not inject a synthetic W43 runtime or a self-declared Windows profile.
// W54 protected AppData + W43 real PRIVATE Scope are not signed together yet.
const privateBrainHttp=createPrivateBrainHttp({sessionAuthority:localSessionAuthority,webOrigin});
// W24 + W26..W29 provider SDK authority is absent, not a zero-contact
// authoritative response. W09 may inject ORIGINAL signed native owner ports
// only after providers are actually running, never synthetic adapter objects.
const nativeOwnerReads=createNativeOwnerReadHttp({sessionAuthority:localSessionAuthority,webOrigin});
const noStore={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store','x-content-type-options':'nosniff',
  'x-frame-options':'DENY','referrer-policy':'no-referrer',
  'cross-origin-resource-policy':'same-origin',
  'vary':'Origin, Sec-Fetch-Site'
};
const serial=(res,status,obj)=>{res.writeHead(status,noStore);res.end(JSON.stringify(obj))};
const deny=(res,status,code)=>serial(res,status,{ok:false,error:code,canSend:false});
const endpoints=Object.freeze({
  takeover:{installed:true,connected:false,reason:'NO_TRUSTED_LOCAL_SESSION_OR_PLATFORM_BINDING'},
  managedStop:{installed:true,connected:false,reason:'NO_TRUSTED_LOCAL_SESSION_OR_PLATFORM_BINDING'},
  messageDelivery:{installed:true,enabled:false,reason:'NO_AUTHORIZED_PROVIDER'},
  agentRuntime:{installed:true,enabled:false,reason:'NO_VERIFIED_RUN_CONTEXT'},
  translation:{installed:true,enabled:false,reason:'NO_REAL_INBOUND_SOURCE'},
  inbound:{installed:false,reason:'NO_CONNECTED_PROVIDER'},
  sender:{installed:true,enabled:false,reason:'NO_AUTHORIZED_PROVIDER'}
});
let boundPort=null;
const state=req=>({
  ok:true,service:'Yance V2 local API',apiVersion:'v2',runtimeSha:sha,
  entrypoint:'services/api/runtime/server.mjs',
  runtimeMode:config.mode,apiPort:boundPort,
  trustedSession:localSessionAuthority.sessionFor(req)?.record?.kind==='NATIVE_FIRST_PARTY',
  connectedAccountCount:null,realContacts:null,realMessageCount:null,
  countsAuthoritative:false,canSend:false,
  mode:'NATIVE_PROVIDER_OWNER_PORTS_NOT_CONNECTED',externalEffects:false
});
const handler=(req,res)=>{
  try{
    const remote=req.socket?.remoteAddress;
    if(!['127.0.0.1','::ffff:127.0.0.1','::1'].includes(remote))
      return deny(res,403,'LOOPBACK_ONLY');
    // A per-install ephemeral port is checked against the actual listening socket.
    if(!new Set([bind+':'+req.socket.localPort,config.webOriginHost]).has(req.headers.host))
      return deny(res,403,'HOST_NOT_ALLOWED');
    const origin=req.headers.origin;
    if(origin && origin!==webOrigin)
      return deny(res,403,'ORIGIN_NOT_ALLOWED');
    if(['cross-site','same-site'].includes(req.headers['sec-fetch-site']))
      return deny(res,403,'CROSS_SITE_BLOCKED');
    if(req.method==='OPTIONS')return deny(res,403,'CORS_DISABLED');
    const url=new URL(req.url||'/', 'http://'+bind+':'+req.socket.localPort);
    if(url.pathname.startsWith('/api/v2/local-session/')){
      void localSessionHttp(req,res,url).catch(()=>{
        if(!res.headersSent)deny(res,503,'LOCAL_SESSION_UNAVAILABLE');
        else res.destroy();
      });
      return;
    }
    if(['/api/v2/private-brain/model-catalog',
        '/api/v2/private-brain/model-config',
        '/api/v2/private-brain/model-selection'].includes(url.pathname)){
      void privateModelHttp(req,res,url).catch(()=>{
        if(!res.headersSent)deny(res,503,'MODEL_CONFIG_UNAVAILABLE');
        else res.destroy();
      });
      return;
    }
    if(url.pathname.startsWith('/api/v2/private-brain/')){
      void privateBrainHttp(req,res,url).catch(()=>{
        if(!res.headersSent)deny(res,503,'PRIVATE_BRAIN_UNAVAILABLE');
        else res.destroy();
      });
      return;
    }
    if(req.method==='GET' && (url.pathname==='/api/v2/runtime/health'||url.pathname==='/health'))
      return serial(res,200,state(req));
    if(req.method==='GET' && url.pathname==='/api/v2/runtime/version')
      return serial(res,200,{...state(req),webSource:'SEE_INSTALLED_LOCAL_WEB_VERSION',apiGitSha:sha});
    if(req.method==='GET' && url.pathname==='/api/v2/runtime/capabilities')
      return serial(res,200,{ok:true,authoritative:true,canSend:false,capabilities:endpoints});
    if(url.pathname==='/api/v2/contacts'){
      void nativeOwnerReads(req,res,url).catch(()=>{
       if(!res.headersSent)deny(res,503,'NATIVE_CONTACT_SOURCE_UNAVAILABLE');
       else res.destroy();
      });
      return;
    }
    if(req.method==='GET' && url.pathname==='/api/v2/messages')
      return deny(res,401,'NO_AUTHORIZED_CONTACT');
    if(req.method==='GET' && url.pathname==='/api/v2/translations')
      return deny(res,401,'NO_AUTHORIZED_SOURCE_MESSAGE');
    if(url.pathname==='/api/v2/identity-consent/takeover-state' ||
       url.pathname==='/api/v2/identity-consent/takeover' ||
       url.pathname==='/api/v2/managed-stop')
      return deny(res,401,'TRUSTED_SESSION_AND_CURRENT_BINDING_REQUIRED');
    if(url.pathname.startsWith('/w46-native-test/'))
      return deny(res,410,'SYNTHETIC_TEST_ROUTE_NOT_AVAILABLE');
    if(['/api/v2/send','/api/v2/outbox','/api/v2/agent/run'].includes(url.pathname))
      return deny(res,403,'EFFECTS_DISABLED');
    return deny(res,404,'ROUTE_NOT_FOUND');
  }catch{return deny(res,503,'API_RUNTIME_UNAVAILABLE')}
};
const server=createServer(handler);
server.on('clientError',(_err,socket)=>socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));
server.listen(port,bind,()=>{
  boundPort=server.address().port;
  console.log(JSON.stringify({event:'V2_API_READY',url:'http://'+bind+':'+boundPort,
    apiGitSha:sha,mode:'NO_PROVIDER_SAFE',runtimeMode:config.mode}));
});
