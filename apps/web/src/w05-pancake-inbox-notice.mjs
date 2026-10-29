// Narrow presentation-only consumer of existing Pancake official inbox/history.
// No sender, extra polling, message database, outbox or notification manager.
import {playW05DoubleTone} from './w05-notification-audio.mjs';
const iso=x=>typeof x==='string'&&x.trim()?Date.parse(x):NaN;
const clean=(s,n)=>typeof s==='string'?
 s.replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,' ')
  .replace(/\s+/g,' ').trim().slice(0,n):'';
// Fail closed when inbox timestamps are unknown; never alert on initial load,
// an outgoing message, or a historic message merely visible in ChatHistory.
export function latestNewOfficialPancakeInbound(previous,current,history){
 if(!previous?.readOnlyPreview||!current?.readOnlyPreview||
  previous.contactRef!==current.contactRef||
  previous.pageId!==current.pageId||
  previous.conversationId!==current.conversationId)return null;
 const prior=iso(previous.updatedAt),updated=iso(current.updatedAt);
 if(!Number.isFinite(prior)||!Number.isFinite(updated)||updated<=prior)return null;
 if(history?.source!=='PANCAKE_OFFICIAL_HISTORY_READ_ONLY'||
  history.pageId!==current.pageId||
  history.conversationId!==current.conversationId||
  !Array.isArray(history.messages)||history.messages.length>250)return null;
 const messages=history.messages.filter(m=>typeof m?.mid==='string'&&
  m.mid.length>0&&m.mid.length<=250&&
  ['INBOUND','OUTBOUND'].includes(m.direction)&&
  Number.isFinite(iso(m.insertedAt)));
 if(!messages.length)return null;
 messages.sort((a,b)=>iso(a.insertedAt)-iso(b.insertedAt));
 const last=messages[messages.length-1];
 if(last.direction!=='INBOUND'||iso(last.insertedAt)<=prior||
  iso(last.insertedAt)>updated+60000)return null;
 return last;
}
export async function showOfficialPancakeInboundNotice({
 contact,message,
 hidden=globalThis.document?.visibilityState==='hidden',
 BrowserNotification=globalThis.Notification,
 sound=playW05DoubleTone,
 onClick=()=>{}
}={}){
 if(!contact?.readOnlyPreview||contact.channel!=='FB_PAGE'||
  typeof message?.mid!=='string'||message.direction!=='INBOUND')return 'NOT_VERIFIED';
 const title='言策 · Facebook Page';
 const name=clean(contact.displayName,65)||'Facebook 联系人';
 const text=clean(message.original,110)||'发来一条新消息';
 let displayed=false;
 // Do not request permission by surprise, or duplicate when foreground open.
 if(hidden&&typeof BrowserNotification==='function'&&
    BrowserNotification.permission==='granted'){
  const options={body:name+'：'+text,silent:true,
   tag:'yance-pancake-'+contact.pageId+'-'+message.mid.slice(0,160)};
  // W55-minted same-origin, Page-scoped signed ticket only.
  if(typeof contact.avatarUrl==='string'&&
    contact.avatarUrl.startsWith('/api/v2/providers/fb-page/onboarding/avatar?'))
   options.icon=contact.avatarUrl;
  try{
   const notice=new BrowserNotification(title,options);
   notice.onclick=()=>{void Promise.resolve(onClick()).catch(()=>{})};
   displayed=true;
  }catch{/* browser/system permission may change */}
 }
 // Background Chrome may suspend AudioContext.resume() until a user gesture.
 // Do not let an unresolved audio promise freeze the existing inbox polling.
 try{const played=sound();if(played?.catch)void played.catch(()=>{})}catch{}
 return displayed?'BROWSER_SUBMITTED':'SOUND_OR_IN_APP_ONLY';
}
