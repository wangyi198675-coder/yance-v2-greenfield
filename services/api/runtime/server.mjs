// W47 native V2 local read-only API. Endpoint selected per instance at startup.
// Host/Origin protect the browsing surface; they never authenticate a person or provider.
import {createServer} from 'node:http';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolveRuntimeConfig} from './runtime-config.mjs';
import {resolveRuntimeSource} from './runtime-provenance.mjs';
import {createLocalSessionAuthority,createLocalSessionHttpApi} from './local-session.mjs';
import {createOperatorConsoleIssuer} from './local-operator-console.mjs';
import {createPrivateBrainHttp,createPrivateNativeInspectionHttp,
 createPrivateNativeExpertHttp,createContactNativeAuthorityHoldHttp} from './private-brain-http.mjs';
import {createW43PythonPrivatePort} from './private-python-port.mjs';
import {createW43NativeLedgerAdapter} from './private-native-ledger-port.mjs';
import {readW54LocalBoot,createNativeStartupSession} from './native-private-startup.mjs';
import {createWebPrivateLocalQwen} from './web-private-local-qwen.mjs';
import {createWebPrivateCloudByok} from './web-private-cloud-byok.mjs';
import {createWebPrivateCloudHttp} from './web-private-cloud-http.mjs';
import {createW55WebNativeStdioPort} from './w55-web-native-stdio.mjs';
import {createPrivateModelHttp} from './private-model-http.mjs';
import {createNativeOwnerReadHttp} from './native-authoritative-reads.mjs';
import {createNativeProviderGateway,makeW26DiagnosticPort} from './native-provider-gateway.mjs';
import {createNativeMessageReadHttp} from './native-message-reads.mjs';
import {resolvePinnedNativeWebAssets} from './native-pinned-web-assets.mjs';
import {createW47WebMediaHttp} from './w47-w23-media-bridge.mjs';
import {createW47NativeSettingsCatalog} from './w47-native-settings-capabilities.mjs';
import {createW47NativeContextMenuCapabilitiesHttp} from './w47-native-context-menu-capabilities.mjs';
import {createOfficialSiwcHttp} from './w47-official-siwc.mjs';

const config=resolveRuntimeConfig();
const sha=resolveRuntimeSource(config);
const {bind,port,webOrigin}=config;
// OPTIONAL W54/W09 SHA-pinned B+C files share this exact installed API port.
// Asset integrity does not confer Windows identity, Session or paid rights.
const pinnedWeb=resolvePinnedNativeWebAssets({config});
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
// Only the original installed W54 parent can write this frame through Node
// child stdin. No HTTP request, localhost Origin or frontend-supplied profile
// supplies these private current-user fields or receives the HttpOnly cookie.
const nativeBoot=readW54LocalBoot();
const webPrivateMode=process.env.YANCE_W47_WEB_PRIVATE_SINGLE_USER==='1';
if(webPrivateMode&&(config.mode!=='development'||nativeBoot||
   !/^http:\/\/127\.0\.0\.1:[0-9]{4,5}$/.test(webOrigin)))
 throw Error('W47_WEB_PRIVATE_QA_LOOPBACK_DEVELOPMENT_ONLY');
// Existing process-only local profile, not an HTTP/browser-owned Principal.
const webPrivateRoot=webPrivateMode?join(process.env.LOCALAPPDATA||homedir(),
 'YanceV2','WebPrivate'):null;
if(webPrivateRoot)mkdirSync(webPrivateRoot,{recursive:true,mode:0o700});
const localId=x=>createHash('sha256').update(x).digest('hex').slice(0,32);
const existingLocalQwenKey=process.env.YANCE_W47_W43_LOCAL_KEY_FILE;
const webPrivateQwen=webPrivateRoot&&existingLocalQwenKey?
 createWebPrivateLocalQwen({appLocalDataRoot:webPrivateRoot,
   localKeyFile:existingLocalQwenKey}):null;
// W55's ORIGINAL Rust WinCred host is optional for a local-Qwen-only user.
// W55 owns the executable, WinCred scope and OS checks, not the browser.
let webCloudByok=null;
if(webPrivateRoot&&process.env.YANCE_W55_WEB_NATIVE_EXE){
 const nativeWinCred=createW55WebNativeStdioPort({
  executable:process.env.YANCE_W55_WEB_NATIVE_EXE});
 webCloudByok=createWebPrivateCloudByok({
  appLocalDataRoot:webPrivateRoot,nativeKeyPort:nativeWinCred});
}
const webPrivatePrincipal=webPrivateRoot?Object.freeze({
 source:'WEB_LOCAL_PRIVATE',webPrivateOnly:true,verified:true,
 principalRef:'web_private_'+localId(webPrivateRoot),
 installationRef:'web_install_'+localId(webPrivateRoot+'|YanceV2'),
 appLocalDataRoot:webPrivateRoot,modelBackend:'unconfigured',
 modelId:'',modelSelectionEpoch:0,modelUserSelected:false,
 extraChargeApproved:false,protectedCredentialAttested:false}):null;
const nativeSession=createNativeStartupSession({authority:localSessionAuthority,boot:nativeBoot});
const resolveNativePrincipal=nativeBoot?async({session})=>{
 if(session?.record?.kind!=='NATIVE_FIRST_PARTY'||
    session.record.nativeHostBinding!==nativeSession.binding)
  throw {httpStatus:401,code:'LOCAL_SESSION_REVOKED'};
 return nativeBoot;
}:webPrivatePrincipal?async({session})=>{
 if(session?.record?.kind!=='WEB_LOCAL_PRIVATE')
   throw {httpStatus:401,code:'WEB_PRIVATE_SESSION_REQUIRED'};
 // WinCred can be absent/revoked/network-independent: Agno History must
 // remain readable even when no cloud model is currently usable.
 let cloud=null;
 try{cloud=webCloudByok?await webCloudByok.principalModel():null}catch{}
 return {...webPrivatePrincipal,
   ...(cloud??(webPrivateQwen?webPrivateQwen.principalModel():{}))};
}:null;
const w43Python=process.env.YANCE_W47_W43_PYTHON_EXECUTABLE;
const w43Root=process.env.YANCE_W47_W43_MODULE_ROOT;
if((w43Python||w43Root)&&!nativeBoot&&!webPrivatePrincipal)
 throw Error('W43_RUNTIME_REQUIRES_INSTALLED_W54_HOST');
// Original W43 Agno SqliteDb/Run and durable request ledger remain the SINGLE
// authority; no additional Node memory or shadow history store is created.
const w43Port=(nativeBoot||webPrivatePrincipal)&&w43Python&&w43Root?
 createW43PythonPrivatePort({pythonExecutable:w43Python,w43ModuleRoot:w43Root,
  protectedKeyFile:webPrivateQwen?existingLocalQwenKey:
   nativeBoot?.modelBackend==='llamacpp'?
   process.env.YANCE_W47_W43_LOCAL_KEY_FILE:undefined,
  ...(webCloudByok?{nativeCloudKeyPort:webCloudByok}:{})}):null;
const requestLedger=w43Port?createW43NativeLedgerAdapter(w43Port):null;
if(operatorMode==='console'){
  operatorIssuer=createOperatorConsoleIssuer({revokeSessions:()=>localSessionAuthority.revokeAll()});
  process.stderr.write('W47_LOCAL_OPERATOR_CONSOLE_READY (type pair, cancel or revoke in this terminal)\n');
}
// The native-first-party callback is intentionally absent until W54 verifies
// the actual packaged host/app-instance over an authenticated private channel.
// /local-session/first-party returns 503 rather than auto-approving localhost.
const localSessionHttp=createLocalSessionHttpApi({authority:localSessionAuthority,webOrigin,enableWebPrivate:webPrivateMode});
// W55 production credential vault is SEALED and original W43 is local-only.
// Never instantiate test-only model/credential adapters in this real server.
const privateModelHttp=createPrivateModelHttp({
 sessionAuthority:localSessionAuthority,webOrigin,resolveNativePrincipal,
 localWebModelPort:webPrivateQwen,webCloudModelPort:webCloudByok
});
const privateCloudHttp=createWebPrivateCloudHttp({
 sessionAuthority:localSessionAuthority,webOrigin,webCloudPort:webCloudByok
});
// Do not inject a synthetic W43 runtime or a self-declared Windows profile.
// W54 protected AppData + W43 real PRIVATE Scope are not signed together yet.
const privateBrainHttp=createPrivateBrainHttp({
 sessionAuthority:localSessionAuthority,webOrigin,resolveNativePrincipal,
 w43Port,requestLedger
});
const privateInspectionHttp=createPrivateNativeInspectionHttp({
 sessionAuthority:localSessionAuthority,webOrigin,resolveNativePrincipal,w43Port
});
const privateExpertHttp=createPrivateNativeExpertHttp({
 sessionAuthority:localSessionAuthority,webOrigin,resolveNativePrincipal,w43Port
});
const contactNativeAuthorityHttp=createContactNativeAuthorityHoldHttp({
 sessionAuthority:localSessionAuthority,webOrigin
});
// Original W23 is installed; the REAL W24/W44 current-account proof and
// W55 protected 32-byte persistent media key are NOT signed into this host.
// Provide original W23 formats/capabilities, but no identity/key or fake upload.
const nativeMediaHttp=createW47WebMediaHttp({
 sessionAuthority:localSessionAuthority,webOrigin
});
const officialSiwcHttp=createOfficialSiwcHttp({sessionAuthority:localSessionAuthority,webOrigin});
const nativeSettingsCatalog=createW47NativeSettingsCatalog({
 sessionAuthority:localSessionAuthority,webOrigin
});
// W24 + W26..W29 provider SDK authority is absent, not a zero-contact
// authoritative response. W09 may inject ORIGINAL signed native owner ports
// only after providers are actually running, never synthetic adapter objects.
const nativeOwnerReads=createNativeOwnerReadHttp({sessionAuthority:localSessionAuthority,webOrigin});
// W47-only readback of actual Owner gate readiness. Never executes a menu action.
const nativeContextMenuCapabilities=createW47NativeContextMenuCapabilitiesHttp({
 sessionAuthority:localSessionAuthority,webOrigin
});
// W26 real official bridge read is DIAGNOSTIC ONLY, never source of FB
// user auth. Explicit W09/W54-injected native owner ports are still required
// for actual W24 account ONLINE, SDK setup and authorized message access.
const nativeMessages=createNativeMessageReadHttp({
 sessionAuthority:localSessionAuthority,webOrigin
});
const nativeProviders=createNativeProviderGateway({
 sessionAuthority:localSessionAuthority,
 readW26Status:makeW26DiagnosticPort(process.env.YANCE_W47_W26_READONLY_PORT)
});
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
  nativeWebSourceSha:pinnedWeb?.sourceSha??null,
  nativeWebSameOrigin:pinnedWeb!==null,
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
    if(url.pathname.startsWith('/api/v2/chatgpt/')){
      void officialSiwcHttp(req,res,url).then(handled=>{
       if(!handled&&!res.writableEnded)deny(res,404,'OFFICIAL_SIWC_ROUTE_NOT_FOUND');
      }).catch(()=>{
       if(!res.headersSent)deny(res,503,'OFFICIAL_SIWC_ADAPTER_UNAVAILABLE');
       else res.destroy();
      });return;
    }
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
    if(url.pathname==='/api/v2/private-brain/cloud-keys'){
      void privateCloudHttp(req,res,url).catch(()=>{
        if(!res.headersSent)deny(res,503,'W55_NATIVE_CLOUD_KEY_UNAVAILABLE');
        else res.destroy();
      });
      return;
    }
    if(url.pathname.startsWith('/api/v2/media/')){
      void nativeMediaHttp(req,res,url).then(handled=>{
       if(!handled&&!res.writableEnded)deny(res,404,'W23_MEDIA_ROUTE_NOT_FOUND');
      }).catch(()=>{
       if(!res.headersSent)deny(res,503,'W23_MEDIA_AUTHORITY_UNAVAILABLE');
       else res.destroy();
      });return;
    }
    if(url.pathname.startsWith('/api/v2/settings/')){
      void nativeSettingsCatalog(req,res,url).then(handled=>{
       if(!handled&&!res.writableEnded)deny(res,404,'SETTINGS_ROUTE_NOT_FOUND');
      }).catch(()=>{
       if(!res.headersSent)deny(res,503,'ORIGINAL_SETTINGS_CATALOG_UNAVAILABLE');
       else res.destroy();
      });return;
    }
    if(url.pathname.startsWith('/api/v2/contact-context/')){
      void contactNativeAuthorityHttp(req,res,url).then(handled=>{
       if(!handled&&!res.writableEnded)deny(res,404,'CONTACT_CONTEXT_ROUTE_NOT_FOUND');
      }).catch(()=>{
       if(!res.headersSent)deny(res,503,'CONTACT_NATIVE_AUTHORITY_UNAVAILABLE');
       else res.destroy();
      });return;
    }
    if(url.pathname.startsWith('/api/v2/private-brain/')){
      // W43's one Agno expert directory+Run/Trace uses the existing session.
      void privateExpertHttp(req,res,url).then(handled=>
        handled?true:privateInspectionHttp(req,res,url)).then(handled=>
        handled?true:privateBrainHttp(req,res,url)).then(handled=>{
         if(!handled&&!res.writableEnded)deny(res,404,'PRIVATE_BRAIN_ROUTE_NOT_FOUND');
        }).catch(()=>{
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
    if(/^\/api\/v2\/providers\/(fb-page|whatsapp-personal|telegram-personal)\/native\//.test(url.pathname)){
      // Original W27/W28/W29 SDK owners are present in source, but the
      // W24 account lifecycle/W55 user-approved credential consumers are
      // not yet injected here. Do not turn an HTTP 404 into a fake QR/login.
      return deny(res,503,'NATIVE_CHANNEL_AUTH_OWNER_PORT_NOT_CONNECTED');
    }
    if(url.pathname.startsWith('/api/v2/providers/')){
      void nativeProviders(req,res,url).then(handled=>{
       if(!handled&&!res.writableEnded)deny(res,404,'ROUTE_NOT_FOUND');
      }).catch(()=>{
       if(!res.headersSent)deny(res,503,'ORIGINAL_NATIVE_PROVIDER_GATEWAY_UNAVAILABLE');
       else res.destroy();
      });
      return;
    }
    if(url.pathname.startsWith('/api/v2/context-menu/')){
      void nativeContextMenuCapabilities(req,res,url).catch(()=>{
       if(!res.headersSent)deny(res,503,'ORIGINAL_CONTEXT_OWNER_UNAVAILABLE');
       else res.destroy();
      });
      return;
    }
    if(url.pathname==='/api/v2/contacts'){
      void nativeOwnerReads(req,res,url).catch(()=>{
       if(!res.headersSent)deny(res,503,'NATIVE_CONTACT_SOURCE_UNAVAILABLE');
       else res.destroy();
      });
      return;
    }
    if(url.pathname==='/api/v2/messages'){
      void nativeMessages(req,res,url).catch(()=>{
       if(!res.headersSent)deny(res,503,'W25_NATIVE_MESSAGE_READ_UNAVAILABLE');
       else res.destroy();
      });
      return;
    }
    if(req.method==='GET' && url.pathname==='/api/v2/translations'){
      return localSessionAuthority.sessionFor(req)?
       deny(res,503,'W45_NATIVE_TRANSLATION_AND_ATTESTOR_NOT_CONNECTED'):
       deny(res,401,'NO_AUTHORIZED_SOURCE_MESSAGE');
    }
    if(['/api/v2/persona-policy','/api/v2/persona/learning'].includes(url.pathname)){
      if(req.method!=='GET')return deny(res,405,'READ_ONLY_CAPABILITIES');
      if(!localSessionAuthority.sessionFor(req))return deny(res,401,'LOCAL_SESSION_REQUIRED');
      return deny(res,503,'PERSONA_POLICY_NATIVE_DB_OWNER_NOT_SIGNED');
    }
    if(url.pathname==='/api/v2/identity-consent/takeover-state' ||
       url.pathname==='/api/v2/identity-consent/takeover' ||
       url.pathname==='/api/v2/managed-stop')
      return localSessionAuthority.sessionFor(req)?
       deny(res,503,'W44_NATIVE_CUSTODY_AND_CURRENT_K_PORT_NOT_CONNECTED'):
       deny(res,401,'TRUSTED_SESSION_AND_CURRENT_BINDING_REQUIRED');
    if(url.pathname.startsWith('/w46-native-test/'))
      return deny(res,410,'SYNTHETIC_TEST_ROUTE_NOT_AVAILABLE');
    if(['/api/v2/send','/api/v2/outbox','/api/v2/agent/run'].includes(url.pathname))
      return deny(res,403,'EFFECTS_DISABLED');
    if(pinnedWeb?.respond(req,res,url))return;
    // Never fall back to index.html for an unknown API route.
    return deny(res,404,'ROUTE_NOT_FOUND');
  }catch{return deny(res,503,'API_RUNTIME_UNAVAILABLE')}
};
const server=createServer(handler);
server.on('clientError',(_err,socket)=>socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));
server.listen(port,bind,()=>{
  boundPort=server.address().port;
  console.log(JSON.stringify({event:'V2_API_READY',url:'http://'+bind+':'+boundPort,
    apiGitSha:sha,mode:'NO_PROVIDER_SAFE',runtimeMode:config.mode,
    // This stdout stays on W54's original private inherited child handle.
    // Never expose it through /health, HTTP Set-Cookie, browser JavaScript or logs.
    ...(nativeSession?{nativeHttpOnlyCookie:nativeSession.privateCookie}:{})}));
});
