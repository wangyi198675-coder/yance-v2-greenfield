/** W25 Issue #146, original MessageDelivery native action fence.
 * Audit-hold only: NEVER sends, retries, or marks a provider ACK.
 * Genuine physical actions require a separately signed extension of the
 * original W25 sender plus W44 atomic PRE_NETWORK grant fencing.
 */
import {createHash} from 'node:crypto';
const actions=['REACTION','QUOTE_REPLY','FORWARD','EDIT','REVOKE','PROVIDER_DELETE','MEDIA_ACTION'];
const channels={FB_PERSONAL:'mautrix-meta',FB_PAGE:'pancake',WHATSAPP_PERSONAL:'baileys',TELEGRAM_PERSONAL:'tdlib-json'};
const ok=x=>typeof x==='string'&&x.length>0&&x.length<=512&&!/[\u0000-\u001f]/.test(x);
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const kstr=k=>[k.tenantId,k.accountId,k.channel,k.peerId,k.bindingRevision].join('|');
const denied=code=>{throw Object.assign(new Error(code),{code})};
const parseK=k=>{
 if(!k||!Object.hasOwn(channels,k.channel)||![k.tenantId,k.accountId,k.peerId].every(ok)||
   typeof k.bindingRevision!=='string'||!/^[1-9]\d*$/.test(k.bindingRevision)||
   [k.tenantId,k.accountId,k.peerId].some(v=>v.includes('|')))denied('FULL_K_REQUIRED');
 return Object.freeze({tenantId:k.tenantId,accountId:k.accountId,channel:k.channel,peerId:k.peerId,bindingRevision:k.bindingRevision});
};
function payloadDigest(a,p){
 if(!p||typeof p!=='object'||Array.isArray(p))denied('BAD_OPERATION_PAYLOAD');
 const expected={REACTION:['emoji'],QUOTE_REPLY:['text'],FORWARD:['text'],EDIT:['text'],
 REVOKE:[],PROVIDER_DELETE:[],MEDIA_ACTION:['assetId','mediaType']}[a];
 const keys=Object.keys(p).sort();
 if(keys.length!==expected.length||keys.some(v=>!expected.includes(v)))denied('BAD_OPERATION_PAYLOAD');
 if(a==='REACTION'&&(!ok(p.emoji)||[...p.emoji].length>12))denied('BAD_REACTION');
 if(['QUOTE_REPLY','FORWARD','EDIT'].includes(a)&&(typeof p.text!=='string'||!p.text.length||p.text.length>20000))denied('BAD_TEXT');
 if(a==='MEDIA_ACTION')denied('W23_MEDIA_OWNER_SCOPE_HOLD');
 return sha([a,expected.map(v=>p[v])]); // no raw message body stored
}
export function createW25MessageActionFence({delivery,checkW24,checkW44,checkNativeCapability,now=()=>Date.now()}={}){
 if(!delivery?.db||typeof delivery.tx!=='function'||![checkW24,checkW44,checkNativeCapability].every(x=>typeof x==='function'))
  denied('ORIGINAL_W25_W24_W44_OWNER_PORTS_REQUIRED');
 // An audit table in the EXISTING W25 database, not a second Outbox.
 delivery.tx(()=>delivery.db.exec("CREATE TABLE IF NOT EXISTS message_action_holds("+
  "id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,account_id TEXT NOT NULL,"+
  "channel TEXT NOT NULL,peer_id TEXT NOT NULL,binding_revision TEXT NOT NULL,"+
  "request_id TEXT NOT NULL,action TEXT NOT NULL,provider_mid TEXT NOT NULL,"+
  "source_id TEXT NOT NULL,target_key TEXT,actor_id TEXT NOT NULL,"+
  "session_id TEXT NOT NULL,mode TEXT NOT NULL,payload_hash TEXT NOT NULL,"+
  "authority_hash TEXT NOT NULL,operation_hash TEXT NOT NULL,"+
  "state TEXT NOT NULL CHECK(state='HELD_FOR_PROVIDER_OWNER'),created_at INTEGER NOT NULL,"+
  "UNIQUE(tenant_id,account_id,channel,peer_id,request_id),"+
  "UNIQUE(tenant_id,account_id,channel,peer_id,operation_hash))"));
 const src=delivery.db.prepare('SELECT * FROM inbound_messages WHERE tenant_id=? AND account_id=? AND channel=? AND peer_id=? AND binding_revision=? AND source=? AND provider_mid=?');
 const byId=delivery.db.prepare('SELECT * FROM message_action_holds WHERE id=?');
 const byReq=delivery.db.prepare('SELECT * FROM message_action_holds WHERE tenant_id=? AND account_id=? AND channel=? AND peer_id=? AND request_id=?');
 const byHash=delivery.db.prepare('SELECT * FROM message_action_holds WHERE tenant_id=? AND account_id=? AND channel=? AND peer_id=? AND operation_hash=?');
 const put=delivery.db.prepare('INSERT INTO message_action_holds VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
 const dto=(r,duplicate=false)=>Object.freeze({id:r.id,action:r.action,providerMid:r.provider_mid,
   state:r.state,duplicate,canSend:false,canAutoRetry:false,providerAckVerified:false});
 async function auth(k,actorId,sessionId,action,mode,mid,target){
  const proof=await checkW24({k,actorId,sessionId,action,phase:'ADMISSION'});
  const trusted=(p,x)=>p?.valid===true&&p.strictDurable===true&&p.accountActive===true&&
    p.actorId===actorId&&p.sessionId===sessionId&&p.identityKey===kstr(x)&&
    p.channelAccountId===x.accountId&&p.peerId===x.peerId&&
    p.bindingRevision===x.bindingRevision&&ok(p.accountEpoch)&&ok(p.consentEpoch)&&
    Number.isSafeInteger(p.expiresAt)&&p.expiresAt>now();
  if(!trusted(proof,k))denied('W24_CURRENT_ACTOR_ACCOUNT_PEER_EPOCH_DENIED');
  if(target){
   if(target.tenantId!==k.tenantId||target.accountId!==k.accountId||
      target.channel!==k.channel)denied('FORWARD_CROSS_ACCOUNT_HOLD');
   if(!trusted(await checkW24({k:target,actorId,sessionId,action:'FORWARD_TARGET',phase:'ADMISSION'}),target))
      denied('FORWARD_TARGET_NOT_AUTHORIZED');
  }
  const g=await checkW44({k,actorId,sessionId,action,mode,sourceProviderMid:mid,
    targetK:target,phase:'ADMISSION'});
  if(g?.allowed!==true||g.actorId!==actorId||g.identityKey!==kstr(k)||
     g.accountEpoch!==proof.accountEpoch||g.consentEpoch!==proof.consentEpoch||
     !ok(g.custodyEpoch)||!ok(g.grantRevision)||
     !Number.isSafeInteger(g.expiresAt)||g.expiresAt<=now()||
     (mode==='HUMAN'&&g.humanAuthorized!==true)||
     (mode==='AUTO'&&(g.agentActive!==true||g.grantActive!==true||!ok(g.agentRevision))))
    denied('W44_GRANT_AGENT_OPERATION_SCOPE_DENIED');
  return sha([proof.accountEpoch,proof.consentEpoch,g.custodyEpoch,
    g.grantRevision,g.agentRevision??null,mode]);
 }
 async function prepare({k:rawK,action,providerMid,requestId,actorId,sessionId,
   mode='HUMAN',targetK:rawTarget,payload={}}={}){
  const k=parseK(rawK);
  if(!actions.includes(action))denied(action==='LOCAL_DELETE'?
    'LOCAL_DELETE_REQUIRES_CONVERSATION_DB_OWNER':'UNKNOWN_PROVIDER_ACTION');
  if(![providerMid,requestId,actorId,sessionId].every(ok)||!['HUMAN','AUTO'].includes(mode))
    denied('INVALID_ACTION_REQUEST');
  if((rawTarget!==undefined)!==(action==='FORWARD'))denied('FORWARD_TARGET_REQUIRED');
  const target=rawTarget===undefined?null:parseK(rawTarget);
  const digest=payloadDigest(action,payload);
  const authority=await auth(k,actorId,sessionId,action,mode,providerMid,target);
  const original=src.get(k.tenantId,k.accountId,k.channel,k.peerId,k.bindingRevision,channels[k.channel],providerMid);
  if(!original)denied('ORIGINAL_PROVIDER_MID_NOT_VERIFIED');
  if(['EDIT','REVOKE'].includes(action)&&original.from_me!==1)
    denied('ONLY_OWN_SENT_MESSAGE_CAN_EDIT_OR_REVOKE');
  const cap=await checkNativeCapability({k,action,providerMid,
    fromMe:original.from_me===1,targetK:target,actorId});
  if(cap?.verified!==true||cap.channel!==k.channel||
    cap.accountId!==k.accountId||cap.providerMid!==providerMid||
    cap.action!==action||cap.status!=='SIGNED_CAPABILITY_PRESENT')
    denied('NATIVE_PROVIDER_CAPABILITY_NOT_WIRED');
  const operationHash=sha([k,action,providerMid,target,digest,mode]);
  const id=sha([k,requestId]),cols=[k.tenantId,k.accountId,k.channel,k.peerId];
  return delivery.tx(()=>{
   const r=byReq.get(...cols,requestId);
   if(r){
    if(r.operation_hash!==operationHash||r.authority_hash!==authority||
      r.actor_id!==actorId||r.session_id!==sessionId||r.binding_revision!==k.bindingRevision)
     denied('NATIVE_ACTION_REQUEST_CONFLICT');
    return dto(r,true);
   }
   const existing=byHash.get(...cols,operationHash);
   if(existing){
    if(existing.authority_hash!==authority)denied('OPERATION_AUTHORITY_VERSION_CONFLICT');
    if(existing.actor_id!==actorId||existing.session_id!==sessionId)
      denied('NATIVE_ACTION_CONCURRENT_ACTOR_CONFLICT');
    return dto(existing,true);
   }
   put.run(id,...cols,k.bindingRevision,requestId,action,providerMid,original.id,
    target?JSON.stringify(target):null,actorId,sessionId,mode,digest,authority,
    operationHash,'HELD_FOR_PROVIDER_OWNER',now());
   return dto(byId.get(id));
  });
 }
 async function getStatus({k:rawK,id,actorId,sessionId}={}){
  const k=parseK(rawK);
  if(![id,actorId,sessionId].every(ok))denied('OPERATION_STATUS_ACTOR_REQUIRED');
  const row=byId.get(id);
  if(!row)return null;
  if([row.tenant_id,row.account_id,row.channel,row.peer_id,row.binding_revision].join('|')!==kstr(k))
    denied('OPERATION_STATUS_CROSS_ACCOUNT_DENIED');
  const target=row.target_key?parseK(JSON.parse(row.target_key)):null;
  const currentAuthority=await auth(k,actorId,sessionId,row.action,row.mode,row.provider_mid,target);
  if(currentAuthority!==row.authority_hash)denied('OPERATION_HOLD_AUTHORITY_STALE');
  if(row.actor_id!==actorId||row.session_id!==sessionId)
    denied('OPERATION_STATUS_ACTOR_DENIED');
  return dto(row);
 }
 return Object.freeze({
  prepare,getStatus,
  matrix:()=>Object.freeze({
   REACTION:'NOT_WIRED',QUOTE_REPLY:'COMPOSER_MID_ONLY',FORWARD:'NOT_WIRED',
   EDIT:'NOT_WIRED',REVOKE:'NOT_WIRED',PROVIDER_DELETE:'NOT_WIRED',
   LOCAL_DELETE:'CONVERSATION_DB_OWNER',LOCAL_FAVORITE:'CONVERSATION_DB_OWNER',
   MEDIA_ACTION:'W23_AND_PROVIDER_HOLD'
  }),
  // Even a signed-looking callback cannot bypass the absence of a linked
  // original W25 network attempt and authentic provider receipt verifier.
  recordProviderReceipt:()=>denied('NO_LINKED_W25_PROVIDER_ATTEMPT'),
  dispatch:()=>denied('SECOND_SENDER_FORBIDDEN')
 });
}
