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

/**
 * W47's read seam to the EXISTING W25 durable historical timeline.
 * Original W24 current K & original W25 consent are checked independently
 * by their owners; no second SQLite or imported/rewritten Agno Run history.
 */
export function createW47WhatsAppW25ReadBridge({w25,resolveLiveW24Principal}={}){
 if(typeof w25?.listHistory!=='function'||
    typeof resolveLiveW24Principal!=='function')return null;
 return async function readW25OriginalInbound({native,session,k,max=250}={}){
  if(!k||k.channel!=='WHATSAPP_PERSONAL'||
    !Number.isSafeInteger(Number(k.binding_revision))||
    Number(k.binding_revision)<1||!Number.isSafeInteger(max)||max<1||max>250)
    throw Error('W47_WA_CURRENT_W24_K_REQUIRED');
  const current=await resolveLiveW24Principal({native,session,k,operation:'READ_HISTORY'});
  if(current?.verified!==true||current.principalId!==native?.principalRef||
     current.channel!=='WHATSAPP_PERSONAL'||
     current.tenant!==k.tenant||current.account!==k.account||
     current.peerId!==k.peer_id||
     String(current.bindingRevision)!==String(k.binding_revision))
    throw Error('W47_WA_LIVE_PRINCIPAL_REQUIRED');
  const originalK=Object.freeze({tenantId:k.tenant,accountId:k.account,
   channel:k.channel,peerId:k.peer_id,bindingRevision:String(k.binding_revision)});
  // W25.listHistory owns the original SQLite transaction, verified source,
  // current contact READ_HISTORY consent & epoch checks for every row.
  const rows=await w25.listHistory({k:originalK,nativePrincipalId:current.principalId,limit:max});
  if(!Array.isArray(rows)||rows.length>max||
     rows.some(x=>x?.k?.tenantId!==originalK.tenantId||
      x?.k?.accountId!==originalK.accountId||
      x?.k?.peerId!==originalK.peerId||
      x?.k?.channel!==originalK.channel||
      x?.k?.bindingRevision!==originalK.bindingRevision))
    throw Error('W47_WA_W25_HISTORY_SCOPE_INVALID');
  const latest=await resolveLiveW24Principal({native,session,k,operation:'READ_HISTORY_AFTER'});
  if(latest?.verified!==true||latest.principalId!==current.principalId||
     latest.accountEpoch!==current.accountEpoch||
     latest.consentEpoch!==current.consentEpoch||
     latest.connectionEpoch!==current.connectionEpoch)
    throw Error('W47_WA_W24_EPOCH_CHANGED_DURING_READ');
  return Object.freeze(rows);
 }
}
