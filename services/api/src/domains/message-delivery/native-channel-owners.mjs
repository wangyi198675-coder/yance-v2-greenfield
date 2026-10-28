/**
 * W25 thin *existing SDK-owner event* mapping into its original single
 * MessageDelivery native inbound port. No platform client, sender or Outbox.
 * Every canonical K is independently revalidated by nativeInboundPort
 * through W24 and the corresponding SDK Owner's source verifier.
 */
import {createHash} from 'node:crypto';
const deny=code=>{throw Object.assign(new Error(code),{code})};
const str=v=>typeof v==='string'&&v.length>0&&v.length<=512;
const exact=v=>typeof v==='string'&&/^(0|[1-9][0-9]*)$/.test(v)||
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fromW24=k=>{
 if(!k||!str(k.tenant)||!str(k.account)||!str(k.channel)||
   !str(k.peer_id)||!Number.isSafeInteger(k.binding_revision)||
   k.binding_revision<=0)deny('NATIVE_W24_K_UNAVAILABLE');
 return {tenantId:k.tenant,accountId:k.account,channel:k.channel,
  peerId:k.peer_id,bindingRevision:String(k.binding_revision)};
};
const sources=Object.freeze({MAUTRIX_META_NATIVE:'mautrix-meta',
 PANCAKE_OFFICIAL_READBACK:'pancake',BAILEYS_NATIVE:'baileys',
 TDLIB_JSON:'tdlib-json'});
export function createW25NativeChannelOwnerPorts({
  nativeInboundPort,attestOriginalOwnerEvent
}={}){
 if(typeof nativeInboundPort?.acceptInbound!=='function'||
   typeof attestOriginalOwnerEvent!=='function')
  deny('W25_NATIVE_INBOUND_AND_OWNER_PROVENANCE_REQUIRED');
 async function receive({owner,event,k,mid,eventScope,original,evidence}={}){
  if(!sources[owner]||!str(mid)||!str(eventScope)||
    typeof original!=='string'||original.length>20000)
    deny('NATIVE_TEXT_EVENT_INVALID');
  const canonical=fromW24(k);
  if(canonical.channel!==({
   MAUTRIX_META_NATIVE:'FB_PERSONAL',PANCAKE_OFFICIAL_READBACK:'FB_PAGE',
   BAILEYS_NATIVE:'WHATSAPP_PERSONAL',TDLIB_JSON:'TELEGRAM_PERSONAL'
  })[owner])deny('NATIVE_CHANNEL_OWNER_MISMATCH');
  // Require a PRIVATE, injected provider-Owner attestation of the actual
  // native SDK event or officially authenticated REST readback, never
  // accept event booleans / browser assertions as provenance.
  const a=await attestOriginalOwnerEvent({owner,rawEvent:event,k,mid,
   eventScope,evidence});
  if(a?.verified!==true||a.owner!==owner||
    a.account!==k.account||a.peerId!==k.peer_id||
    a.bindingRevision!==k.binding_revision||
    a.providerMid!==mid||
    !str(a.principalId)||a.nativeSessionCurrent!==true)
   deny('NATIVE_OWNER_SOURCE_UNVERIFIED');
  const sourceEventId=sha([owner,canonical.tenantId,canonical.accountId,
   canonical.channel,canonical.peerId,eventScope,mid]);
  // Private canonical source proof must still pass W25's second callback
  // verifyNativeSource AND W24's strict K/current Consent read before INSERT.
  const stored=await nativeInboundPort.acceptInbound({
   k:canonical,source:sources[owner],sourceEventId,
   providerMid:mid,providerRemoteJid:event?.providerRemoteJid,
   original,synthetic:false,nativeEvidence:a.evidenceRef
  });
  return Object.freeze({accepted:true,ingressId:stored.id,providerMid:mid,
   duplicate:stored.duplicate===true,canSend:false});
 }
 const baileys=Object.freeze({
  acceptInbound:x=>{
   if(x?.provider!=='BAILEYS_NATIVE'||!str(x.providerRemoteJid)||
     x.nativeContentKind!=='conversation'&&x.nativeContentKind!=='extendedTextMessage')
    deny('BAILEYS_TEXT_NATIVE_SOURCE_REQUIRED');
   return receive({owner:'BAILEYS_NATIVE',event:x,k:x.k,mid:x.providerMid,
    eventScope:x.providerRemoteJid,original:x.original,
    evidence:x.provenance});
  },
  recordReceipt:async()=>Object.freeze({
   accepted:false,status:'PROVIDER_RECEIPT_PENDING_W25_PROOF',
   canSend:false
  })
 });
 const pancake=Object.freeze({
  deliverToExistingInbound:x=>{
   if(x?.source!=='PANCAKE_OFFICIAL_READBACK'||
     x.verifiedProviderReadback!==true||
     x.verifiedNativePeerBinding!==true||
     x.inboundProof!=='PAGES_FM_AUTHENTICATED_REST_READBACK'||
     !str(x.conversationId)||!str(x.metaPageId))
    deny('PANCAKE_OFFICIAL_READBACK_REQUIRED');
   return receive({owner:'PANCAKE_OFFICIAL_READBACK',event:x,k:x.k,
    mid:x.providerMid,eventScope:x.conversationId,original:x.original,
    evidence:x.payloadDigest});
  }
 });
 const tdlib=Object.freeze({
  onAuthorizedInbound:x=>{
   if(x?.provider!=='TDLIB_JSON'||x.realProvider!==true||
     x.originalTdUpdate?.['@type']!=='updateNewMessage'||
     x.originalTdUpdate.message?.is_outgoing!==false)
    deny('TDLIB_NATIVE_INBOUND_REQUIRED');
   const m=x.originalTdUpdate.message;
   if(!exact(m.chat_id)||!exact(m.id))deny('TDLIB_EXACT_MID_REQUIRED');
   const content=m.content;
   if(content?.['@type']!=='messageText'||
     typeof content?.text?.text!=='string')
    deny('TDLIB_NON_TEXT_HANDLED_BY_W23');
   return receive({owner:'TDLIB_JSON',event:x,k:x.k,
    mid:String(m.id),eventScope:String(m.chat_id),
    original:content.text.text,evidence:'OFFICIAL_TDLIB_JSON'});
  },
  onW25Receipt:async()=>Object.freeze({accepted:false,
   status:'PROVIDER_RECEIPT_PENDING_W25_PROOF',canSend:false})
 });
 const mautrix=Object.freeze({
  onNativeBridgeInbound:x=>{
   if(x?.provider!=='MAUTRIX_META_NATIVE'||
     !str(x.matrixEventId)||!str(x.remoteThreadId)||
     x.matrixEventId.startsWith('fake-'))
    deny('MAUTRIX_NATIVE_EVENT_NOT_VERIFIED');
   return receive({owner:'MAUTRIX_META_NATIVE',event:x,k:x.k,
    mid:x.providerMid??x.matrixEventId,eventScope:x.remoteThreadId,
    original:x.original,evidence:x.matrixEventId});
  }
 });
 return Object.freeze({baileys,pancake,tdlib,mautrix});
}
