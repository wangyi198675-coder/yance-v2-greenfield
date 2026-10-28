// Same original W25 MessageDelivery SQLite, read/inbound only.
// W28 SDK attests source events; W44 original identity+consent epochs are
// re-read separately on EVERY inbound and history operation.
import {MessageDelivery,SyntheticConnectorSink,createW25NativeInboundPort,
 createW25NativeChannelOwnerPorts} from '../src/domains/message-delivery/index.mjs';
const fail=x=>{throw Object.assign(Error(x),{code:x})};
export function createW47WhatsAppW25Native({
 databasePath,w24,sdkEvidence
}={}){
 if(typeof databasePath!=='string'||!databasePath||
    typeof w24?.readVerifiedPeerByK!=='function'||
    typeof w24?.authorizePrivateRead!=='function'||
    typeof sdkEvidence?.verifySdkMessage!=='function')
  fail('W25_ORIGINAL_NATIVE_PROVENANCE_REQUIRED');
 const delivery=new MessageDelivery({databasePath,
  eligibility:{check:async()=>({allowed:false,reason:'NATIVE_SEND_NOT_AUTHORIZED'})},
  sink:new SyntheticConnectorSink(async()=>{throw Error('W25_REAL_SEND_NOT_ENABLED')}),
  receiptVerifier:async()=>({verified:false})});
 const currentK=async k=>w24.readVerifiedPeerByK({k});
 const sdkAttested=async(event,history)=>{
  if(event?.source!=='baileys'||event?.k?.channel!=='WHATSAPP_PERSONAL'||
     typeof event.original!=='string'||!event.providerRemoteJid)
    fail('W25_BAILEYS_NATIVE_EVENT_REQUIRED');
  const verified=await sdkEvidence.verifySdkMessage({
   providerMid:event.providerMid,providerRemoteJid:event.providerRemoteJid,
   original:event.original,fromMe:history&&event.fromMe===true,isHistory:history,
  });
  if(verified!==true)fail('W25_REAL_SDK_EVENT_NOT_ATTESTED');
  return currentK(event.k);
 };
 const inbound=createW25NativeInboundPort({
  delivery,
  verifyNativeSource:async event=>{
   const history=event.isHistory===true;
   const a=await sdkAttested(event,history);
   return Object.freeze({
    authorized:true,isNative:true,source:'baileys',
    principalId:a.principalId,accountId:a.accountId,peerId:a.peerId,
    tenantId:a.tenantId,channel:a.channel,bindingRevision:a.bindingRevision,
    accountEpoch:a.accountEpoch,consentEpoch:a.consentEpoch,
    connectionEpoch:a.connectionEpoch,historyReadback:history,
    fromMe:history&&event.fromMe===true,selfAccountVerified:history,
    providerTimestampMs:event.providerTimestampMs,
   });
  },
  readW24Identity:async({k,nativePrincipalId})=>{
   const a=await currentK(k);
   if(a.principalId!==nativePrincipalId)fail('W25_CROSS_PRINCIPAL_DENIED');
   return Object.freeze({valid:true,identityKey:[k.tenantId,k.accountId,
    k.channel,k.peerId,k.bindingRevision].join('|'),
    bindingRevision:a.bindingRevision,accountEpoch:a.accountEpoch,
    consentEpoch:a.consentEpoch});
  },
  checkPrivateInboundConsent:async({k,nativePrincipalId,operation})=>{
   const a=await w24.authorizePrivateRead({k,operation});
   if(a.principalId!==nativePrincipalId)fail('W25_CROSS_PRINCIPAL_DENIED');
   return Object.freeze({authorized:true,principalId:a.principalId,
    accountEpoch:a.accountEpoch,consentEpoch:a.consentEpoch,
    bindingRevision:a.bindingRevision});
  },
 });
 const originalOwners=createW25NativeChannelOwnerPorts({
  nativeInboundPort:inbound,
  attestOriginalOwnerEvent:async({owner,rawEvent,k,mid,eventScope})=>{
   if(owner!=='BAILEYS_NATIVE'||rawEvent?.provider!=='BAILEYS_NATIVE'||
      rawEvent.providerMid!==mid||rawEvent.providerRemoteJid!==eventScope||
      rawEvent.provenance!=='BAILEYS_NATIVE_MESSAGES_UPSERT')
    fail('W25_BAILEYS_WRONG_SDK_PROVENANCE');
   if(await sdkEvidence.verifySdkMessage({providerMid:mid,
     providerRemoteJid:eventScope,original:rawEvent.original,
     fromMe:false,isHistory:false})!==true)
    fail('W25_BAILEYS_REAL_EVENT_PROOF_REQUIRED');
   const a=await currentK({tenantId:k.tenant,accountId:k.account,
    channel:k.channel,peerId:k.peer_id,bindingRevision:String(k.binding_revision)});
   return Object.freeze({verified:true,owner,account:k.account,
    peerId:k.peer_id,bindingRevision:k.binding_revision,providerMid:mid,
    principalId:a.principalId,nativeSessionCurrent:true,
    evidenceRef:'BAILEYS_NATIVE_MESSAGES_UPSERT'});
  },
 });
 return Object.freeze({
  delivery,native:inbound,
  acceptInbound:originalOwners.baileys.acceptInbound,
  recordReceipt:originalOwners.baileys.recordReceipt,
  acceptHistory:inbound.acceptHistory,
  listHistory:inbound.listHistory,
  close:()=>delivery.close(),
 });
}
