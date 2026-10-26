/**
 * W25's one SQLite inbound ledger, attached to EXISTING MessageDelivery.db.
 * Four real upstream Owners supply their own verified native event adapter.
 * No transport, login, second database, send, synthetic shortcut, or ACK claim.
 */
import {createHash} from 'node:crypto';
const CHANNELS=new Set(['FB_PERSONAL','FB_PAGE','WHATSAPP_PERSONAL','TELEGRAM_PERSONAL']);
const SOURCES=Object.freeze({
  FB_PERSONAL:'mautrix-meta',FB_PAGE:'pancake',
  WHATSAPP_PERSONAL:'baileys',TELEGRAM_PERSONAL:'tdlib-json'
});
const clean=s=>typeof s==='string'&&s.length>0&&s.length<=512&&
  !/[\u0000-\u001f]/.test(s);
const validK=k=>k&&typeof k==='object'&&
  ['tenantId','accountId','channel','peerId','bindingRevision'].every(x=>clean(k[x]))&&
  CHANNELS.has(k.channel)&&/^[1-9][0-9]*$/.test(k.bindingRevision);
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const reject=s=>{throw Error(s)};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const session=x=>x&&x.authorized===true&&x.isNative===true&&
  clean(x.principalId)&&clean(x.accountId)&&clean(x.peerId)&&
  Number.isSafeInteger(x.bindingRevision)&&x.bindingRevision>0&&
  Number.isSafeInteger(x.accountEpoch)&&x.accountEpoch>=0&&
  Number.isSafeInteger(x.consentEpoch)&&x.consentEpoch>0&&
  Number.isSafeInteger(x.connectionEpoch)&&x.connectionEpoch>0;

export function createW25NativeInboundPort({
  delivery, verifyNativeSource, readW24Identity, maxTextBytes=65536
}={}){
 if(typeof delivery?.tx!=='function'||!delivery.db||
   typeof verifyNativeSource!=='function'||typeof readW24Identity!=='function')
   reject('EXISTING_W25_DB_AND_NATIVE_W24_PORTS_REQUIRED');
 if(!Number.isSafeInteger(maxTextBytes)||maxTextBytes<1||maxTextBytes>65536)
   reject('INBOUND_LIMIT_INVALID');
 // Same WAL+FULL W25 file: no new sidecar file or independent Outbox.
 delivery.db.exec([
  'CREATE TABLE IF NOT EXISTS inbound_messages (',
  ' id TEXT PRIMARY KEY, channel TEXT NOT NULL, tenant_id TEXT NOT NULL,',
  ' account_id TEXT NOT NULL, peer_id TEXT NOT NULL, binding_revision TEXT NOT NULL,',
  ' source TEXT NOT NULL, source_event_id TEXT NOT NULL, provider_mid TEXT NOT NULL,',
  ' original_text TEXT NOT NULL, verified_principal TEXT NOT NULL,',
  ' account_epoch INTEGER NOT NULL, consent_epoch INTEGER NOT NULL,',
  ' connection_epoch INTEGER NOT NULL, received_at INTEGER NOT NULL,',
  ' UNIQUE(tenant_id,account_id,channel,peer_id,source,provider_mid),',
  ' UNIQUE(tenant_id,account_id,channel,source,source_event_id)',
  ');'
 ].join(' '));
 const get=delivery.db.prepare('SELECT id,channel,tenant_id,account_id,peer_id,binding_revision,source,source_event_id,provider_mid,original_text,verified_principal,account_epoch,consent_epoch,connection_epoch,received_at FROM inbound_messages WHERE id=?');
 const byMid=delivery.db.prepare('SELECT * FROM inbound_messages WHERE tenant_id=? AND account_id=? AND channel=? AND peer_id=? AND source=? AND provider_mid=?');
 const byEvent=delivery.db.prepare('SELECT * FROM inbound_messages WHERE tenant_id=? AND account_id=? AND channel=? AND source=? AND source_event_id=?');
 const put=delivery.db.prepare('INSERT INTO inbound_messages(id,channel,tenant_id,account_id,peer_id,binding_revision,source,source_event_id,provider_mid,original_text,verified_principal,account_epoch,consent_epoch,connection_epoch,received_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
 const convert=row=>row?Object.freeze({
  id:row.id,
  k:Object.freeze({tenantId:row.tenant_id,accountId:row.account_id,
   channel:row.channel,peerId:row.peer_id,bindingRevision:row.binding_revision}),
  source:row.source,sourceEventId:row.source_event_id,providerMid:row.provider_mid,
  original:row.original_text,accountEpoch:row.account_epoch,
  consentEpoch:row.consent_epoch,connectionEpoch:row.connection_epoch,
  receivedAt:row.received_at
 }):null;
 async function acceptInbound(event){
  if(!event||event.synthetic===true||event.simulated===true||
    !validK(event.k)||!clean(event.providerMid)||!clean(event.sourceEventId)||
    event.source!==SOURCES[event.k.channel]||
    typeof event.original!=='string'||
    Buffer.byteLength(event.original,'utf8')>maxTextBytes)
     reject('VERIFIED_NATIVE_INBOUND_REQUIRED');
  // The FIRST verifier belongs to the real upstream SDK/bridge Owner and
  // MUST verify a legitimate source before exposing bound account/peer.
  const verified=await verifyNativeSource(event);
  if(!session(verified)||verified.accountId!==event.k.accountId||
    verified.peerId!==event.k.peerId||
    String(verified.bindingRevision)!==event.k.bindingRevision||
    verified.channel!==event.k.channel||
    verified.tenantId!==event.k.tenantId||
    verified.source!==event.source)
    reject('UPSTREAM_SOURCE_NOT_AUTHENTICATED');
  // W24 must independently read W44 current K / epochs from the trusted
  // server Actor, NEVER from provider message payload or the browser.
  const proof=await readW24Identity({k:{...event.k},nativePrincipalId:verified.principalId,
    channelAccount:verified.accountId,peerId:verified.peerId});
  if(!proof||proof.valid!==true||proof.identityKey!==
    [event.k.tenantId,event.k.accountId,event.k.channel,event.k.peerId,event.k.bindingRevision].join('|')||
    proof.accountEpoch!==verified.accountEpoch||
    proof.consentEpoch!==verified.consentEpoch||
    proof.bindingRevision!==verified.bindingRevision)
     reject('W24_IDENTITY_BINDING_OR_EPOCH_STALE');
  const source=event.source,mid=event.providerMid,eventId=event.sourceEventId;
  const id=digest([event.k.tenantId,event.k.accountId,event.k.channel,
    event.k.peerId,event.k.bindingRevision,source,mid]);
  return delivery.tx(()=>{
   const existing=byMid.get(event.k.tenantId,event.k.accountId,event.k.channel,
     event.k.peerId,source,mid);
   const replay=byEvent.get(event.k.tenantId,event.k.accountId,event.k.channel,source,eventId);
   if(existing||replay){
    const prior=existing??replay;
    if(prior.id!==id||prior.source_event_id!==eventId||
      prior.binding_revision!==event.k.bindingRevision||
      prior.original_text!==event.original||
      prior.connection_epoch!==verified.connectionEpoch||
      prior.account_epoch!==verified.accountEpoch||
      prior.consent_epoch!==verified.consentEpoch)
       reject('UPSTREAM_MID_OR_EVENT_REPLAY_CONFLICT');
    return Object.freeze({...convert(prior),duplicate:true});
   }
   // Atomic uniqueness across two W25 instances / separate OS processes.
   put.run(id,event.k.channel,event.k.tenantId,event.k.accountId,
     event.k.peerId,event.k.bindingRevision,source,eventId,mid,event.original,
     verified.principalId,verified.accountEpoch,verified.consentEpoch,
     verified.connectionEpoch,Date.now());
   return Object.freeze({...convert(get.get(id)),duplicate:false});
  });
 }
 function getInbound(id){
  if(!clean(id)||!/^[a-f0-9]{64}$/.test(id))reject('INVALID_INBOUND_ID');
  return convert(get.get(id));
 }
 return Object.freeze({acceptInbound,getInbound});
}
