// W47 thin adaptation between W28 original Baileys event DTO and W25's
// EXISTING durable native-history port. Never creates an account, a Sender,
// a second database, SDK evidence, authorization, or provider ACK.
import {createHash} from 'node:crypto';
const fail=c=>{throw Object.assign(new Error(c),{code:c})};
const valid=s=>typeof s==='string'&&s.length>0&&s.length<=512;
const keyFields=['tenant','account','peer_id','channel','binding_revision'];
const normalize=x=>{
 if(!x||x.provider!=='BAILEYS_NATIVE'||!x.k||
   x.k.channel!=='WHATSAPP_PERSONAL'||keyFields.some(n=>!valid(String(x.k[n]??'')))||
   !valid(x.providerMid)||x.providerMid.length>256||
   !['INBOUND','OUTBOUND'].includes(x.direction)||typeof x.fromMe!=='boolean'||
   x.fromMe!==(x.direction==='OUTBOUND')||
   x.provenance!=='BAILEYS_NATIVE_MESSAGING_HISTORY_SET'||
   x.canSend!==false||typeof x.original!=='string')
   fail('W28_HISTORY_OWNER_DTO_INVALID');
 const r=x.k;
 if(!Number.isSafeInteger(r.binding_revision)||r.binding_revision<=0)
   fail('W28_HISTORY_W24_K_INVALID');
 if(x.timestampSec!==null&&x.timestampSec!==undefined&&
    (!Number.isSafeInteger(x.timestampSec)||x.timestampSec<1))
   fail('W28_HISTORY_PROVIDER_TIME_INVALID');
 const k=Object.freeze({tenantId:r.tenant,accountId:r.account,
   channel:r.channel,peerId:r.peer_id,bindingRevision:String(r.binding_revision)});
 const eventId=createHash('sha256').update(JSON.stringify([k,x.providerMid,'WA_HISTORY'])).digest('hex');
 return Object.freeze({k,source:'baileys',sourceEventId:'wa-history-'+eventId,
   providerMid:x.providerMid,providerRemoteJid:x.providerRemoteJid,
   original:x.original,synthetic:false,
   isHistory:true,fromMe:x.fromMe,
   ...(x.timestampSec?{providerTimestampMs:x.timestampSec*1000}:{}),
 });
};
export function createW47WhatsAppW25HistoryAdapter({nativeHistoryPort}={}){
 if(typeof nativeHistoryPort?.acceptHistory!=='function')
   fail('W25_ORIGINAL_HISTORY_PORT_REQUIRED');
 return Object.freeze({
  acceptHistory:async item=>{
   const normalized=normalize(item);
   // W25 independently verifies genuine SDK, W24 full K, consent/epochs,
   // and transactionally persists; no boolean is invented by this adapter.
   const reply=await nativeHistoryPort.acceptHistory(normalized);
   if(!reply?.id||typeof reply.duplicate!=='boolean'||
      reply.isHistory!==true||reply.triggerReply!==false||
      reply.providerAckVerified!==false)
     fail('W25_DURABLE_HISTORY_RECEIPT_REQUIRED');
   return Object.freeze({persisted:true,duplicate:reply.duplicate,
     receiptId:reply.id,canSend:false});
  },
 });
}
