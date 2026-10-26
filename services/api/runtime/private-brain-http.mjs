// W47 server HTTP boundary for the one existing W43 Agno PRIVATE brain.
// No new Agent, model, history database or client-provided Principal.
// Intentionally disabled in production until W43 signs REAL_PRIVATE_SCOPE and
// W54 supplies its current-user AppData-root profile authority.
import {randomUUID,timingSafeEqual} from 'node:crypto';

const MAX_BYTES=16*1024;
const deny=(res,status,error)=>send(res,status,{ok:false,error,canSend:false,externalEffects:false});
const send=(res,status,obj)=>{
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
    'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer',
    'cross-origin-resource-policy':'same-origin','vary':'Origin, Sec-Fetch-Site'});
  res.end(JSON.stringify(obj));
};
const csrfMatches=(req,session)=>{
  const submitted=req.headers['x-yance-csrf'];
  const expected=session?.record?.csrf;
  return typeof submitted==='string'&&typeof expected==='string'&&
    /^[a-f0-9]{64}$/.test(submitted)&&/^[a-f0-9]{64}$/.test(expected)&&
    timingSafeEqual(Buffer.from(submitted),Buffer.from(expected));
};
const validThread=t=>typeof t==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(t);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
async function jsonBody(req){
  if(req.headers['content-type']!=='application/json')
    throw Object.assign(Error('JSON_REQUIRED'),{status:415});
  if(req.headers['content-length']&&Number(req.headers['content-length'])>MAX_BYTES)
    throw Object.assign(Error('BODY_TOO_LARGE'),{status:413});
  const chunks=[];let bytes=0;
  for await(const chunk of req){
    bytes+=chunk.length;
    if(bytes>MAX_BYTES)throw Object.assign(Error('BODY_TOO_LARGE'),{status:413});
    chunks.push(chunk);
  }
  let data;
  try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'))}
  catch{throw Object.assign(Error('INVALID_JSON'),{status:422})}
  if(!data||typeof data!=='object'||Array.isArray(data))
    throw Object.assign(Error('JSON_OBJECT_REQUIRED'),{status:422});
  return data;
}
function verifiedProfile(p){
  // This object can ONLY be issued by an explicitly injected server-owned
  // W54 current-user profile authority (not by request or browser fields).
  // The source implementation is not yet available. Return no data otherwise.
  return p&&p.source==='W54_NATIVE_CURRENT_USER'&&p.verified===true&&
    typeof p.profileRef==='string'&&/^[A-Za-z0-9._-]{12,128}$/.test(p.profileRef)&&
    typeof p.appDataRef==='string'&&p.appDataRef.length>0&&p.appDataRef.length<=256;
}
function trustedRun(r){
  return r&&r.status==='AGNO_RUN_COMPLETED'&&r.outbound==='DISABLED'&&
    typeof r.original_response==='string'&&r.original_response.trim().length>0&&
    r.original_response.length<=128000&&
    typeof r.run_id==='string'&&r.run_id.length>=6&&r.run_id.length<=256&&
    typeof r.session_id==='string'&&r.session_id.length>=6&&r.session_id.length<=256&&
    r.provenance?.type==='AGNO_RUN_RESULT'&&r.provenance.sdk_pin==='3.1.10'&&
    r.provenance.run_id===r.run_id&&r.provenance.session_id===r.session_id;
}
function nativeHistory(h){
  return h&&['HISTORY_PRESENT','HISTORY_EMPTY','HISTORY_NOT_FOUND'].includes(h.status)&&
    Array.isArray(h.messages)&&h.messages.length<=2000&&
    Number.isSafeInteger(h.run_count)&&h.run_count>=0&&
    Number.isSafeInteger(h.complete_turn_count)&&h.complete_turn_count>=0&&
    h.messages.every(m=>m&&['user','assistant','tool'].includes(m.role)&&
      typeof m.content==='string'&&m.content.length<=128000);
}
/**
 * Only original W43 owner may provide agnoBridge={runPrivateTurn,readNativeHistory}
 * after real-user Scope and W54-owned DB path, isolation and cold-restoration
 * are signed. No fixture or synthetic-only bridge is installed in server.mjs.
 */
export function createPrivateBrainHttp({
  sessionAuthority,webOrigin,
  resolveNativeProfile=null,agnoBridge=null
}={}){
  if(!sessionAuthority?.sessionFor||typeof webOrigin!=='string')
    throw Error('PRIVATE_BRAIN_SESSION_AND_ORIGIN_REQUIRED');
  if(resolveNativeProfile!==null&&typeof resolveNativeProfile!=='function')
    throw Error('PRIVATE_BRAIN_NATIVE_PROFILE_PORT_INVALID');
  if(agnoBridge!==null&&(!agnoBridge.runPrivateTurn||!agnoBridge.readNativeHistory))
    throw Error('PRIVATE_BRAIN_W43_PORT_INVALID');
  return async function handle(req,res,url){
    const action=url.pathname;
    if(!['/api/v2/private-brain/turn','/api/v2/private-brain/history'].includes(action))
      return false;
    const turn=action.endsWith('/turn');
    if((turn&&req.method!=='POST')||(!turn&&req.method!=='GET')){
      deny(res,405,'METHOD_NOT_ALLOWED');return true;
    }
    // Authorization precedes all PRIVATE input parsing and all W43 operations.
    const session=sessionAuthority.sessionFor(req);
    if(!session){deny(res,401,'LOCAL_SESSION_REQUIRED');return true}
    if(req.headers.origin&&req.headers.origin!==webOrigin){
      deny(res,403,'PRIVATE_BRAIN_ORIGIN_NOT_ALLOWED');return true
    }
    if(turn&&req.headers.origin!==webOrigin){
      deny(res,403,'PRIVATE_BRAIN_ORIGIN_REQUIRED');return true
    }
    if(turn&&!csrfMatches(req,session)){
      deny(res,403,'LOCAL_SESSION_CSRF_REQUIRED');return true
    }
    let thread='personal',message=null;
    if(turn){
      let body;
      try{body=await jsonBody(req)}
      catch(e){deny(res,e.status||422,e.message||'INVALID_INPUT');return true}
      const keys=Object.keys(body);
      if(keys.some(k=>!['thread','message'].includes(k))||
         !own(body,'message')||!validThread(body.thread??'personal')||
         typeof body.message!=='string'||body.message.trim().length<1||
         body.message.length>4000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body.message)){
        deny(res,422,'PRIVATE_TURN_INPUT_INVALID');return true
      }
      thread=body.thread??'personal';message=body.message;
    }else{
      for(const key of url.searchParams.keys()){
        if(key!=='thread'||url.searchParams.getAll(key).length!==1){
          deny(res,422,'PRIVATE_HISTORY_QUERY_INVALID');return true
        }
      }
      thread=url.searchParams.get('thread')??'personal';
      if(!validThread(thread)){deny(res,422,'PRIVATE_HISTORY_THREAD_INVALID');return true}
    }
    if(!resolveNativeProfile){
      deny(res,503,'W54_CURRENT_USER_APPDATA_BINDING_NOT_READY');return true
    }
    if(!agnoBridge){
      deny(res,503,'W43_REAL_PRIVATE_SCOPE_ADAPTER_NOT_READY');return true
    }
    let profile;
    try{profile=await resolveNativeProfile()}catch{
      deny(res,503,'W54_CURRENT_USER_APPDATA_UNAVAILABLE');return true
    }
    if(!verifiedProfile(profile)){
      deny(res,503,'W54_CURRENT_USER_APPDATA_UNVERIFIED');return true
    }
    const args={profile,thread,...(turn?{message,requestId:randomUUID()}:{})};
    let result;
    try{
      result=turn?await agnoBridge.runPrivateTurn(args):await agnoBridge.readNativeHistory(args);
    }catch{
      deny(res,503,'W43_NATIVE_PRIVATE_AGNO_UNAVAILABLE');return true
    }
    // The Session may be revoked while Agno is running: never return the result.
    const after=sessionAuthority.sessionFor(req);
    if(!after||after.id!==session.id){
      deny(res,401,'LOCAL_SESSION_REVOKED_DURING_RUN');return true
    }
    if(turn){
      if(!trustedRun(result)){
        deny(res,503,'W43_NATIVE_AGNO_COMPLETED_RUN_UNVERIFIED');return true
      }
      send(res,200,{ok:true,status:'AGNO_RUN_COMPLETED',thread,
        answer:result.original_response,runId:result.run_id,sessionId:result.session_id,
        provenance:result.provenance,canSend:false,providerAuthorized:false});
    }else{
      if(!nativeHistory(result)){
        deny(res,503,'W43_NATIVE_CHAT_HISTORY_UNVERIFIED');return true
      }
      send(res,200,{ok:true,status:result.status,thread,messages:result.messages,
        runCount:result.run_count,completeTurnCount:result.complete_turn_count,
        source:'W43_NATIVE_AGNO_CHAT_HISTORY',canSend:false,providerAuthorized:false});
    }
    return true;
  };
}
