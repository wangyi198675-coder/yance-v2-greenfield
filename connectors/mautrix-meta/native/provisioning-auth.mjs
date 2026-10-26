/**
 * W26 thin bridgev2 provisioning v3 adapter, source:
 * mautrix/go v0.32.0 bridgev2/matrix/provisioning.yaml.
 * W26 never performs Messenger authentication and never stores Matrix tokens.
 * The official mautrix-manager GUI owns the interactive login steps.
 * A Matrix user access token must be authenticated with Tuwunel first.
 */
const MATRIX='http://127.0.0.1:28438';
const BRIDGE='http://127.0.0.1:29319';
const EXPECTED_BOT='@facebookbot:yance-w26.invalid';
const STATES=new Set(['CONNECTING','CONNECTED','TRANSIENT_DISCONNECT','BAD_CREDENTIALS','UNKNOWN_ERROR']);
export class ProviderAuthDenied extends Error {
  constructor(code,status=403){super(code);this.code=code;this.status=status;}
}
function deny(code,status){throw new ProviderAuthDenied(code,status);}
function safeString(x){return typeof x==='string'?x.slice(0,180):null;}
async function jsonRequest(target,token,{method='GET',fetchImpl=fetch}={}){
  const r=await fetchImpl(target,{method,redirect:'error',signal:AbortSignal.timeout(5500),
    headers:{Authorization:`Bearer ${token}`,Accept:'application/json',
      ...(method==='POST'?{'Content-Type':'application/json'}:{})}});
  if(!r.ok)deny(r.status===401?'MATRIX_AUTH_REQUIRED':
    r.status===403?'BRIDGE_ACCESS_DENIED':
      r.status===404?'NATIVE_PROVIDER_ROUTE_NOT_FOUND':'UPSTREAM_UNAVAILABLE',
    [401,403,404].includes(r.status)?r.status:503);
  return r.json().catch(()=>deny('INVALID_NATIVE_PROVIDER_REPLY',503));
}
export async function assertOfficialMatrixPrincipal(token,{fetchImpl=fetch}={}){
  if(typeof token!=='string'||!token||token.length>4096||/[\r\n\s]/.test(token))
    deny('MATRIX_AUTH_REQUIRED',401);
  const reply=await jsonRequest(MATRIX+'/_matrix/client/v3/account/whoami',token,{fetchImpl});
  const principal=safeString(reply?.user_id);
  if(!principal?.startsWith('@') || !principal.endsWith(':yance-w26.invalid')
    || principal===EXPECTED_BOT)deny('INVALID_MATRIX_PRINCIPAL');
  return principal;
}
function normalizeLogin(l){
  const id=safeString(l?.id);
  const name=safeString(l?.name);
  const state=STATES.has(l?.state?.state_event)?l.state.state_event:'NOT_CONNECTED';
  if(!id)deny('INVALID_NATIVE_ACCOUNT_IDENTIFIER',503);
  return Object.freeze({loginId:id,displayName:name,bridgeState:state,
    providerConnected:state==='CONNECTED',
    upstreamIdentitySource:'OFFICIAL_MAUTRIX_META_V3',
    w24BindingVerified:false,canSend:false});
}
export async function readNativeAccountStatus(token,{fetchImpl=fetch}={}){
  const principal=await assertOfficialMatrixPrincipal(token,{fetchImpl});
  const reply=await jsonRequest(BRIDGE+'/_matrix/provision/v3/whoami',token,{fetchImpl});
  if(reply?.bridge_bot!==EXPECTED_BOT || !Array.isArray(reply?.logins))
    deny('PROVISIONING_BRIDGE_IDENTITY_MISMATCH',503);
  const logins=reply.logins.map(normalizeLogin);
  return Object.freeze({channel:'FB_PERSONAL',matrixPrincipal:principal,
    bridgeBot:EXPECTED_BOT,realAccountState:logins.length===0?'WAITING_USER_AUTH':
      logins.some(l=>l.providerConnected)?'UPSTREAM_CONNECTED_W24_BINDING_PENDING':'UPSTREAM_NOT_CONNECTED',
    logins,connectedCount:logins.filter(x=>x.providerConnected).length,
    accountCount:logins.length,canSend:false,autoReply:false,
    w24ChannelAccountBindingVerified:false,
    source:'REAL_BRIDGE_V3_PROVISIONING_AUTHENTICATED'});
}
export async function readNativeLoginFlows(token,{fetchImpl=fetch}={}){
  const status=await readNativeAccountStatus(token,{fetchImpl});
  const reply=await jsonRequest(BRIDGE+'/_matrix/provision/v3/login/flows',token,{fetchImpl});
  if(!Array.isArray(reply.flows))deny('INVALID_NATIVE_LOGIN_FLOWS',503);
  const permitted=new Set(['facebook','messenger','messenger-lite','messenger-lite-android']);
  return Object.freeze({matrixPrincipal:status.matrixPrincipal,
    channel:'FB_PERSONAL',
    flows:reply.flows.filter(f=>permitted.has(f.id)).map(f=>({id:f.id,
      name:safeString(f.name),description:safeString(f.description)})),
    actualStartImplementedBy:'MAUTRIX_MANAGER_OFFICIAL_PROVISIONING_V3',
    userMustChooseFlow:true,canSend:false});
}
/** Logout is a destructive Meta session revocation. It requires a user intent,
 * an authenticated owner-specific login ID and an exact explicit confirmation.
 * It never sends a message, accesses W25 or performs social login.
 */
export async function revokeNativeLogin(token,loginID,{confirmLoginID,explicitUserAction,
  authorizeDurableRevocation,fetchImpl=fetch}={}){
  if(explicitUserAction!=='REVOKE_THIS_FACEBOOK_LOGIN'||loginID==='all'
    ||typeof loginID!=='string'||!loginID||loginID.length>120
    ||confirmLoginID!==loginID)deny('EXPLICIT_ACCOUNT_REVOCATION_REQUIRED',409);
  const current=await readNativeAccountStatus(token,{fetchImpl});
  if(!current.logins.some(l=>l.loginId===loginID))deny('LOGIN_NOT_OWNED_BY_PRINCIPAL',404);
  // W24/W44 must first commit the single durable account/peer revocation.
  // Never leave a Provider-only logout with old W24 grants eligible to send.
  if(typeof authorizeDurableRevocation!=='function')deny('W24_DURABLE_REVOCATION_FENCE_REQUIRED',503);
  const authority=await authorizeDurableRevocation({principal:current.matrixPrincipal,loginId:loginID});
  if(authority?.committed!==true||!Number.isSafeInteger(authority.accountRevocationEpoch)
    ||authority.accountRevocationEpoch<1)deny('W24_DURABLE_REVOCATION_NOT_COMMITTED',409);
  await jsonRequest(BRIDGE+'/_matrix/provision/v3/logout/'+encodeURIComponent(loginID),
    token,{method:'POST',fetchImpl});
  const after=await readNativeAccountStatus(token,{fetchImpl});
  if(after.logins.some(l=>l.loginId===loginID))deny('LOGOUT_POST_VERIFY_FAILED',503);
  return Object.freeze({revoked:true,provider:'mautrix-meta',
    realAccountState:after.realAccountState,loginId:loginID,
    accountCount:after.accountCount,canSend:false,
    w24AccountRevocationEpochUpdated:true,
    accountRevocationEpoch:authority.accountRevocationEpoch});
}
export const NATIVE_AUTH_ACTIONS=Object.freeze({
  bridgeURL:BRIDGE, homeserverURL:MATRIX,
  managerSchemeURL:'mautrix-manager://open/',
  managerExecutable:'%LOCALAPPDATA%\\mautrix_manager\\mautrix-manager.exe',
  supportedLoginUI:'OFFICIAL_MAUTRIX_MANAGER',
  credentialHandling:'OFFICIAL_MANAGER_AND_BRIDGE_ONLY',
  loginRequiresUserClick:true,
  reconnection:'USER_CLICK_LOGOUT_THEN_OFFICIAL_MANAGER_LOGIN',
  // No QR protocol exists for this Facebook Messenger integration.
  qrFlowSupported:false,
});
