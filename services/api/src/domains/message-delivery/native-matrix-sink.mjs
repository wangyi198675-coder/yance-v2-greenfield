/**
 * An official Matrix C-S transport plug-in for the ORIGINAL W25 durable
 * MessageDelivery's NativeConnectorSink. It is not a second sender, public
 * HTTP API, provider credential store or replacement for W24/W44 authority.
 * Inject from trusted W26 + W24 native owners ONLY, never from browser JSON.
 *
 * A Matrix m.room.message event ID proves homeserver admission, not that
 * Facebook Messenger accepted the message. Until the upstream provider's
 * authenticated ACK/echo is reconciled through W25, the result is UNKNOWN,
 * never a false ACK that permits duplicate sends to the same recipient.
 */
import {NativeConnectorSink,DeliveryError} from './index.mjs';
const ROOM=/^![A-Za-z0-9._=-]{12,200}$|^![^\s:]{1,220}:[A-Za-z0-9.-]+$/;
const TXT=v=>typeof v==='string'&&v.length>0&&v.length<=300;
const fail=c=>{throw new DeliveryError(c)};
export function createW25OfficialMatrixSink({
  getCurrentNativeSession,readNativeAccountStatus,resolveW24VerifiedPeerRoom,
  fetchImpl=fetch,homeserver='http://127.0.0.1:28438'
}={}){
 if([getCurrentNativeSession,readNativeAccountStatus,resolveW24VerifiedPeerRoom,fetchImpl]
     .some(f=>typeof f!=='function')||
    homeserver!=='http://127.0.0.1:28438')
   fail('ORIGINAL_W26_W24_NATIVE_OWNER_PORTS_REQUIRED');
 return new NativeConnectorSink({deliver:async request=>{
  if(request?.k?.channel!=='FB_PERSONAL'||request.synthetic!==false||
     typeof request.payload?.text!=='string'||request.payload.text.trim().length===0||
     request.payload.text.length>20000||
     request.payload.assetIds?.length)
    return {kind:'REJECTED_NO_SEND',beforeNetwork:true};
  const session=await getCurrentNativeSession();
  if(!TXT(session?.token)||session.principal!=='@w56_internal_fb_bridge:yance-w26.invalid')
    return {kind:'REJECTED_NO_SEND',beforeNetwork:true};
  const current=await readNativeAccountStatus(session.token);
  if(current?.bridgeBot!=='@facebookbot:yance-w26.invalid'||
     current?.connectedCount!==1||
     current?.realAccountState!=='UPSTREAM_CONNECTED_W24_BINDING_PENDING')
    return {kind:'REJECTED_NO_SEND',beforeNetwork:true};
  // W24 must validate actual native provider peer (not a Matrix room hint)
  // and current account binding. Matrix room ID is never a substitute for K.
  const proof=await resolveW24VerifiedPeerRoom({
    k:structuredClone(request.k),nativePrincipal:session.principal,
    operation:'SEND_MESSAGE',businessMessageId:request.businessMessageId
  });
  if(proof?.verified!==true||proof.platformPeerVerified!==true||
     proof.nativeSessionCurrent!==true||
     proof.channel!=='FB_PERSONAL'||
     proof.tenantId!==request.k.tenantId||
     proof.accountId!==request.k.accountId||
     proof.peerId!==request.k.peerId||
     String(proof.bindingRevision)!==String(request.k.bindingRevision)||
     !ROOM.test(proof.roomId||'')||!TXT(proof.platformPeerId))
    return {kind:'REJECTED_NO_SEND',beforeNetwork:true};
  // Verify current Matrix membership with the SAME protected technical user;
  // remote bridge room hints alone don't grant permission to send.
  const headers={Authorization:'Bearer '+session.token};
  const joined=await fetchImpl(homeserver+'/_matrix/client/v3/joined_rooms',{
    headers,redirect:'error',signal:AbortSignal.timeout(7000)});
  if(!joined.ok)return {kind:'REJECTED_NO_SEND',beforeNetwork:true};
  const rooms=await joined.json();
  if(!Array.isArray(rooms.joined_rooms)||!rooms.joined_rooms.includes(proof.roomId))
    return {kind:'REJECTED_NO_SEND',beforeNetwork:true};
  // This is the ONE W25 network boundary. ID is fixed by W25's durable
  // attempt, not by a browser timestamp, a transient session or random retry.
  const endpoint=homeserver+'/_matrix/client/v3/rooms/'+
    encodeURIComponent(proof.roomId)+'/send/m.room.message/'+
    encodeURIComponent(request.attemptId);
  const body=JSON.stringify({msgtype:'m.text',body:request.payload.text});
  try{
   const sent=await fetchImpl(endpoint,{
    method:'PUT',headers:{...headers,'Content-Type':'application/json'},
    body,redirect:'error',signal:AbortSignal.timeout(12000)});
   if(sent.ok){
    const data=await sent.json().catch(()=>({}));
    if(typeof data.event_id==='string'&&data.event_id.startsWith('$')){
      // NEVER call this a provider ACK. Provider echo must be resolved by
      // W25 recordVerifiedReceipt using provider source attestation.
      return {kind:'UNKNOWN',matrixEventId:data.event_id,
        reason:'MATRIX_ACCEPTED_WAIT_META_PROVIDER_ACK'};
    }
   }
   return {kind:'UNKNOWN'};
  }catch{
   return {kind:'UNKNOWN'};
  }
 }});
}
