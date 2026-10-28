// W56: thin adapter for the installed official mautrix-go Provisioning V3.
// Does not implement a Messenger protocol, store a Meta password, or send messages.
// The Matrix access token stays inside the native Windows backend.
import {randomBytes} from 'node:crypto';
import {assertOfficialMatrixPrincipal,ProviderAuthDenied} from './provisioning-auth.mjs';

const ROOT='http://127.0.0.1:29319/_matrix/provision/v3';
const ALLOWED=new Set(['messenger-lite','messenger-lite-android']);
const idValid=s=>typeof s==='string'&&/^[a-zA-Z0-9_.-]{1,110}$/.test(s);
const deny=(code,status=403)=>{throw new ProviderAuthDenied(code,status)};
function normalizeStep(step){
  if(!step||typeof step!=='object'||!['user_input','display_and_wait','complete','client_http','webauthn','cookies'].includes(step.type))
    deny('UNKNOWN_OFFICIAL_LOGIN_STEP',503);
  const common={type:step.type,instructions:typeof step.instructions==='string'?step.instructions.slice(0,800):'',
    stepId:typeof step.step_id==='string'?step.step_id.slice(0,110):null};
  if(step.type==='user_input'){
    const fields=step.user_input?.fields;
    if(!Array.isArray(fields)||fields.length>12)deny('INVALID_OFFICIAL_USER_INPUT_FIELDS',503);
    common.fields=fields.map(f=>{
      if(!idValid(f.id)||!['username','phone_number','email','password','2fa_code','token','url','domain','select'].includes(f.type))
        deny('INVALID_OFFICIAL_LOGIN_FIELD',503);
      return {id:f.id,type:f.type,name:String(f.name||f.id).slice(0,100),
        description:String(f.description||'').slice(0,300),
        options:Array.isArray(f.options)?f.options.filter(x=>typeof x==='string').slice(0,50):[]};
    });
  }
  if(step.type==='display_and_wait'){
    common.waitType=['qr','emoji','code','nothing'].includes(step.display_and_wait?.type)?
      step.display_and_wait.type:'nothing';
    // No invented Facebook QR. Only display upstream-provided data for a real supported step.
    if(common.waitType==='code'||common.waitType==='emoji')
      common.displayData=String(step.display_and_wait?.data||'').slice(0,400);
  }
  if(['cookies','client_http','webauthn'].includes(step.type))
    common.requiresOfficialManagerSupport=true;
  return common;
}
export function createOfficialMessengerLogin({getSession,fetchImpl=fetch,clock=Date.now}={}){
  if(typeof getSession!=='function')throw Error('PROTECTED_NATIVE_MATRIX_SESSION_REQUIRED');
  const active=new Map();
  const purged=()=>{for(const [key,value] of active)if(value.expiresAt<clock())active.delete(key)};
  async function scope(){
    const s=await getSession();
    if(!s||typeof s.token!=='string'||!s.token)deny('MATRIX_TECH_SESSION_NOT_READY',503);
    const principal=await assertOfficialMatrixPrincipal(s.token,{fetchImpl});
    if(principal!==s.principal)deny('MATRIX_TECH_PRINCIPAL_MISMATCH',503);
    return {token:s.token,principal};
  }
  async function call(session,path,method='GET',body){
    const url=new URL(ROOT+path);
    url.searchParams.set('user_id',session.principal);
    const response=await fetchImpl(url.toString(),{method,redirect:'error',
      signal:AbortSignal.timeout(12000),
      headers:{Authorization:'Bearer '+session.token,Accept:'application/json',
        ...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok)deny(response.status===401?'MATRIX_TECH_SESSION_EXPIRED':
      response.status===404?'OFFICIAL_LOGIN_PROCESS_NOT_FOUND':'UPSTREAM_LOGIN_STEP_FAILED',
      [401,404].includes(response.status)?response.status:503);
    const content=await response.text();
    if(content.length>40000)deny('OFFICIAL_LOGIN_REPLY_OVERSIZED',503);
    try{return JSON.parse(content)}catch{deny('INVALID_OFFICIAL_LOGIN_REPLY',503)}
  }
  async function flows(){
    const s=await scope(),reply=await call(s,'/login/flows');
    if(!Array.isArray(reply.flows))deny('OFFICIAL_LOGIN_FLOWS_UNAVAILABLE',503);
    return {flows:reply.flows.filter(f=>ALLOWED.has(f.id)).map(f=>({
      id:f.id,name:String(f.name||f.id).slice(0,90),
      description:String(f.description||'').slice(0,240)})),
      state:'WAITING_USER_AUTH',canSend:false};
  }
  async function start(flowId){
    // Ordinary users choose Messenger, not an underlying mobile protocol.
    // Prefer the already-verified upstream flow; use Android only if that
    // official flow is the one available. Never retry after bad credentials.
    if(flowId!==undefined&&!ALLOWED.has(flowId))
      deny('UNAPPROVED_MESSENGER_LOGIN_FLOW',403);
    const s=await scope(),available=await call(s,'/login/flows');
    const upstream=Array.isArray(available.flows)?available.flows:[];
    const selected=flowId??['messenger-lite','messenger-lite-android']
      .find(id=>upstream.some(f=>f.id===id));
    if(!ALLOWED.has(selected)||!upstream.some(f=>f.id===selected))
      deny('OFFICIAL_LOGIN_FLOW_NOT_AVAILABLE',503);
    const step=await call(s,'/login/start/'+encodeURIComponent(selected),'POST');
    if(!idValid(step.login_id)||!idValid(step.step_id)&&step.type!=='complete')
      deny('INVALID_OFFICIAL_LOGIN_PROCESS',503);
    purged();if(active.size>20)active.clear();
    const handle=randomBytes(24).toString('hex');
    if(step.type!=='complete')active.set(handle,{principal:s.principal,
      upstreamId:step.login_id,stepId:step.step_id,txnId:step.txn_id,
      type:step.type,flowId:selected,expiresAt:clock()+600000});
    return {handle:step.type==='complete'?null:handle,step:normalizeStep(step),
      state:'WAITING_USER_AUTH',canSend:false};
  }
  async function advance(handle,fields={}){
    purged();
    if(typeof handle!=='string'||!/^[a-f0-9]{48}$/.test(handle))deny('LOGIN_PROCESS_HANDLE_INVALID');
    const current=active.get(handle);
    if(!current)deny('LOGIN_PROCESS_EXPIRED_OR_MISSING',409);
    const s=await scope();
    if(s.principal!==current.principal)deny('MATRIX_LOGIN_PRINCIPAL_CHANGED',409);
    if(!['user_input','display_and_wait'].includes(current.type))
      deny('OFFICIAL_SPECIAL_LOGIN_STEP_REQUIRES_NATIVE_MANAGER',409);
    if(current.type==='user_input'){
      if(!fields||typeof fields!=='object'||Array.isArray(fields)||
        Object.keys(fields).length>12||Object.values(fields).some(v=>typeof v!=='string'||v.length>4096))
        deny('INVALID_MESSENGER_INPUT',422);
    }
    const mode=current.type;
    const route='/login/step/'+encodeURIComponent(current.upstreamId)+'/'+
      encodeURIComponent(current.stepId)+'/'+mode;
    const url=route+(current.txnId?'?txn_id='+encodeURIComponent(current.txnId):'');
    active.delete(handle); // one-shot: no replay even if upstream fails
    const step=await call(s,url,'POST',mode==='user_input'?fields:undefined);
    if(step.type!=='complete'){
      if(!idValid(step.step_id))deny('INVALID_OFFICIAL_NEXT_STEP',503);
      active.set(handle,{...current,stepId:step.step_id,txnId:step.txn_id,
        type:step.type,expiresAt:clock()+600000});
    }
    return {handle:step.type==='complete'?null:handle,step:normalizeStep(step),
      state:step.type==='complete'?'UPSTREAM_LOGIN_COMPLETED_W24_BINDING_PENDING':'WAITING_USER_AUTH',
      canSend:false};
  }
  return {flows,start,advance,clear:()=>active.clear()};
}
