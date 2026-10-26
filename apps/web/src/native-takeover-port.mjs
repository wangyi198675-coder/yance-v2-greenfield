// W24 owns canonical native GET/POST paths, payload contracts and authorization.
import {synthetic,fullK} from './composer-bridge.mjs';
export function createLoopbackTakeoverPort({baseUrl,endpoints,enabled=false,fetchImpl=globalThis.fetch}){
 if(!enabled)throw Error('NATIVE_PORT_DISABLED');
 const root=new URL(baseUrl);
 if(!['localhost','127.0.0.1','[::1]','::1'].includes(root.hostname)||
    !['http:','https:'].includes(root.protocol)||root.username||root.password)
    throw Error('LOOPBACK_ONLY');
 if(!endpoints||!['get','post'].every(n=>typeof endpoints[n]==='string'&&
    endpoints[n].startsWith('/')&&!endpoints[n].startsWith('//')&&!endpoints[n].includes('..')))
    throw Error('OWNER_ENDPOINTS_REQUIRED');
 async function call(method,path,id,payload){
   synthetic(id);
   const url=new URL(path,root);
   if(url.origin!==root.origin)throw Error('CROSS_ORIGIN');
   const result=await fetchImpl(url.href,{method,credentials:'omit',redirect:'error',
      headers:{'Content-Type':'application/json','X-Yance-Environment':'synthetic-only'},
      body:method==='POST'?JSON.stringify({identity:id,...payload}):undefined});
   if(!result.ok)throw Error('NATIVE_HTTP_'+result.status);
   return result.json();
 }
 return Object.freeze({
   get:id=>call('GET',endpoints.get+'?k='+encodeURIComponent(synthetic(id)),id),
   post:(id,payload)=>call('POST',endpoints.post,id,payload)
 });
}


// Issue #61: real CONTACT only, server-authoritative W47 local session and W24
// four-field CAS. This client never resolves Actor/account permissions itself.
export function createTrustedTakeoverPort({fetchImpl=globalThis.fetch}={}){
 if(typeof fetchImpl!=='function')throw Error('TRUSTED_TAKEOVER_FETCH_REQUIRED');
 const native=async(path,init={})=>{
  const res=await fetchImpl(path,{method:'GET',credentials:'same-origin',
   cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',...init});
  if(!res?.ok)throw Error('TRUSTED_TAKEOVER_HTTP_'+(res?.status||'UNAVAILABLE'));
  return res.json();
 };
 const safeId=id=>{
  const k=fullK(id);
  if(id.tenant==='SYNTHETIC_TEST_ONLY'||String(id.account).startsWith('fixture-')||
     String(id.peer_id).startsWith('fake-'))throw Error('REAL_TAKEOVER_REJECTS_FIXTURE_K');
  return k;
 };
 const session=async()=>{
  const s=await native('/api/v2/local-session/status');
  if(s?.ok!==true||s.paired!==true||s.canSend!==false||
     s.providerAuthorized!==false||!/^[a-f0-9]{64}$/.test(s.csrfToken)||
     !Number.isSafeInteger(s.expiresAt)||s.expiresAt<=Date.now())
    throw Error('TRUSTED_W47_SESSION_REQUIRED');
  return s;
 };
 return Object.freeze({
  async get(id){
   const k=safeId(id);
   await session();
   return native('/api/v2/identity-consent/takeover-state?k='+encodeURIComponent(k));
  },
  async post(id,payload){
   const k=safeId(id),s=await session();
   if(!payload||payload.expectedIdentityKey!==k||
     !Number.isSafeInteger(payload.expectedEpoch)||payload.expectedEpoch<0||
     !Number.isSafeInteger(payload.expectedAccountRevocationEpoch)||
     !Number.isSafeInteger(payload.expectedConsentEpoch)||
     payload.action===undefined||payload.intent!=='TAKEOVER_HUMAN_COMPOSER')
     throw Error('TRUSTED_TAKEOVER_CAS_MISSING');
   return native('/api/v2/identity-consent/takeover',{
    method:'POST',headers:{'content-type':'application/json','x-yance-csrf':s.csrfToken},
    body:JSON.stringify({identity:id,...payload})
   });
  }
 });
}
