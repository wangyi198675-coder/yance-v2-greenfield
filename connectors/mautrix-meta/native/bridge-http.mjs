/**
 * W26 channel-scoped 127.0.0.1 only owner API.
 * Public setup/status reveal NO real account info. Matrix access tokens are
 * accepted only for authenticated upstream Provisioning v3 reads/revocation.
 * The official mautrix-manager app, not W26, performs all Facebook login steps.
 * W47 remains the sole first-party API authority for product UI integration.
 */
import {createServer} from 'node:http';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectRealBridge} from './bridge-runtime.mjs';
import {readNativeAccountStatus,readNativeLoginFlows,revokeNativeLogin,
  ProviderAuthDenied,NATIVE_AUTH_ACTIONS} from './provisioning-auth.mjs';
const HOST='127.0.0.1',PORT=29321;
const BASE='/api/v2/providers/fb-personal';
const AUTH_ENTRY_HTML=readFileSync(new URL('./auth-entry.html',import.meta.url),'utf8');
const jsonHeaders={'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store','x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer',
  'content-security-policy':"default-src 'none'; base-uri 'none'; form-action 'none'",
  'x-frame-options':'DENY'};
function send(res,code,obj){
  res.writeHead(code,jsonHeaders);res.end(JSON.stringify(obj));
}
function sendAuthPage(res){
  res.writeHead(200,{...jsonHeaders,'content-type':'text/html; charset=utf-8',
    'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"});
  res.end(AUTH_ENTRY_HTML);
}
function managerInstalled(){
  const local=process.env.LOCALAPPDATA;
  return Boolean(local&&existsSync(join(local,'mautrix_manager','mautrix-manager.exe')));
}
function auth(req){
  const v=req.headers.authorization;
  if(typeof v!=='string'||!v.startsWith('Bearer ')||v.length>4150)
    throw new ProviderAuthDenied('MATRIX_AUTH_REQUIRED',401);
  return v.slice(7);
}
async function boundedJSON(req) {
  let bytes=0,text='';
  for await(const c of req){
    bytes+=c.length;
    if(bytes>1400)throw new ProviderAuthDenied('INPUT_TOO_LARGE',413);
    text+=c.toString('utf8');
  }
  try{const v=JSON.parse(text);if(!v||typeof v!=='object'||Array.isArray(v))throw Error();
    return v;}catch{throw new ProviderAuthDenied('INVALID_JSON',422);}
}
export function createBridgeStatusServer({probe=inspectRealBridge,port=PORT,
  provider={readNativeAccountStatus,readNativeLoginFlows,revokeNativeLogin},
  installed=managerInstalled}={}){
  return createServer(async(req,res)=>{
    const h=req.headers.host;
    if(!['127.0.0.1:'+port,'localhost:'+port].includes(h))
      return send(res,403,{ok:false,error:'LOCAL_ONLY_HOST_REQUIRED'});
    // Never accept cross-origin browser initiations, not even with bearer tokens.
    if(req.headers.origin && req.headers.origin!=='http://127.0.0.1:'+port)
      return send(res,403,{ok:false,error:'CROSS_ORIGIN_ACTION_FORBIDDEN'});
    try{
      const url=new URL(req.url||'/', 'http://127.0.0.1:'+port);
      if(url.search)return send(res,422,{ok:false,error:'NO_QUERY_INPUT'});
      if(req.method!=='GET'&&!(req.method==='POST'&&url.pathname===BASE+'/auth/revoke'))
        return send(res,403,{ok:false,error:'NO_UNAPPROVED_PROVIDER_ACTION'});
      if(req.method==='GET'&&url.pathname===BASE+'/connect')return sendAuthPage(res);
      if(req.method==='GET'&&url.pathname===BASE+'/status')
        return send(res,200,{ok:true,...await probe()});
      if(req.method==='GET'&&(url.pathname===BASE+'/setup' ||
         url.pathname===BASE+'/authorize')){
        const state=await probe(),hasManager=installed();
        return send(res,200,{channel:'FB_PERSONAL',origin:'OFFICIAL_MAUTRIX_META',
          currentBridgeState:state.bridgeState,
          authorizedSocialAccount:'MATRIX_AUTH_REQUIRED',realAccountState:'WAITING_USER_AUTH',
          sdkInstalled:state.binaryIntegrity==='OFFICIAL_SHA_VERIFIED',
          officialBridgeRunning:state.bridgeBotProfileVerified===true,
          officialManagerInstalled:hasManager,
          action:hasManager&&state.bridgeBotProfileVerified?'OPEN_NATIVE_MANAGER':
             'INSTALL_OR_INITIALIZE_OFFICIAL_MATRIX_MANAGER',
          nextUserClick:hasManager?NATIVE_AUTH_ACTIONS.managerSchemeURL:null,
          clickableAuthorizationURL:'http://127.0.0.1:'+port+BASE+'/connect',
          nativeManager:NATIVE_AUTH_ACTIONS,
          serverSetupPhase:'MATRIX_OPERATOR_SESSION_REQUIRED_FOR_MANAGER_LOGIN',
          officialLoginFlows:['facebook','messenger','messenger-lite','messenger-lite-android'],
          officialSetup:'https://docs.mau.fi/bridges/go/setup.html?bridge=meta',
          officialAuthentication:'https://docs.mau.fi/bridges/go/meta/authentication.html',
          nextUserAction:['Open installed official mautrix-manager using the nextUserClick protocol link.',
            'Sign in to the local Matrix homeserver as the user who owns this install.',
            'Add the existing running bridge URL from nativeManager.bridgeURL and select the real official Messenger login flow.',
            'Only after user authorization, W24/W44 bind the verified Facebook account and peers.'],
          canSend:false,autoReply:false});
      }
      if(req.method==='GET'&&url.pathname===BASE+'/account/status'){
        const account=await provider.readNativeAccountStatus(auth(req));
        return send(res,200,{ok:true,...account});
      }
      if(req.method==='GET'&&url.pathname===BASE+'/auth/flows'){
        const flows=await provider.readNativeLoginFlows(auth(req));
        return send(res,200,{ok:true,...flows});
      }
      if(req.method==='POST'&&url.pathname===BASE+'/auth/revoke'){
        if(req.headers['x-yance-user-intent']!=='REVOKE_THIS_FACEBOOK_LOGIN')
          return send(res,409,{ok:false,error:'EXPLICIT_ACCOUNT_REVOCATION_REQUIRED'});
        const token=auth(req),body=await boundedJSON(req);
        const result=await provider.revokeNativeLogin(token,body.loginId,{
          confirmLoginID:body.confirmLoginId,
          explicitUserAction:req.headers['x-yance-user-intent']});
        return send(res,200,{ok:true,...result});
      }
      if(req.method==='GET'&&url.pathname==='/health')return send(res,200,{
        ok:true,channel:'FB_PERSONAL',dataSource:'REAL_WSL_OFFICIAL_UPSTREAM',
        providerLoginManagedBy:'MAUTRIX_MANAGER',bridge:await probe()});
      return send(res,404,{ok:false,error:'NOT_FOUND'});
    }catch(e){
      if(e instanceof ProviderAuthDenied)return send(res,e.status,{ok:false,error:e.code,
        canSend:false});
      return send(res,503,{ok:false,error:'REAL_PROVIDER_SERVICE_UNAVAILABLE',
        canSend:false});
    }
  });
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  const s=createBridgeStatusServer();
  s.listen(PORT,HOST,()=>process.stdout.write('W26 genuine bridge owner API http://'+HOST+':'+PORT+'\n'));
}
