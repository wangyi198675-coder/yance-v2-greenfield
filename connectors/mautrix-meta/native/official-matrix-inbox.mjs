/**
 * Existing official mautrix-meta + Tuwunel read-only projection.
 * Matrix is the ONLY store. No new auth, Facebook protocol, DB, peer ID,
 * provider MID, W24 grant, Composer or sender.
 */
import {getProtectedNativeMatrixSession} from './native-matrix-session.mjs';
import {readNativeAccountStatus,readNativePeerHints} from './provisioning-auth.mjs';
const ROOT='http://127.0.0.1:28438';
const BOT='@facebookbot:yance-w26.invalid';
const PRINCIPAL='@w56_internal_fb_bridge:yance-w26.invalid';
const modern=/^![A-Za-z0-9._=-]{12,200}$/;
const legacy=/^![^\s:]{1,220}:[A-Za-z0-9.-]+$/;
const room=x=>typeof x==='string'&&(modern.test(x)||legacy.test(x));
const get=async(path,token)=>{
 const r=await fetch(ROOT+path,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},
  redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('OFFICIAL_MATRIX_READ_'+r.status);
 return r.json();
};
async function current(){
 const s=await getProtectedNativeMatrixSession();
 if(s.principal!==PRINCIPAL)throw Error('WRONG_FB_OWNER');
 const status=await readNativeAccountStatus(s.token);
 if(status.bridgeBot!==BOT||status.connectedCount!==1||
   status.realAccountState!=='UPSTREAM_CONNECTED_W24_BINDING_PENDING')
  throw Error('FB_ACCOUNT_NOT_CONNECTED');
 const hints=await readNativePeerHints(s.token);
 if(hints.accounts?.length!==1)throw Error('FB_ACCOUNT_SPACE_NOT_VERIFIED');
 const ids=hints.accounts[0].roomHints;
 if(!Array.isArray(ids)||ids.length>250||!ids.every(room))
  throw Error('FB_ROOM_HINTS_NOT_VERIFIED');
 return {token:s.token,principal:s.principal,roomIDs:new Set(ids)};
}
const clean=x=>typeof x==='string'&&!/[\u0000-\u001f]/.test(x)?x.trim().slice(0,180):'';
const msg=x=>typeof x?.event_id==='string'&&x.event_id.length<240&&
 x.type==='m.room.message'&&
 x.content?.msgtype==='m.text'&&typeof x.content.body==='string'&&x.content.body.length<=64000;
const projectEvent=(e,principal)=>({mid:e.event_id,original:e.content.body,
 direction:e.sender===principal?'OUTBOUND':'INBOUND',
 matrixTimestamp:Number.isFinite(e.origin_server_ts)?e.origin_server_ts:null,
 providerSource:'OFFICIAL_MAUTRIX_META_MATRIX_EVENT',canSend:false});
const timelineEvents=r=>Array.isArray(r?.timeline?.events)?r.timeline.events:[];
export async function readOfficialFacebookInbox(){
 const s=await current();
 const sync=await get('/_matrix/client/v3/sync?timeout=0&filter='+
  encodeURIComponent(JSON.stringify({room:{timeline:{limit:50},state:{lazy_load_members:false}}})),s.token);
 const joined=sync.rooms?.join||{},visible=[];
 for(const id of s.roomIDs){
  const r=joined[id];if(!r)continue;
  const state=[...(r.state?.events||[]),...(r.timeline?.events||[])];
  const name=state.findLast?.(e=>e.type==='m.room.name'&&typeof e.content?.name==='string');
  const fallbackName=state.findLast?.(e=>e.type==='m.room.canonical_alias'&&e.content?.alias);
  const text=timelineEvents(r).filter(msg);
  const last=text.at(-1);
  visible.push({roomId:id,channel:'FB_PERSONAL',accountRef:'OFFICIAL_FB_MATRIX_READ_ONLY',
   displayName:clean(name?.content?.name)||clean(fallbackName?.content?.alias)||'Messenger 对话',
   lastMessage:last?last.content.body.slice(0,200):null,
   lastMessageTimestamp:last?.origin_server_ts||null,
   lastMessageSource:last?'OFFICIAL_MAUTRIX_META_MATRIX_EVENT':null,
   nativePeerVerified:false,readOnly:true,canSend:false});
 }
 visible.sort((a,b)=>(b.lastMessageTimestamp||0)-(a.lastMessageTimestamp||0));
 return {ok:true,source:'OFFICIAL_MAUTRIX_META_MATRIX_READ_ONLY',
  connectedAccountCount:1,roomCount:visible.length,contacts:visible,
  providerPeerBindingPending:true,canSend:false,unreadAuthoritative:false};
}
export async function readOfficialFacebookMessages(id){
 if(!room(id))throw Error('INVALID_ROOM_SELECTOR');
 const s=await current();
 if(!s.roomIDs.has(id))throw Error('ROOM_NOT_IN_CURRENT_OFFICIAL_ACCOUNT_SPACE');
 const joined=await get('/_matrix/client/v3/joined_rooms',s.token);
 if(!Array.isArray(joined.joined_rooms)||!joined.joined_rooms.includes(id))
  throw Error('MATRIX_ROOM_NOT_JOINED');
 const result=await get('/_matrix/client/v3/rooms/'+encodeURIComponent(id)+
  '/messages?dir=b&limit=100',s.token);
 const ev=Array.isArray(result.chunk)?result.chunk.filter(msg).map(x=>projectEvent(x,s.principal)):[];
 ev.sort((a,b)=>(a.matrixTimestamp||0)-(b.matrixTimestamp||0));
 return {ok:true,source:'OFFICIAL_MAUTRIX_META_MATRIX_READ_ONLY',roomId:id,
  messages:ev,readOnly:true,providerPeerBindingPending:true,canSend:false};
}

/** Fetch exact native room avatar through the existing Matrix media API.
 * Valid room belongs to current official account space; URL only from actual
 * Matrix room avatar event. No user-supplied media URL or third-party fetch.
 */
export async function readOfficialFacebookAvatar(id){
 if(!room(id))throw Error('INVALID_AVATAR_ROOM');
 const currentSession=await current();
 if(!currentSession.roomIDs.has(id))throw Error('AVATAR_ROOM_NOT_OFFICIAL');
 const event=await get('/_matrix/client/v3/rooms/'+encodeURIComponent(id)+
  '/state/m.room.avatar',currentSession.token);
 const mxc=event?.url;
 const match=typeof mxc==='string'?
  /^mxc:\/\/([A-Za-z0-9.-]{1,180})\/([A-Za-z0-9_-]{3,220})$/.exec(mxc):null;
 if(!match)throw Error('NO_OFFICIAL_ROOM_AVATAR');
 const media='http://127.0.0.1:28438/_matrix/client/v1/media/thumbnail/'+
  encodeURIComponent(match[1])+'/'+encodeURIComponent(match[2])+
  '?width=96&height=96&method=crop';
 const response=await fetch(media,{headers:{Authorization:'Bearer '+currentSession.token},
  redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('MATRIX_AVATAR_MEDIA_'+response.status);
 const mime=String(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
 if(!['image/jpeg','image/png','image/webp','image/gif'].includes(mime))
  throw Error('MATRIX_AVATAR_NOT_IMAGE');
 const size=Number(response.headers.get('content-length')||0);
 if(!Number.isFinite(size)||size<0||size>1_500_000)throw Error('MATRIX_AVATAR_TOO_LARGE');
 const data=Buffer.from(await response.arrayBuffer());
 if(!data.length||data.length>1_500_000)throw Error('MATRIX_AVATAR_INVALID_BYTES');
 return Object.freeze({mime,data});
}
