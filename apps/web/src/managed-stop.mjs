// W46-only browser-facing stop state gate. W44 remains sole grant/fence authority.
// Trusted Actor/account/contact scope must be resolved by the authenticated API/IPC,
// never inferred from browser-provided Actor, local booleans, or Agent state.
import {fullK,synthetic} from './composer-bridge.mjs';
const invalid=code=>{throw Error(code)};
const SCOPES=new Set(['CONTACT','GLOBAL']);
const STATUSES=new Set(['ACTIVE','UNQUALIFIED','PENDING','COMMITTED']);
const positive=x=>Number.isSafeInteger(x)&&x>0;
function authoritative(row,identity,scope){
 const key=fullK(identity);
 if(!row||row.authoritative!==true||row.identityKey!==key||row.scope!==scope||
    !STATUSES.has(row.status)||row.canSend!==false||
    !Number.isSafeInteger(row.generation)||row.generation<0)
   invalid('STOP_AUTHORITY_NOT_VERIFIED');
 if(['PENDING','COMMITTED'].includes(row.status) &&
    (!row.requestId||typeof row.requestId!=='string'||!positive(row.generation)))
   invalid('STOP_REQUEST_PROOF_MISSING');
 return Object.freeze({...row});
}
export function createManagedStopController({port}={}){
 const selections=new Map(),inflight=new Map();
 const state=(id,scope)=>{
   if(!SCOPES.has(scope))invalid('STOP_SCOPE_INVALID');
   const key=fullK(id)+'|'+scope;
   return selections.get(key)||{status:'UNAVAILABLE',canSend:false,reason:'停止托管服务端接口未接入'};
 };
 const remember=(id,scope,result)=>{
   const key=fullK(id)+'|'+scope;
   selections.set(key,Object.freeze(result));return state(id,scope)
 };
 async function read(id,scope){
   synthetic(id);
   if(!SCOPES.has(scope))invalid('STOP_SCOPE_INVALID');
   if(typeof port?.read!=='function')
     return remember(id,scope,{status:'UNAVAILABLE',canSend:false,reason:'停止托管服务端接口未接入'});
   try{
     const remote=authoritative(await port.read({...id},scope),id,scope);
     return remember(id,scope,remote);
   }catch(e){
     return remember(id,scope,{status:'UNAVAILABLE',canSend:false,
       reason:'状态读取失败：'+String(e?.message||e)});
   }
 }
 async function stop(id,scope){
   synthetic(id);
   if(!SCOPES.has(scope))invalid('STOP_SCOPE_INVALID');
   const key=fullK(id)+'|'+scope;
   if(inflight.has(key))return inflight.get(key);
   const promise=(async()=>{
     if(typeof port?.requestStop!=='function'||typeof port?.read!=='function')
       return remember(id,scope,{status:'UNAVAILABLE',canSend:false,reason:'停止托管服务端接口未接入'});
     // Refresh BEFORE POST, prevent fake success from stale local state.
     const before=await read(id,scope);
     if(before.status==='UNAVAILABLE'||before.status==='UNQUALIFIED')return before;
     if(before.status==='COMMITTED')return before;
     if(before.status==='PENDING')return before; // never create a second fence
     remember(id,scope,{status:'STOPPING',canSend:false,reason:'正在提交停止请求'});
     try{
       // No Actor, grantScope, epoch, request ID or proof is accepted from UI.
       const reply=await port.requestStop({...id},scope);
       if(!reply||reply.authoritative!==true||reply.identityKey!==fullK(id)||
          reply.scope!==scope||!['PENDING','COMMITTED'].includes(reply.status)||
          !positive(reply.generation)||typeof reply.requestId!=='string'||!reply.requestId)
          invalid('STOP_POST_NOT_VERIFIED');
       const after=authoritative(await port.read({...id},scope),id,scope);
       if(after.status==='PENDING'){
         if(after.requestId!==reply.requestId||after.generation!==reply.generation)
           invalid('STOP_PENDING_RECEIPT_MISMATCH');
         return remember(id,scope,after);
       }
       if(after.status!=='COMMITTED'||after.requestId!==reply.requestId||
          after.generation!==reply.generation)
         invalid('STOP_COMMIT_NOT_CONFIRMED');
       return remember(id,scope,after);
     }catch(e){
       // Network uncertainty: never present STOPPED even if POST might have committed.
       return remember(id,scope,{status:'UNAVAILABLE',canSend:false,
         reason:'停止状态无法确认：'+String(e?.message||e)});
     }
   })();
   inflight.set(key,promise);
   try{return await promise}finally{inflight.delete(key)}
 }
 return Object.freeze({read,stop,state});
}

// Explicit port shape. This is an interface for an authenticated server-owned
// endpoint; W09 has NOT shipped that endpoint as of SHA 1588975. Loopback fixture
// is used only by the nonprod B+C Chrome harness and is not production auth.
export function createLoopbackManagedStopPort({baseUrl,enabled=false,fetchImpl=globalThis.fetch}={}){
 if(!enabled)invalid('STOP_PORT_DISABLED');
 const root=new URL(baseUrl);
 if(root.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(root.hostname)||
    root.username||root.password)invalid('STOP_LOOPBACK_ONLY');
 const endpoint='/w46-native-test/managed-stop';
 const call=async(method,id,scope)=>{
   synthetic(id);if(!SCOPES.has(scope))invalid('STOP_SCOPE_INVALID');
   const u=new URL(endpoint,root);
   if(method==='GET'){
     u.searchParams.set('k',fullK(id));u.searchParams.set('scope',scope);
   }
   const r=await fetchImpl(u.href,{
     method,credentials:'omit',redirect:'error',
     headers:{'Content-Type':'application/json','X-Yance-Environment':'synthetic-only'},
     body:method==='POST'?JSON.stringify({identity:id,scope}):undefined
   });
   if(!r.ok)invalid('STOP_HTTP_'+r.status);
   return r.json();
 };
 return Object.freeze({read:(id,scope)=>call('GET',id,scope),
   requestStop:(id,scope)=>call('POST',id,scope)});
}
