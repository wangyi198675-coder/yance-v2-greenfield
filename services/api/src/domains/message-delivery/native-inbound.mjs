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
  delivery, verifyNativeSource, readW24Identity, checkPrivateInboundConsent, maxTextBytes=65536
}={}){
 if(typeof delivery?.tx!=='function'||!delivery.db||
   typeof verifyNativeSource!=='function'||typeof readW24Identity!=='function'||
   typeof checkPrivateInboundConsent!=='function')
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
  ' from_me INTEGER NOT NULL DEFAULT 0, is_history INTEGER NOT NULL DEFAULT 0,',
  ' message_at INTEGER NOT NULL DEFAULT 0,',
  ' UNIQUE(tenant_id,account_id,channel,peer_id,source,provider_mid),',
  ' UNIQUE(tenant_id,account_id,channel,source,source_event_id)',
  ');'
 ].join(' '));
 // Idempotent, serialized migration of the ORIGINAL inbound ledger; old live
 // messages default to incoming, no second store and no backfill notifications.
 delivery.tx(()=>{
  const columns=new Set(delivery.db.prepare('PRAGMA table_info(inbound_messages)').all().map(x=>x.name));
  if(!columns.has('from_me'))delivery.db.exec('ALTER TABLE inbound_messages ADD COLUMN from_me INTEGER NOT NULL DEFAULT 0');
  if(!columns.has('is_history'))delivery.db.exec('ALTER TABLE inbound_messages ADD COLUMN is_history INTEGER NOT NULL DEFAULT 0');
  if(!columns.has('message_at'))delivery.db.exec('ALTER TABLE inbound_messages ADD COLUMN message_at INTEGER NOT NULL DEFAULT 0');
 });
 const get=delivery.db.prepare('SELECT id,channel,tenant_id,account_id,peer_id,binding_revision,source,source_event_id,provider_mid,original_text,verified_principal,account_epoch,consent_epoch,connection_epoch,received_at,from_me,is_history,message_at FROM inbound_messages WHERE id=?');
 const byMid=delivery.db.prepare('SELECT * FROM inbound_messages WHERE tenant_id=? AND account_id=? AND channel=? AND peer_id=? AND source=? AND provider_mid=?');
 const byEvent=delivery.db.prepare('SELECT * FROM inbound_messages WHERE tenant_id=? AND account_id=? AND channel=? AND source=? AND source_event_id=?');
 const put=delivery.db.prepare('INSERT INTO inbound_messages(id,channel,tenant_id,account_id,peer_id,binding_revision,source,source_event_id,provider_mid,original_text,verified_principal,account_epoch,consent_epoch,connection_epoch,received_at,from_me,is_history,message_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
 const historyRows=delivery.db.prepare('SELECT id FROM inbound_messages WHERE tenant_id=? AND account_id=? AND channel=? AND peer_id=? AND binding_revision=? ORDER BY COALESCE(NULLIF(message_at,0),received_at) DESC,id DESC LIMIT ?');
 const statusRows=delivery.db.prepare('SELECT i.id,i.business_id,i.mode,i.state,i.denial_code,i.updated_at,a.id AS attempt_id,a.state AS attempt_state,a.provider_mid FROM send_intents i LEFT JOIN outbox_attempts a ON a.intent_id=i.id WHERE i.tenant_id=? AND i.account_id=? AND i.channel=? AND i.peer_id=? AND i.binding_revision=? ORDER BY i.updated_at DESC,i.id DESC LIMIT ?');
 const convert=row=>row?Object.freeze({
  id:row.id,
  k:Object.freeze({tenantId:row.tenant_id,accountId:row.account_id,
   channel:row.channel,peerId:row.peer_id,bindingRevision:row.binding_revision}),
  source:row.source,sourceEventId:row.source_event_id,providerMid:row.provider_mid,
  original:row.original_text,accountEpoch:row.account_epoch,
  consentEpoch:row.consent_epoch,connectionEpoch:row.connection_epoch,
  receivedAt:row.received_at,
  messageAt:row.message_at>0?row.message_at:row.received_at,
  timeSource:row.message_at>0?'VERIFIED_PROVIDER_TIMESTAMP':'LOCAL_RECEIPT_FALLBACK',
  fromMe:row.from_me===1,
  direction:row.from_me===1?'OUTBOUND':'INBOUND',
  isHistory:row.is_history===1,triggerReply:false,
  // A provider-history item is evidence of history only, not an Outbox ACK.
  deliveryState:row.from_me===1?'PROVIDER_HISTORY_UNRECONCILED':'NOT_REQUESTED'
 }):null;
 async function storeNative(event,{history=false}={}){
  if(history && (event?.isHistory!==true||typeof event?.fromMe!=='boolean'))
    reject('NATIVE_HISTORY_DIRECTION_REQUIRED');
  if(!history && (event?.fromMe===true||event?.isHistory===true))
    reject('HISTORY_MUST_USE_ACCEPT_HISTORY');
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
    verified.source!==event.source||
    (history && (verified.historyReadback!==true||verified.fromMe!==event.fromMe||
      (event.fromMe && verified.selfAccountVerified!==true)))||
    (event.providerTimestampMs!==undefined &&
      (!Number.isSafeInteger(event.providerTimestampMs)||event.providerTimestampMs<=0||
       event.providerTimestampMs>Date.now()+86400000||
       verified.providerTimestampMs!==event.providerTimestampMs)))
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
  // Current account/epoch alone does not authorize storing private text.
  // W24/W47 must validate the user's explicit inbound privacy scope.
  const privacy=await checkPrivateInboundConsent({k:{...event.k},
    nativePrincipalId:verified.principalId,providerMid:event.providerMid,
    operation:history?'PERSIST_HISTORY':'PERSIST_INBOUND',fromMe:history&&event.fromMe});
  if(privacy?.authorized!==true||privacy.principalId!==verified.principalId||
    privacy.consentEpoch!==proof.consentEpoch||privacy.accountEpoch!==proof.accountEpoch||
    String(privacy.bindingRevision)!==event.k.bindingRevision)
    reject('PRIVATE_INBOUND_CONSENT_REQUIRED');
  const source=event.source,mid=event.providerMid,eventId=event.sourceEventId;
  const id=digest([event.k.tenantId,event.k.accountId,event.k.channel,
    event.k.peerId,event.k.bindingRevision,source,mid]);
  return delivery.tx(()=>{
   const existing=byMid.get(event.k.tenantId,event.k.accountId,event.k.channel,
     event.k.peerId,source,mid);
   const replay=byEvent.get(event.k.tenantId,event.k.accountId,event.k.channel,source,eventId);
   if(existing||replay){
    const prior=existing??replay;
    if(prior.id!==id||(!history&&prior.source_event_id!==eventId)||
      prior.binding_revision!==event.k.bindingRevision||
      prior.original_text!==event.original||
      prior.connection_epoch!==verified.connectionEpoch||
      prior.account_epoch!==verified.accountEpoch||
      prior.consent_epoch!==verified.consentEpoch||
      prior.from_me!==(history&&event.fromMe?1:0)||
      (event.providerTimestampMs!==undefined && prior.message_at>0&&
       prior.message_at!==event.providerTimestampMs))
       reject('UPSTREAM_MID_OR_EVENT_REPLAY_CONFLICT');
    return Object.freeze({...convert(prior),duplicate:true});
   }
   // Atomic uniqueness across two W25 instances / separate OS processes.
   put.run(id,event.k.channel,event.k.tenantId,event.k.accountId,
     event.k.peerId,event.k.bindingRevision,source,eventId,mid,event.original,
     verified.principalId,verified.accountEpoch,verified.consentEpoch,
     verified.connectionEpoch,Date.now(),history&&event.fromMe?1:0,history?1:0,
     event.providerTimestampMs??0);
   return Object.freeze({...convert(get.get(id)),duplicate:false});
  });
 }
 async function acceptInbound(event){return storeNative(event);}
 async function acceptHistory(event){
  return Object.freeze({...await storeNative(event,{history:true}),
    triggerReply:false,createsSendIntent:false,providerAckVerified:false});
 }
 async function getInbound({id,nativePrincipalId}={}){
  if(!clean(id)||!/^[a-f0-9]{64}$/.test(id)||
    !clean(nativePrincipalId))reject('TRUSTED_INBOUND_READ_REQUIRED');
  const row=get.get(id);
  if(!row)return null;
  const k={tenantId:row.tenant_id,accountId:row.account_id,
    channel:row.channel,peerId:row.peer_id,bindingRevision:row.binding_revision};
  // No naked ID-based read of private incoming message content. The trusted
  // local app/session and original W24 current binding are required again.
  const authority=await readW24Identity({k,nativePrincipalId,
    channelAccount:k.accountId,peerId:k.peerId});
  if(authority?.valid!==true||
    authority.identityKey!==[k.tenantId,k.accountId,k.channel,k.peerId,k.bindingRevision].join('|')||
    authority.accountEpoch!==row.account_epoch||
    authority.consentEpoch!==row.consent_epoch)
    reject('PRIVATE_INBOUND_READ_AUTHORIZATION_STALE');
  const privacy=await checkPrivateInboundConsent({k,nativePrincipalId,
    providerMid:row.provider_mid,operation:row.is_history===1?'READ_HISTORY':'READ_INBOUND'});
  if(privacy?.authorized!==true||privacy.principalId!==nativePrincipalId||
    privacy.consentEpoch!==row.consent_epoch||privacy.accountEpoch!==row.account_epoch||
    String(privacy.bindingRevision)!==k.bindingRevision)
    reject('PRIVATE_INBOUND_CONSENT_REQUIRED');
  return convert(row);
 }
 async function listHistory({k,nativePrincipalId,limit=50}={}){
  if(!validK(k)||!clean(nativePrincipalId)||!Number.isSafeInteger(limit)||
    limit<1||limit>250)reject('TRUSTED_HISTORY_QUERY_REQUIRED');
  // Empty and nonempty histories BOTH require a current W24 full-K and
  // separate private READ_HISTORY scope; selector alone never authorizes.
  const authority=await readW24Identity({k:{...k},nativePrincipalId,
    channelAccount:k.accountId,peerId:k.peerId});
  if(authority?.valid!==true||authority.identityKey!==
    [k.tenantId,k.accountId,k.channel,k.peerId,k.bindingRevision].join('|'))
    reject('HISTORY_W24_K_NOT_CURRENT');
  const privacy=await checkPrivateInboundConsent({k:{...k},nativePrincipalId,
    operation:'READ_HISTORY'});
  if(privacy?.authorized!==true||privacy.principalId!==nativePrincipalId||
    privacy.consentEpoch!==authority.consentEpoch||
    privacy.accountEpoch!==authority.accountEpoch||
    String(privacy.bindingRevision)!==k.bindingRevision)
    reject('PRIVATE_INBOUND_CONSENT_REQUIRED');
  // For each existing row, getInbound rechecks W24 binding and consent.
  const candidates=historyRows.all(k.tenantId,k.accountId,k.channel,
    k.peerId,k.bindingRevision,limit);
  const rows=[];
  for(const {id} of candidates){
   const row=await getInbound({id,nativePrincipalId});
   if(!row||JSON.stringify(row.k)!==JSON.stringify(k))reject('HISTORY_K_STALE');
   rows.push(row);
  }
  return Object.freeze(rows.reverse()); // Oldest first for unique Composer.
 }
 async function listSendStatus({k,nativePrincipalId,limit=50}={}){
  if(!validK(k)||!clean(nativePrincipalId)||!Number.isSafeInteger(limit)||
    limit<1||limit>250)reject('TRUSTED_SEND_STATUS_QUERY_REQUIRED');
  const a=await readW24Identity({k:{...k},nativePrincipalId,
    channelAccount:k.accountId,peerId:k.peerId});
  if(a?.valid!==true||a.identityKey!==[k.tenantId,k.accountId,k.channel,k.peerId,k.bindingRevision].join('|'))
    reject('SEND_STATUS_W24_K_NOT_CURRENT');
  const p=await checkPrivateInboundConsent({k:{...k},nativePrincipalId,
    operation:'READ_SEND_STATUS'});
  if(p?.authorized!==true||p.principalId!==nativePrincipalId||
    p.accountEpoch!==a.accountEpoch||p.consentEpoch!==a.consentEpoch||
    String(p.bindingRevision)!==k.bindingRevision)
    reject('SEND_STATUS_PRIVATE_READ_DENIED');
  return Object.freeze(statusRows.all(k.tenantId,k.accountId,k.channel,
   k.peerId,k.bindingRevision,limit).map(r=>Object.freeze({
    intentId:r.id,businessMessageId:r.business_id,mode:r.mode,
    state:r.state,denialCode:r.denial_code??null,
    attemptId:r.attempt_id??null,providerMid:r.provider_mid??null,
    attemptState:r.attempt_state??null,updatedAt:r.updated_at,
    isDraft:false,canAutoRetry:false
  })));
 }
 return Object.freeze({acceptInbound,acceptHistory,getInbound,listHistory,listSendStatus});
}
