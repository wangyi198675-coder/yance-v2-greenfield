// W24 owns canonical native GET/POST paths, payload contracts and authorization.
import {synthetic} from './composer-bridge.mjs';
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
