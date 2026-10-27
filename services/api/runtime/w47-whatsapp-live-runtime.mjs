/**
 * Actual installed W54 -> original W44 + W28 + W55 + W25 single-owner graph.
 * No new SQLite model: calls original W44/W25 constructors & original Agno port.
 * W47 fixed listener mounts this only for a real W54 signed native launch.
 */
import {join} from 'node:path';
import {mkdirSync} from 'node:fs';
import {openEligibilityStore} from '../src/domains/grant-custody-budget/index.mjs';
import {createW47WhatsAppCurrentSessionPort} from './w47-whatsapp-current-session.mjs';
import {createW47WhatsAppW24Bridge} from './w47-whatsapp-w24-bridge.mjs';
import {createW47WhatsAppW25Native} from './w47-whatsapp-w25-native.mjs';
import {createW47WhatsAppOwnerComposition,
 createW47WhatsAppW25ReadBridge} from './w47-whatsapp-owner-composition.mjs';

export async function createW47WhatsAppLiveRuntime({
 nativeBoot,nativeSession,sessionAuthority,webOrigin,w55Executable
}={}){
 if(nativeBoot?.source!=='W54_NATIVE_CURRENT_USER'||!nativeSession||
   typeof w55Executable!=='string'||!w55Executable)return null;
 const w54=createW47WhatsAppCurrentSessionPort({
  sessionAuthority,nativeBoot,nativeSession,webOrigin});
 if(!w54)return null;
 // Original W44 identity grant/custody SQLite, never an independent native
 // WhatsApp account DB. Original W25 MessageDelivery holds chat/Outbox rows.
 const storeRoot=join(nativeBoot.appLocalDataRoot,'NativeOwners');
 mkdirSync(storeRoot,{recursive:true});
 const [{createW28VerifiedSocketEvidence}]=await Promise.all([
  import('../../../connectors/baileys/verified-socket-port.mjs')
 ]);
 const sdkEvidence=createW28VerifiedSocketEvidence();
 let w44=null,w25=null;
 try{
  w44=openEligibilityStore({
   path:join(storeRoot,'W44-Authority.sqlite'),
   requireDurableIdentity:true,
   authorizeMutation:()=>false,
   officialWhatsAppOwner:{
    verifyCurrentOwner:w54.assertCurrentNativeUser,
    verifySdkSelf:sdkEvidence.verifySdkSelf,
    verifySdkPeer:sdkEvidence.verifySdkPeer,
   },
  });
  const w24=createW47WhatsAppW24Bridge({w44,w54,nativeBoot,sdkEvidence});
  if(!w24)throw Error('W47_W24_REAL_OWNER_NOT_AVAILABLE');
  w25=createW47WhatsAppW25Native({
   databasePath:join(storeRoot,'W25-MessageDelivery.sqlite'),
   w24,sdkEvidence,
  });
  const handler=await createW47WhatsAppOwnerComposition({
   w54,w24,w25,sdkEvidence,w55Executable
  });
  if(!handler)throw Error('W47_W28_NATIVE_OWNER_GRAPH_NOT_READY');
  const accountRef='wa_'+w24.binding.accountId.slice(3);
  const identityKey=k=>[k.tenant,k.account,k.channel,k.peer_id,k.binding_revision].join('|');
  const resolveW54CurrentUser=async({session})=>{
   if(session?.record?.kind!=='NATIVE_FIRST_PARTY'||
      session.record.nativeHostBinding!==nativeSession.binding)
    throw Error('W54_AUTHORIZED_LOCAL_SESSION_REQUIRED');
   return Object.freeze({verified:true,source:'W54_NATIVE_CURRENT_USER',
    principalRef:nativeBoot.principalRef,installationRef:nativeBoot.installationRef,
    revocationGeneration:nativeBoot.nativeRevocationGeneration});
  };
  const readW24AuthorizedAccounts=async()=>{
   const current=await w24.readCurrent();
   if(current?.verified!==true||sdkEvidence.state().opened!==true)return [];
   return [Object.freeze({accountRef,channel:'WHATSAPP_PERSONAL',
    authorization:'ONLINE_VERIFIED',ownerPrincipalRef:nativeBoot.principalRef,
    tenant:w24.binding.tenantId,accountId:w24.binding.accountId})];
  };
  const readW24VerifiedContacts=async()=>{
   const rows=await w24.listPeers();
   if(rows.verified!==true)return [];
   return rows.contacts.map(contact=>Object.freeze({
    accountRef,channel:'WHATSAPP_PERSONAL',peerRef:contact.peerId,
    bindingRevision:contact.k.binding_revision,
    displayName:contact.peerId,
    identity:contact.k,identityKey:identityKey(contact.k),
    w24CurrentKVerified:true,w24ConsentCurrent:true,
   }));
  };
  const resolveW24CurrentFullK=async({native,selector})=>{
   const parts=typeof selector==='string'?selector.split('|'):[];
   if(parts.length!==5)throw Error('W24_WHATSAPP_FULL_K_SELECTOR_INVALID');
   const k={tenant:parts[0],account:parts[1],channel:parts[2],
    peer_id:parts[3],binding_revision:Number(parts[4])};
   const p=await w24.readVerifiedPeerByK({k:{tenantId:k.tenant,accountId:k.account,
    channel:k.channel,peerId:k.peer_id,bindingRevision:String(k.binding_revision)}});
   if(native?.principalRef!==p.principalId||identityKey(k)!==selector)
    throw Error('W24_WHATSAPP_CURRENT_CONTACT_REQUIRED');
   return k;
  };
  const bridge=createW47WhatsAppW25ReadBridge({
   w25,resolveLiveW24Principal:async({native,k})=>{
    const p=await w24.authorizePrivateRead({
     k:{tenantId:k.tenant,accountId:k.account,channel:k.channel,
      peerId:k.peer_id,bindingRevision:String(k.binding_revision)},
     operation:'READ_HISTORY'});
    return Object.freeze({verified:true,principalId:p.principalId,
     tenant:p.tenantId,account:p.accountId,channel:p.channel,peerId:p.peerId,
     bindingRevision:p.bindingRevision,accountEpoch:p.accountEpoch,
     consentEpoch:p.consentEpoch,connectionEpoch:p.connectionEpoch});
   },
  });
  return Object.freeze({handler,w54,w24,w25,
   resolveW54CurrentUser,readW24AuthorizedAccounts,readW24VerifiedContacts,
   resolveW24CurrentFullK,readW25OriginalInbound:bridge,
   close:()=>{w25.close();w44.close()}});
 }catch(e){
  try{w25?.close()}catch{}
  try{w44?.close()}catch{}
  throw e;
 }
}
