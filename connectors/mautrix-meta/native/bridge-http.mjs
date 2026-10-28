/**
 * W26 channel-scoped 127.0.0.1 only owner API.
 * Public setup/status reveal NO real account info. Matrix access tokens are
 * accepted only for authenticated upstream Provisioning v3 reads/revocation.
 * The installed official BridgeV2 Provisioning V3 performs Facebook login steps;
 * W56 only exposes its actual step DTOs through a localhost user interface.
 * W47 remains the sole first-party API authority for product UI integration.
 */
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectRealBridge} from './bridge-runtime.mjs';
import {createOfficialMessengerLogin} from './official-messenger-login.mjs';
import {joinOfficialFacebookInvites} from './official-room-autojoin.mjs';
import {readOfficialFacebookInbox,readOfficialFacebookMessages} from './official-matrix-inbox.mjs';
import {getProtectedNativeMatrixSession} from './native-matrix-session.mjs';
import {launchInstalledOfficialManager} from './native-manager-launch.mjs';
import {readNativeAccountStatus,readNativeLoginFlows,readNativePeerHints,revokeNativeLogin,
  ProviderAuthDenied,NATIVE_AUTH_ACTIONS} from './provisioning-auth.mjs';
const HOST='127.0.0.1',PORT=29321;
const BASE='/api/v2/providers/fb-personal';
const AUTH_ENTRY_HTML=readFileSync(new URL('./auth-entry.html',import.meta.url),'utf8');
const NATIVE_LOGIN_JS=readFileSync(new URL('./native-login-ui.mjs',import.meta.url),'utf8');
const jsonHeaders={'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store','x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer',
  'content-security-policy':"default-src 'none'; base-uri 'none'; form-action 'none'",
  'x-frame-options':'DENY'};
function send(res,code,obj){
  res.writeHead(code,jsonHeaders);res.end(JSON.stringify(obj));
}
function sendAuthPage(res,ticket){
  res.writeHead(200,{...jsonHeaders,'content-type':'text/html; charset=utf-8',
    // Native same-origin POST needs a verifiable Origin on Chromium/Opera.
    // "no-referrer" causes a null Origin on privacy-preserving browsers;
    // same-origin still prevents referrer disclosure to external websites.
    'referrer-policy':'same-origin',
    'content-security-policy':"default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'"});
  res.end(AUTH_ENTRY_HTML.replace('__W26_LAUNCH_TICKET__',ticket));
}
function sendLaunchResult(res,result){
  const started=result?.launched===true,foreground=result?.foregroundVerified===true;
  const title=started?'Facebook 网页登录窗口已打开':'Facebook 网页登录助手启动失败';
  const detail=foreground?'请在已打开的官方管理器中点击 Facebook Messenger，再选择 facebook.com，通过弹出的 Facebook 网页完成本人授权。':
    started?'网页登录助手已启动，请在任务栏打开 mautrix-manager，点击 Facebook Messenger，然后选择 facebook.com。':
      '官方网页登录助手没有启动，请返回连接页面重试。';
  res.writeHead(started?200:503,{...jsonHeaders,'content-type':'text/html; charset=utf-8',
    'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"});
  res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>'+title+
    '</title><body style="font:16px system-ui;margin:3rem auto;max-width:650px">'+
    '<h1>'+title+'</h1><p>'+detail+'</p><p>账号状态：WAITING_USER_AUTH。没有真人消息发送。</p>'+
    '<a href="/api/v2/providers/fb-personal/connect">返回授权步骤</a></body></html>');
}
async function readLaunchTicket(req){
  if(req.headers['content-type']?.split(';')[0]!=='application/x-www-form-urlencoded')
    throw new ProviderAuthDenied('BAD_LAUNCH_FORM',415);
  let body='',count=0;
  for await (const chunk of req){count+=chunk.length;
    if(count>256)throw new ProviderAuthDenied('LAUNCH_FORM_TOO_LARGE',413);
    body+=chunk.toString('utf8');
  }
  const pairs=[...new URLSearchParams(body)];
  if(pairs.length!==1||pairs[0][0]!=='ticket'||!/^[a-f0-9]{48}$/.test(pairs[0][1]))
    throw new ProviderAuthDenied('EXPLICIT_LAUNCH_TICKET_REQUIRED',403);
  return pairs[0][1];
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
async function boundedLoginJSON(req){
  if(req.headers['content-type']?.split(';')[0]!=='application/json')
    throw new ProviderAuthDenied('LOGIN_JSON_REQUIRED',415);
  let body='',size=0;
  for await(const chunk of req){size+=chunk.length;
    if(size>16000)throw new ProviderAuthDenied('LOGIN_INPUT_OVERSIZED',413);
    body+=chunk.toString('utf8');}
  try {const parsed=JSON.parse(body);
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();
    return parsed;
  }catch{throw new ProviderAuthDenied('INVALID_LOGIN_JSON',422)}
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
  provider={readNativeAccountStatus,readNativeLoginFlows,readNativePeerHints,revokeNativeLogin},
  installed=managerInstalled,launcher=launchInstalledOfficialManager,
  officialLogin=createOfficialMessengerLogin({getSession:getProtectedNativeMatrixSession})}={}){
  const launchTickets=new Map();
  return createServer(async(req,res)=>{
    const h=req.headers.host;
    if(!['127.0.0.1:'+port,'localhost:'+port].includes(h))
      return send(res,403,{ok:false,error:'LOCAL_ONLY_HOST_REQUIRED'});
    // Never accept cross-origin browser initiations, not even with bearer tokens.
    if(req.headers.origin && req.headers.origin!=='http://'+h)
      return send(res,403,{ok:false,error:'CROSS_ORIGIN_ACTION_FORBIDDEN'});
    try{
      const url=new URL(req.url||'/', 'http://127.0.0.1:'+port);
      // W47's existing authenticated same-origin app API is the public UI
      // boundary. This 29321 private bridge read is only for local Node fetch.
      if(req.method==='GET'&&[BASE+'/inbox',BASE+'/inbox/messages'].includes(url.pathname)){
        if(req.headers.origin||req.headers['sec-fetch-site'])
          return send(res,403,{ok:false,error:'NATIVE_SERVER_READ_ONLY'});
        if(url.pathname===BASE+'/inbox'&&!url.search)
          return send(res,200,await readOfficialFacebookInbox());
        if(url.pathname===BASE+'/inbox/messages'&&url.searchParams.size===1&&
           url.searchParams.getAll('room').length===1)
          return send(res,200,await readOfficialFacebookMessages(url.searchParams.get('room')));
        return send(res,422,{ok:false,error:'INVALID_INBOX_SELECTOR'});
      }
      if(url.search){
        // ChatGPT can append ordinary UTM attribution to user-clicked local
        // links. Strip ONLY harmless tracking parameters on public GET pages.
        // Never pass them to login, token-bearing, revoke or state-changing APIs.
        const publicEntry=req.method==='GET'&&
          [BASE+'/connect',BASE+'/setup',BASE+'/authorize'].includes(url.pathname);
        const pairs=[...url.searchParams.entries()];
        const harmless=publicEntry&&pairs.length>0&&pairs.length<=5&&
          pairs.every(([key,value])=>/^utm_(source|medium|campaign|term|content)$/.test(key)
            &&value.length<=120);
        if(harmless){
          res.writeHead(302,{...jsonHeaders,location:url.pathname});
          return res.end();
        }
        return send(res,422,{ok:false,error:'NO_QUERY_INPUT'});
      }
      if(req.method!=='GET'&&!(req.method==='POST'&&
        [BASE+'/auth/revoke',BASE+'/launch-manager',BASE+'/native-login/flows',
          BASE+'/native-login/start',BASE+'/native-login/step'].includes(url.pathname)))
        return send(res,403,{ok:false,error:'NO_UNAPPROVED_PROVIDER_ACTION'});
      if(req.method==='GET'&&url.pathname===BASE+'/native-login-ui.mjs'){
        res.writeHead(200,{...jsonHeaders,'content-type':'text/javascript; charset=utf-8'});
        return res.end(NATIVE_LOGIN_JS);
      }
      if(req.method==='POST'&&url.pathname.startsWith(BASE+'/native-login/')){
        if(req.headers.origin!=='http://'+h||
          (req.headers['sec-fetch-site']&&req.headers['sec-fetch-site']!=='same-origin'))
          return send(res,403,{ok:false,error:'LOCAL_USER_GESTURE_REQUIRED'});
        const ticket=req.headers['x-yance-native-login-ticket'];
        if(typeof ticket!=='string'||!/^[a-f0-9]{48}$/.test(ticket)||
          (launchTickets.get(ticket)||0)<=Date.now())
          return send(res,403,{ok:false,error:'NATIVE_LOGIN_TICKET_INVALID'});
        const body=await boundedLoginJSON(req);
        if(url.pathname===BASE+'/native-login/flows')
          return send(res,200,{ok:true,...await officialLogin.flows()});
        if(url.pathname===BASE+'/native-login/start')
          return send(res,200,{ok:true,...await officialLogin.start(body.flowId)});
        if(url.pathname===BASE+'/native-login/step')
          return send(res,200,{ok:true,...await officialLogin.advance(body.handle,body.fields)});
        return send(res,404,{ok:false,error:'UNKNOWN_NATIVE_LOGIN_OPERATION'});
      }
      if(req.method==='GET'&&url.pathname===BASE+'/connect'){
        const now=Date.now();
        for(const [ticket,expiry] of launchTickets)if(expiry<=now)launchTickets.delete(ticket);
        if(launchTickets.size>60)launchTickets.clear();
        const ticket=randomBytes(24).toString('hex');
        launchTickets.set(ticket,now+1800000);
        return sendAuthPage(res,ticket);
      }
      if(req.method==='POST'&&url.pathname===BASE+'/launch-manager'){
        // A user must load the local page and explicitly press the form button.
        // This route never authenticates with Meta or manipulates account tokens.
        if(req.headers.origin!=='http://'+h ||
           (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site']!=='same-origin'))
          return send(res,403,{ok:false,error:'LOCAL_USER_GESTURE_REQUIRED'});
        const ticket=await readLaunchTicket(req);
        const validUntil=launchTickets.get(ticket);
        launchTickets.delete(ticket);
        if(!validUntil||validUntil<=Date.now())
          return send(res,403,{ok:false,error:'LAUNCH_TICKET_INVALID_OR_USED'});
        if(!installed())return send(res,503,{ok:false,error:'OFFICIAL_MANAGER_NOT_INSTALLED'});
        try{
          const result=await launcher();
          return sendLaunchResult(res,result);
        }catch{return sendLaunchResult(res,{launched:false});}
      }
      if(req.method==='GET'&&url.pathname===BASE+'/status'){
        // A real BridgeV2 login is NOT a W24 application-account binding.
        // Read only a boolean from a trusted, DPAPI-protected Matrix session.
        // Never expose the user ID, login ID, token, or provider profile.
        let nativeProviderSessionConnected=false;
        try{
          const session=await getProtectedNativeMatrixSession();
          const actual=await provider.readNativeAccountStatus(session.token);
          nativeProviderSessionConnected=actual?.source===
            'REAL_BRIDGE_V3_PROVISIONING_AUTHENTICATED'&&
            actual.connectedCount>0&&
            actual.realAccountState==='UPSTREAM_CONNECTED_W24_BINDING_PENDING';
        }catch{}
        return send(res,200,{ok:true,...await probe(),
          nativeProviderSessionConnected,canSend:false});
      }
      if(req.method==='GET'&&(url.pathname===BASE+'/setup' ||
         url.pathname===BASE+'/authorize')){
        const state=await probe();
        let upstreamFlows=[];
        try{upstreamFlows=(await officialLogin.flows()).flows||[]}catch{}
        const ready=state.bridgeBotProfileVerified===true&&upstreamFlows.length>0;
        return send(res,200,{channel:'FB_PERSONAL',origin:'OFFICIAL_MAUTRIX_META',
          currentBridgeState:state.bridgeState,realAccountState:'WAITING_USER_AUTH',
          sdkInstalled:state.binaryIntegrity==='OFFICIAL_SHA_VERIFIED',
          officialBridgeRunning:state.bridgeBotProfileVerified===true,
          action:ready?'OPEN_NATIVE_MESSENGER_LOGIN':'INTERNAL_SETUP_PENDING',
          nativeLoginStepReady:ready,
          clickableAuthorizationURL:'http://127.0.0.1:'+port+BASE+'/connect',
          officialLoginFlows:upstreamFlows.map(f=>f.id),
          nextUserAction:ready?'OPEN_MESSENGER_LOGIN':'WAIT_FOR_INTERNAL_SERVICE',
          canSend:false,autoReply:false});
      }
      if(req.method==='GET'&&url.pathname===BASE+'/account/status'){
        const account=await provider.readNativeAccountStatus(auth(req));
        return send(res,200,{ok:true,...account});
      }
      if(req.method==='GET'&&url.pathname===BASE+'/peer/hints'){
        const hints=await provider.readNativePeerHints(auth(req));
        return send(res,200,{ok:true,...hints});
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
        providerLoginManagedBy:'MAUTRIX_BRIDGEV2_PROVISIONING_V3',bridge:await probe()});
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
  // Recover only provider-bot-verified Matrix room invitations. This is a
  // local Matrix membership action, never an outbound Facebook message.
  let checking=false;
  const checkInvites=async()=>{
    if(checking)return;
    checking=true;
    try {await joinOfficialFacebookInvites()}catch { /* no implicit login retries */ }
    finally {checking=false}
  };
  const timer=setInterval(checkInvites,15000);
  timer.unref();
  void checkInvites();
}
