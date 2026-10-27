// Actual W47 -> original W24 5-part native K -> W25 timeline -> one Composer.
// Native K is a locator and version selector, NOT a user grant or send right.
// Original W24/W25 must recheck current principal, consent and binding for use.
import {fullK} from './composer-bridge.mjs';
const channels=new Set(['FB_PERSONAL','FB_PAGE','WHATSAPP_PERSONAL','TELEGRAM_PERSONAL']);
const account=/^[A-Za-z0-9_-]{8,150}$/;
const peer=/^[A-Za-z0-9_.:@+-]{4,200}$/;
const deny=e=>{throw Error(e)};
const read=async(fetchImpl,url)=>{
 const response=await fetchImpl(url,{method:'GET',credentials:'same-origin',
  cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'});
 if(!response?.ok)deny('NATIVE_HTTP_'+(response?.status||'UNAVAILABLE'));
 return response.json();
};
export function validateLiveContacts(health,result){
 if(health?.ok!==true||typeof health.runtimeSha!=='string'||!health.runtimeSha||
  health.canSend!==false||typeof health.trustedSession!=='boolean'||
  result?.ok!==true||result.authoritative!==true||result.canSend!==false||
  !Array.isArray(result.contacts)||result.contacts.length>10000||
  !Number.isSafeInteger(result.connectedAccountCount)||result.connectedAccountCount<0)
  deny('LIVE_CONTACT_AUTHORITY_INVALID');
 if(health.trustedSession!==true||result.source!=='W24_CURRENT_K_AND_NATIVE_CHANNEL_OWNERS')
  deny('LIVE_SESSION_OR_NATIVE_OWNER_NOT_QUALIFIED');
 const seen=new Set();
 const contacts=result.contacts.map(c=>{
  if(!c||!account.test(c.accountRef)||c.accountRef.startsWith('fixture-')||
     c.accountRef==='SYNTHETIC_TEST_ONLY'||!channels.has(c.channel)||
     !peer.test(c.peerRef)||c.peerRef.startsWith('fake-')||
     !Number.isSafeInteger(c.bindingRevision)||
     c.bindingRevision<1||typeof c.displayName!=='string'||
     !c.displayName.trim()||c.displayName.length>180||
     !c.identity||typeof c.identity!=='object'||
     c.identity.channel!==c.channel||c.identity.peer_id!==c.peerRef||
     c.identity.binding_revision!==c.bindingRevision||
     typeof c.identity.tenant!=='string'||!c.identity.tenant||
     typeof c.identity.account!=='string'||!c.identity.account||
     c.identity.tenant==='SYNTHETIC_TEST_ONLY'||
     c.identity.account.startsWith('fixture-')||
     c.identity.peer_id.startsWith('fake-')||
     typeof c.identityKey!=='string'||fullK(c.identity)!==c.identityKey||
     c.tenant!==undefined||c.canSend!==undefined||c.accessToken!==undefined)
   deny('LIVE_NATIVE_CONTACT_RECORD_INVALID');
  const contactRef=[c.accountRef,c.channel,c.peerRef,c.bindingRevision].join('|');
  if(seen.has(contactRef))deny('LIVE_CONTACT_DUPLICATED');
  seen.add(contactRef);
  return Object.freeze({contactRef,accountRef:c.accountRef,channel:c.channel,
    peerRef:c.peerRef,bindingRevision:c.bindingRevision,
    displayName:c.displayName,unread:null,
    identity:Object.freeze({...c.identity}),identityKey:c.identityKey,
    canSend:false});
 });
 if(contacts.length&&!result.connectedAccountCount)deny('LIVE_CONTACT_ACCOUNT_COUNT_INVALID');
 return Object.freeze({trustedSession:true,source:result.source,
  connectedAccountCount:result.connectedAccountCount,
  realContacts:contacts.length,contacts:Object.freeze(contacts),canSend:false});
}
export function validateNativeTimeline(response,contact){
 if(!contact?.identity||typeof contact.identityKey!=='string'||
    fullK(contact.identity)!==contact.identityKey)
  deny('W24_FULL_K_NOT_SIGNED');
 if(response?.ok!==true||response.authoritative!==true||
   response.canSend!==false||response.identityKey!==contact.identityKey||
   !Array.isArray(response.messages)||response.messages.length>250)
  deny('LIVE_TIMELINE_AUTHORITY_INVALID');
 const seen=new Set();
 return Object.freeze({canSend:false,messages:Object.freeze(response.messages.map(m=>{
  if(!m||m.identityKey!==contact.identityKey||typeof m.mid!=='string'||
     !m.mid.trim()||m.mid.length>250||seen.has(m.mid)||
     typeof m.original!=='string'||m.original.length>64000||
     !['INBOUND','OUTBOUND'].includes(m.direction)||
     typeof m.providerSource!=='string'||!m.providerSource.trim())
   deny('LIVE_NATIVE_MID_INVALID');
  seen.add(m.mid);
  const t=m.translation;
  if(t!==undefined&&(typeof t!=='object'||typeof t.zh!=='string'||
    typeof t.runId!=='string'||t.sourceMid!==m.mid||
    t.identityKey!==contact.identityKey||t.qualityQualified!==false))
   deny('LIVE_TRANSLATION_NOT_ATTESTED');
  return Object.freeze({mid:m.mid,original:m.original,direction:m.direction,
   providerSource:m.providerSource,zh:t?.zh||'',translationRunId:t?.runId||null,
   canSend:false,delivery:m.delivery||'NOT_REQUESTED'});
 }))});
}
export async function readLiveContacts({fetchImpl=globalThis.fetch}={}){
 if(typeof fetchImpl!=='function')deny('W47_FETCH_REQUIRED');
 const health=await read(fetchImpl,'/api/v2/runtime/health');
 return validateLiveContacts(health,await read(fetchImpl,'/api/v2/contacts'));
}
export async function readLiveTimeline({fetchImpl=globalThis.fetch,contact}={}){
 if(!contact?.identity||!contact.identityKey||
    fullK(contact.identity)!==contact.identityKey)
  deny('W24_FULL_K_NOT_SIGNED');
 if(typeof fetchImpl!=='function')deny('W47_FETCH_REQUIRED');
 return validateNativeTimeline(await read(fetchImpl,
  '/api/v2/messages?identityKey='+encodeURIComponent(contact.identityKey)),contact);
}
export const explainNativeFailure=e=>{
 const msg=String(e?.message||e||'');
 if(msg.includes('W24_FULL_K_NOT_SIGNED'))
  return 'W24 原生五段身份尚未核验，无法读取此联系人消息或接管';
 if(msg.includes('NATIVE_HTTP_401'))return 'WAITING_USER_AUTH · 尚未建立可信应用会话或联系人授权';
 if(msg.includes('NATIVE_HTTP_403'))return '授权已撤销或账号访问权限不足';
 if(msg.includes('NATIVE_HTTP_409'))return '绑定或撤权版本变化，请重试';
 if(msg.includes('NATIVE_HTTP_503'))return 'W24／四渠道原生 Worker 尚未接线或运行';
 return '无法核实当前身份与消息来源，保持不可用';
};
