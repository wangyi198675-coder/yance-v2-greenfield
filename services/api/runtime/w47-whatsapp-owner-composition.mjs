// One genuine W47 original-owner composition. No new W24/W55/SDK system.
// Only the private W54 host or original W47 code may supply these functions.
// A caller may omit a missing port; result is null, NOT a test-connected login.
import {createW47WhatsAppNativeRoute} from './w47-whatsapp-native-route.mjs';
import {createW47WhatsAppW25HistoryAdapter} from './w47-whatsapp-w25-history.mjs';

const fn=x=>typeof x==='function';
export async function createW47WhatsAppOwnerComposition({
  w54, w24, w25, w55Executable, qaEnv
}={}){
 if(!w54||!w24||!w25||typeof w55Executable!=='string'||
   !['verifyNativeSession','resolveSignedNativeSession'].every(x=>fn(w54[x]))||
   !['authorizeStart','assertCurrent','resolveTrustedScope',
     'assertSignalCurrent','revokeApprovedAccount'].every(x=>fn(w24[x]))||
   !['resolveAccount','resolvePeer','bindObservedPeer','recordVerifiedPeer'].every(x=>fn(w24.identity?.[x]))||
   !['acceptInbound','recordReceipt','acceptHistory'].every(x=>fn(w25[x]))
 ) return null;
 const [{createNativeBaileysWorker},{createW55BaileysDpapiAuthStore}]=await Promise.all([
  import('../../../connectors/baileys/native-worker.mjs'),
  import('./w55-baileys-dpapi-stdio.mjs'),
 ]);
 const protectedStore=createW55BaileysDpapiAuthStore({
  executable:w55Executable,resolveTrustedScope:w24.resolveTrustedScope,
  assertCurrent:w24.assertSignalCurrent,...(qaEnv?{qaEnv}:{}),
 });
 const history=createW47WhatsAppW25HistoryAdapter({nativeHistoryPort:w25});
 const createWorker=({onState,onQr})=>createNativeBaileysWorker({
  authorization:Object.freeze({
   authorizeStart:w24.authorizeStart,assertCurrent:w24.assertCurrent,
  }),
  authStore:Object.freeze({
   open:protectedStore.open,
   revoke:async({binding})=>{
    // W55 irreversible old-Signal tombstone FIRST, even if W24 is already
    // revoked; W24 must then persist identity/consent epoch revocation.
    await protectedStore.revoke({binding});
    const result=await w24.revokeApprovedAccount({binding});
    if(result?.revoked!==true)throw Error('W24_ACCOUNT_REVOKE_NOT_CONFIRMED');
   },
  }),
  identity:w24.identity,
  inbound:Object.freeze({
   acceptInbound:w25.acceptInbound,
   recordReceipt:w25.recordReceipt,
   acceptHistory:history.acceptHistory,
  }),
  observed:Object.freeze({onState,onQr}),
 });
 return createW47WhatsAppNativeRoute({
  createWorker,verifyNativeSession:w54.verifyNativeSession,
  resolveSignedNativeSession:w54.resolveSignedNativeSession,
 });
}
