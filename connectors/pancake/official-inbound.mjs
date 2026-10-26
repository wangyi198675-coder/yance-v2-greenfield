// Production-shaped inbound validation against the ACTUAL authenticated Pancake REST readback.
// This is neither a replacement Messenger protocol nor a listener nor an Outbox.
// The W47 runtime must accept HTTP, W24 authenticate current channel+Page+PSID,
// and the W25/W45 integration must durably accept/dedupe the event.
// An unauthenticated arbitrary webhook body alone NEVER enters the inbox.

import { createHash } from 'node:crypto';
const err=(code)=>Object.assign(new Error(code),{code});
const required=(fn,name)=>{if(typeof fn!=='function')throw err('MISSING_'+name);return fn;};
const safe=(v,name)=>{if(typeof v!=='string'||!v||v.length>512||/[\x00-\x1f\x7f]/.test(v))throw err('INVALID_'+name);return v;};
const digest=(value)=>createHash('sha256').update(value).digest('hex');

export function createAuthenticatedReadbackIngress({
  resolveCurrentPage, resolveCurrentPeer, pancakeRest, deliverToExistingInbound
}) {
  required(resolveCurrentPage,'W24_PAGE_OWNER');
  required(resolveCurrentPeer,'W24_PEER_OWNER');
  required(pancakeRest?.listMessages,'OFFICIAL_PANCAKE_REST_READBACK');
  required(deliverToExistingInbound,'W25_W45_INBOUND');
  return Object.freeze({
    async acceptWebhook(rawBody) {
      if(typeof rawBody!=='string'||Buffer.byteLength(rawBody,'utf8')>64*1024)
        throw err('INVALID_WEBHOOK_BODY');
      let event;
      try { event=JSON.parse(rawBody); } catch { throw err('INVALID_WEBHOOK_JSON'); }
      if(event?.event_type!=='messaging'||!event?.page_id||!event?.data?.message)
        throw err('NOT_SUPPORTED_PANCAKE_MESSAGING');
      const pageId=safe(event.page_id,'PAGE');
      const incoming=event.data.message;
      const conversationId=safe(incoming.conversation_id ?? event.data?.conversation?.id, 'CONVERSATION');
      const messageId=safe(incoming.id,'PROVIDER_MID');
      const inboundPeer=safe(incoming.from?.id,'PAGE_SCOPED_PS_ID');

      // W24 must load from a native, authenticated active account/Page binding.
      // page_id from untrusted webhook is a locator, not ownership proof.
      const page=await resolveCurrentPage({channel:'FB_PAGE',provider:'PANCAKE',providerPageId:pageId});
      if(!page?.verifiedByNativeSession||page?.status!=='ACTIVE'||
         page?.pancakePageId!==pageId||!page?.metaPageId||!page?.channelAccountId||
         !Number.isSafeInteger(page.bindingRevision)||page.bindingRevision<1)
        throw err('NO_TRUSTED_W24_PAGE_BINDING');

      // Native Pancake token lease & HTTPS official Page API authenticate provider state.
      const readback=await pancakeRest.listMessages({pageId,conversationId,currentCount:0});
      if(readback?.status!=='READ_ONLY_PROVIDER_DATA'||
         readback.channelAccountId!==page.channelAccountId||
         readback.pageId!==page.metaPageId)
        throw err('CROSS_ACCOUNT_READBACK_DENIED');
      const exact=(readback.messages || []).filter(m=>String(m.id)===messageId);
      if(exact.length!==1)throw err('NO_VERIFIED_PROVIDER_MESSAGE_READBACK');
      const actual=exact[0];
      const actualPeer=safe(actual.from?.id ?? readback.convFrom?.id ?? readback.conv_from?.id, 'READBACK_SENDER_PS_ID');
      if(actualPeer!==inboundPeer || (actual.conversation_id && actual.conversation_id!==conversationId))
        throw err('PROVIDER_READBACK_PEER_MISMATCH');
      if(typeof incoming.message==='string'&&typeof actual.message==='string'&&incoming.message!==actual.message)
        throw err('PROVIDER_READBACK_CONTENT_MISMATCH');
      const peer=await resolveCurrentPeer({
        channelAccountId:page.channelAccountId,metaPageId:page.metaPageId,
        pageScopedPsid:actualPeer,bindingRevision:page.bindingRevision,
        conversationId,provider:'PANCAKE'
      });
      if(!peer?.verifiedByNativeIdentity || peer.channelAccountId!==page.channelAccountId ||
         peer.metaPageId!==page.metaPageId || peer.pageScopedPsid!==actualPeer ||
         peer.bindingRevision!==page.bindingRevision ||
         !peer.canonicalK || !Number.isSafeInteger(peer.accountRevocationEpoch) ||
         !Number.isSafeInteger(peer.consentEpoch) || peer.revoked === true)
        throw err('NO_TRUSTED_W24_PEER_BINDING');

      const body = typeof actual.message==='string' ? actual.message : '';
      const attachmentMetadata=Array.isArray(actual.attachments) ? actual.attachments.map(a=>({
        type:a.type??null,size:a.size??null,mimeType:a.mime_type??null,
        id:a.id??null
      })) : [];
      // Do not set verifiedMetaMid: a vendor message ID is not a Meta ACK.
      const normalized=Object.freeze({
        channel:'FB_PAGE',source:'PANCAKE_OFFICIAL_READBACK',
        k:peer.canonicalK,channelAccountId:page.channelAccountId,
        metaPageId:page.metaPageId,peerId:actualPeer,conversationId,
        bindingRevision:page.bindingRevision,
        accountRevocationEpoch:peer.accountRevocationEpoch,consentEpoch:peer.consentEpoch,
        providerMid:messageId,verifiedMetaMid:null,
        eventDigest:digest(rawBody),payloadDigest:digest(JSON.stringify({
          pageId,conversationId,messageId,actualPeer,body
        })), original:body, attachmentMetadata,
        inboundProof:'PAGES_FM_AUTHENTICATED_REST_READBACK',
        verifiedProviderReadback:true, verifiedNativePeerBinding:true,
        isSendAck:false, canSend:false
      });
      // W25/W45 owns durable idempotency, translation and Agno dispatch.
      // A duplicate/cancelled/revoked event may return REJECTED from this existing port.
      const receipt=await deliverToExistingInbound(normalized);
      if(!receipt||receipt.accepted!==true||typeof receipt.ingressId!=='string'||!receipt.ingressId)
        throw err('ORIGINAL_NATIVE_INBOUND_NOT_ACCEPTED');
      return Object.freeze({
        status:'ACCEPTED_BY_NATIVE_INBOUND',
        ingressId:receipt.ingressId,channelAccountId:page.channelAccountId,
        providerMid:messageId,verifiedMetaMid:null,
        durableDedupeAuthority:'ORIGINAL_W25_INBOUND',
        sent:false
      });
    }
  });
}

/** Authoritative official source not configured? Fail closed, never spoof signature. */
export function disabledWebhookState() {
  return Object.freeze({
    state:'WAITING_USER_AUTH',signatureVerification:'UNVERIFIED_PUBLIC_VENDOR_SCHEMA',
    authenticatedProviderReadback:'REQUIRES_W24_PAGE_AND_PROVIDER_TOKEN',
    installedPublicListener:false,sendEnabled:false
  });
}
