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
 fetchImpl=globalThis.fetch,userAccessToken,pageId,pageAccessToken,
 ownerReviewedRelink=false,expectedRevokedRevision=null,conversationId
}={}){
 const session=await currentPancakeWebSession(fetchImpl);
 let url,init;
 if(action==='capabilities'||action==='pages'||action==='inbox'||action==='history'){
  url=base+'/'+action+(action==='inbox'||action==='history'?'?pageId='+encodeURIComponent(pageId||'')+(action==='history'?'&conversationId='+encodeURIComponent(conversationId||''):''):'');
  init={method:'GET',credentials:'same-origin',cache:'no-store',
   redirect:'error',referrerPolicy:'no-referrer'};
 }else if(action==='account'||action==='discover'||action==='page-token'){
  url=base+'/'+action;
  const body=action==='account'||action==='discover'?{
   userAccessToken,
   ...(ownerReviewedRelink===true?{ownerReviewedRelink:true,expectedRevokedRevision}:{})
  }:{pageId,pageAccessToken};
  init={method:'POST',credentials:'same-origin',cache:'no-store',
   // Bound a real provider/native roundtrip; never replay a token write.
   signal:AbortSignal.timeout(30000),
   redirect:'error',referrerPolicy:'no-referrer',
   headers:{'content-type':'application/json','x-yance-csrf':session.csrfToken},
   body:JSON.stringify(body)};
 }else error('INVALID_PANCAKE_ACCOUNT_ACTION');
 let res;
 try{res=await fetchImpl(url,init)}
 catch(e){if(['TimeoutError','AbortError'].includes(e?.name))
  error('PANCAKE_'+action.toUpperCase().replace('-','_')+'_TIMEOUT_30S');
  throw e;
 }
 // An older browser tab may retain a local-session cookie from a prior API
 // process. Reissue the existing first-party PRIVATE session once, only on
 // read-only capability discovery; never silently replay token writes.
 if(action==='capabilities'&&[401,403].includes(res?.status)){
  await renewFirstPartyWebSession(fetchImpl);
  await currentPancakeWebSession(fetchImpl);
  res=await fetchImpl(url,init);
 }
 if(!res?.ok){
  let code='';
  try{const body=await res.clone().json();if(/^[A-Z0-9_]{3,80}$/.test(body?.error||''))code=body.error}
  catch{}
  error('PANCAKE_'+action.toUpperCase().replace('-','_')+'_HTTP_'+(res?.status||0)+(code?'_CODE_'+code:''));
 }
 const reply=await res.json();
 if(reply?.ok!==true||reply.canSend!==false)
  error('PANCAKE_ACCOUNT_RESPONSE_UNVERIFIED');
 if(action==='pages'||action==='account'||action==='discover'){
  if(!Array.isArray(reply.pages)||reply.pages.length>500||
    reply.pages.some(p=>typeof p?.pageId!=='string'||!/^[0-9]{1,40}$/.test(p.pageId)))
   error('PANCAKE_ACCOUNT_PAGES_UNVERIFIED');
 }
 if(action==='discover'&&(reply.status!=='SECOND_ACCOUNT_OFFICIAL_PAGES_DISCOVERED'||
  reply.userTokenStored!==false||reply.source!=='PANCAKE_OFFICIAL_ACCOUNT_DISCOVERY'))
  error('PANCAKE_SECOND_ACCOUNT_DISCOVERY_UNVERIFIED');
 if(action==='inbox'&&(reply.source!=='PANCAKE_OFFICIAL_INBOX_READ_ONLY'||reply.pageId!==pageId||!Array.isArray(reply.conversations)))error('PANCAKE_INBOX_SOURCE_UNVERIFIED');
 if(action==='history'&&(reply.source!=='PANCAKE_OFFICIAL_HISTORY_READ_ONLY'||reply.pageId!==pageId||reply.conversationId!==conversationId||!Array.isArray(reply.messages)))error('PANCAKE_HISTORY_SOURCE_UNVERIFIED');
 return reply;
}