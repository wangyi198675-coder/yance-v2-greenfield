// W46 thin UI consumer: actual W47 authoritative CONTACT read APIs only.
// All transports, provider authentication, identity, translation, and W25 writes stay with native Owners.
import {fullK} from './composer-bridge.mjs';
const CHANNELS=new Set(['FB_PERSONAL','FB_PAGE','WHATSAPP_PERSONAL','TELEGRAM_PERSONAL']);
const error=s=>{throw Error(s)};
const json=async(fetchImpl,path)=>{
 const response=await fetchImpl(path,{method:'GET',credentials:'same-origin',
  cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'});
 if(!response?.ok)error('NATIVE_HTTP_'+(response?.status??'UNAVAILABLE'));
 return response.json();
};
const kOf=c=>{
 if(!c||typeof c!=='object'||!CHANNELS.has(c.channel))error('UNTRUSTED_CONTACT_IDENTITY');
 const k=fullK(c);
 if(c.tenant==='SYNTHETIC_TEST_ONLY'||String(c.account).startsWith('fixture-')||
    String(c.peer_id).startsWith('fake-'))error('SYNTHETIC_CONTACT_DENIED');
 return k;
};
export function validateLiveContacts(health,reply){
 if(!health||health.ok!==true||typeof health.runtimeSha!=='string'||
    typeof health.trustedSession!=='boolean'||health.canSend!==false||
    reply?.ok!==true||reply.authoritative!==true||
    !Array.isArray(reply.contacts)||reply.contacts.length>10000||
    !Number.isSafeInteger(reply.connectedAccountCount)||reply.connectedAccountCount<0||
    reply.canSend!==false)error('LIVE_CONTACT_AUTHORITY_INVALID');
 if(!health.trustedSession&&(reply.contacts.length||reply.connectedAccountCount))
   error('LIVE_CONTACT_WITHOUT_SESSION');
 const unique=new Set();
 const contacts=reply.contacts.map(c=>{
  const k=kOf(c);
  if(unique.has(k)||typeof c.displayName!=='string'||!c.displayName.trim()||
     c.displayName.length>180||c.identityKey!==k||
     typeof c.accountAuthorized!=='boolean'||c.accountAuthorized!==true)
    error('LIVE_CONTACT_RECORD_UNVERIFIED');
  unique.add(k);
  return Object.freeze({
   identity:Object.freeze({tenant:c.tenant,account:c.account,
    channel:c.channel,peer_id:c.peer_id,binding_revision:c.binding_revision}),
   identityKey:k,displayName:c.displayName,unread:Number.isSafeInteger(c.unread)&&c.unread>=0?c.unread:0
  });
 });
 return Object.freeze({
  trustedSession:health.trustedSession,realContacts:contacts.length,
  connectedAccountCount:reply.connectedAccountCount,
  source:typeof reply.source==='string'?reply.source:'UNKNOWN',
  contacts:Object.freeze(contacts),canSend:false
 });
}
export function validateNativeTimeline(response,contact){
 if(!contact||response?.ok!==true||response.authoritative!==true||
   response.canSend!==false||response.identityKey!==contact.identityKey||
   !Array.isArray(response.messages)||response.messages.length>250)
   error('LIVE_TIMELINE_AUTHORITY_INVALID');
 const seen=new Set();
 const messages=response.messages.map(m=>{
  if(!m||m.identityKey!==contact.identityKey||typeof m.mid!=='string'||
     !m.mid.trim()||m.mid.length>250||seen.has(m.mid)||
     typeof m.original!=='string'||m.original.length>64000||
     !['INBOUND','OUTBOUND'].includes(m.direction)||
     typeof m.providerSource!=='string'||!m.providerSource.trim())
    error('LIVE_SOURCE_MID_INVALID');
  seen.add(m.mid);
  const translated=m.translation;
  if(translated!==undefined&&(typeof translated!=='object'||
     typeof translated.zh!=='string'||typeof translated.runId!=='string'||
     translated.sourceMid!==m.mid||translated.identityKey!==contact.identityKey||
     translated.qualityQualified!==false))
    error('LIVE_TRANSLATION_UNVERIFIED');
  return Object.freeze({
   identityKey:contact.identityKey,mid:m.mid,original:m.original,direction:m.direction,
   providerSource:m.providerSource,
   zh:translated?.zh||'',translationRunId:translated?.runId||null,
   canSend:false,delivery:m.delivery||'NOT_REQUESTED'
  });
 });
 return Object.freeze({messages:Object.freeze(messages),canSend:false});
}
export async function readLiveContacts({fetchImpl=globalThis.fetch}={}){
 if(typeof fetchImpl!=='function')error('NATIVE_FETCH_REQUIRED');
 const health=await json(fetchImpl,'/api/v2/runtime/health');
 const result=await json(fetchImpl,'/api/v2/contacts');
 return validateLiveContacts(health,result);
}
export async function readLiveTimeline({fetchImpl=globalThis.fetch,contact}={}){
 if(typeof fetchImpl!=='function')error('NATIVE_FETCH_REQUIRED');
 const k=kOf(contact?.identity||contact);
 const response=await json(fetchImpl,
  '/api/v2/messages?identityKey='+encodeURIComponent(k));
 return validateNativeTimeline(response,contact);
}
export const explainNativeFailure=(e)=>{
 const reason=String(e?.message||e||'');
 if(reason.includes('NATIVE_HTTP_401'))return '尚未取得联系人读取权限。请先在渠道账号中完成官方授权';
 if(reason.includes('NATIVE_HTTP_403'))return '账号已撤权或当前联系人权限不足';
 if(reason.includes('NATIVE_HTTP_404'))return '该原生服务尚未提供对应的联系人或消息接口';
 if(reason.includes('NATIVE_HTTP_503'))return '原生渠道 Worker 暂未运行或服务未接通';
 return '服务端身份、消息来源或权限无法核验，已停止显示数据';
};
