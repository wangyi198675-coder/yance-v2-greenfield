// Web-first client for ORIGINAL local-session and W27/W55 server-side API.
import {currentFirstPartyWebSession,renewFirstPartyWebSession} from './local-first-party-session.mjs';
// Tokens are transient component state, never localStorage/URL/logs.
const base='/api/v2/providers/fb-page/onboarding';
const error=code=>{throw Object.assign(new Error(code),{code})};
export async function currentPancakeWebSession(fetchImpl=globalThis.fetch){
 const session=await currentFirstPartyWebSession(fetchImpl);
 if(session?.authorized!==true||
   !['WEB_LOCAL_PRIVATE','NATIVE_FIRST_PARTY'].includes(session.sessionKind)||
   !/^[a-f0-9]{64}$/.test(session.csrfToken??''))
  error('CURRENT_WEB_SESSION_NOT_VERIFIED');
 return session;
}
export async function pancakeMultiApi(action,{
 fetchImpl=globalThis.fetch,userAccessToken,pageId,pageAccessToken
}={}){
 const session=await currentPancakeWebSession(fetchImpl);
 let url,init;
 if(action==='capabilities'||action==='pages'){
  url=base+'/'+action;
  init={method:'GET',credentials:'same-origin',cache:'no-store',
   redirect:'error',referrerPolicy:'no-referrer'};
 }else if(action==='account'||action==='page-token'){
  url=base+'/'+action;
  const body=action==='account'?{userAccessToken}:{pageId,pageAccessToken};
  init={method:'POST',credentials:'same-origin',cache:'no-store',
   redirect:'error',referrerPolicy:'no-referrer',
   headers:{'content-type':'application/json','x-yance-csrf':session.csrfToken},
   body:JSON.stringify(body)};
 }else error('INVALID_PANCAKE_ACCOUNT_ACTION');
 let res=await fetchImpl(url,init);
 // An older browser tab may retain a local-session cookie from a prior API
 // process. Reissue the existing first-party PRIVATE session once, only on
 // read-only capability discovery; never silently replay token writes.
 if(action==='capabilities'&&[401,403].includes(res?.status)){
  await renewFirstPartyWebSession(fetchImpl);
  await currentPancakeWebSession(fetchImpl);
  res=await fetchImpl(url,init);
 }
 if(!res?.ok)error('PANCAKE_'+action.toUpperCase().replace('-','_')+'_HTTP_'+(res?.status||0));
 const reply=await res.json();
 if(reply?.ok!==true||reply.canSend!==false)
  error('PANCAKE_ACCOUNT_RESPONSE_UNVERIFIED');
 if(action==='pages'||action==='account'){
  if(!Array.isArray(reply.pages)||reply.pages.length>500||
    reply.pages.some(p=>typeof p?.pageId!=='string'||!/^[0-9]{1,40}$/.test(p.pageId)))
   error('PANCAKE_ACCOUNT_PAGES_UNVERIFIED');
 }
 return reply;
}