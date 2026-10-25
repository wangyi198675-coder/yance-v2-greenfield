// W47 native V2 local read-only API composition. No synthetic authority or provider effects.
// No V1 dependencies, second agent, sender, database, or login account platform.
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root=resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const bind='127.0.0.1';
const port=47182;
const webOrigin='http://127.0.0.1:4399';
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
const state=()=>({
  ok:true,service:'Yance V2 local API',apiVersion:'v2',runtimeSha:sha,
  entrypoint:'services/api/runtime/server.mjs',
  trustedSession:false,connectedAccountCount:0,
  realContacts:0,realMessageCount:0,canSend:false,
  mode:'LOCAL_UNAUTHORIZED_NO_PROVIDER',externalEffects:false
});
const handler=(req,res)=>{
  try{
    const remote=req.socket?.remoteAddress;
    if(!['127.0.0.1','::ffff:127.0.0.1','::1'].includes(remote))
      return deny(res,403,'LOOPBACK_ONLY');
    if(req.headers.host!==bind+':'+port && req.headers.host!==bind+':4399')
      return deny(res,403,'HOST_NOT_ALLOWED');
    const origin=req.headers.origin;
    if(origin && origin!==webOrigin)
      return deny(res,403,'ORIGIN_NOT_ALLOWED');
    if(['cross-site','same-site'].includes(req.headers['sec-fetch-site']))
      return deny(res,403,'CROSS_SITE_BLOCKED');
    if(req.method==='OPTIONS')return deny(res,403,'CORS_DISABLED');
    const url=new URL(req.url||'/', 'http://'+bind+':'+port);
    if(req.method==='GET' && (url.pathname==='/api/v2/runtime/health'||url.pathname==='/health'))
      return serial(res,200,state());
    if(req.method==='GET' && url.pathname==='/api/v2/runtime/version')
      return serial(res,200,{...state(),webSource:'SEE_4399_VERSION_JSON',apiGitSha:sha});
    if(req.method==='GET' && url.pathname==='/api/v2/runtime/capabilities')
      return serial(res,200,{ok:true,authoritative:true,canSend:false,capabilities:endpoints});
    if(req.method==='GET' && url.pathname==='/api/v2/contacts')
      return serial(res,200,{ok:true,authoritative:true,contacts:[],source:'NONE_CONNECTED',
        connectedAccountCount:0,canSend:false,reason:'NO_CONNECTED_PROVIDER'});
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
server.listen(port,bind,()=>console.log(JSON.stringify({event:'V2_API_READY',url:'http://'+bind+':'+port,apiGitSha:sha,mode:'NO_PROVIDER_SAFE'})));
