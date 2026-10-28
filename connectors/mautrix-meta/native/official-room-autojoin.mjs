/**
 * Minimal Matrix-side receiver recovery for the EXISTING official mautrix-meta
 * bridge. Never sends to Facebook, creates credentials, peers, W24 K or grants.
 * Fail-closed: accept invitations only from current official bridge bot, in
 * the authenticated principal's Matrix account. No message contents exposed.
 */
import {getProtectedNativeMatrixSession} from './native-matrix-session.mjs';
import {readNativeAccountStatus} from './provisioning-auth.mjs';
const BASE='http://127.0.0.1:28438';
const BOT='@facebookbot:yance-w26.invalid';
const PRINCIPAL='@w56_internal_fb_bridge:yance-w26.invalid';
const roomId=x=>typeof x==='string'&&
  (/^![A-Za-z0-9._=-]{12,200}$/.test(x)||
   /^![^\s:]{1,220}:yance-w26\.invalid$/.test(x));
const safe=()=>{
  const result={officialCandidates:0,joined:0,skipped:0,failed:0,canSend:false};
  return result;
};
export async function joinOfficialFacebookInvites({
  getSession=getProtectedNativeMatrixSession,
  readAccount=readNativeAccountStatus,fetchImpl=fetch
}={}){
 const report=safe();
 const session=await getSession();
 if(session?.principal!==PRINCIPAL||typeof session.token!=='string'||!session.token)
   throw Error('FB_MATRIX_PRINCIPAL_NOT_VERIFIED');
 const a=await readAccount(session.token);
 if(a?.bridgeBot!==BOT||a?.connectedCount!==1||
    a?.realAccountState!=='UPSTREAM_CONNECTED_W24_BINDING_PENDING')
   throw Error('FB_UPSTREAM_LOGIN_NOT_CURRENT');
 const headers={Authorization:'Bearer '+session.token,'Content-Type':'application/json'};
 const profile=await fetchImpl(BASE+'/_matrix/client/v3/profile/'+encodeURIComponent(BOT)+'/displayname',{
   headers,redirect:'error',signal:AbortSignal.timeout(8000)});
 if(!profile.ok||(await profile.json()).displayname!=='Facebook Messenger bridge bot')
   throw Error('OFFICIAL_FACEBOOK_BOT_NOT_VERIFIED');
 const sync=await fetchImpl(BASE+'/_matrix/client/v3/sync?timeout=0',{
   headers,redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!sync.ok)throw Error('MATRIX_INVITE_SYNC_UNAVAILABLE');
 const invitations=Object.entries((await sync.json()).rooms?.invite||{});
 if(invitations.length>100)throw Error('MATRIX_INVITE_VOLUME_EXCESSIVE');
 for(const [room,detail] of invitations){
  const states=detail?.invite_state?.events;
  if(!roomId(room)||!Array.isArray(states)||states.length>80){
   report.skipped++;continue;
  }
  const member=states.find(e=>e?.type==='m.room.member'&&e.state_key===PRINCIPAL);
  const created=states.find(e=>e?.type==='m.room.create');
  if(member?.content?.membership!=='invite'||member.sender!==BOT||
     !created||!['m.space',undefined].includes(created.content?.type)){
   report.skipped++;continue;
  }
  report.officialCandidates++;
  try{
   const resp=await fetchImpl(BASE+'/_matrix/client/v3/join/'+encodeURIComponent(room),{
     method:'POST',headers,body:'{}',redirect:'error',signal:AbortSignal.timeout(12000)});
   if(resp.ok&&(await resp.json()).room_id===room)report.joined++;
   else report.failed++;
  }catch{report.failed++}
 }
 return Object.freeze(report);
}
