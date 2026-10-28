/**
 * W44 official-Baileys identity projection, on W44 ORIGINAL SQLite connection.
 * Existing synthetic-only W24 K / budget & sender policies remain unchanged.
 * A signed local owner session may stage pairing, but ONLY actual W28 SDK self
 * and peer events can populate the verified W44 account/peer tables.
 */
import {createHash} from 'node:crypto';
const fail=reason=>{throw Object.assign(Error(reason),{code:reason})};
const bounded=s=>typeof s==='string'&&s.length>=8&&s.length<=180&&
  /^[A-Za-z0-9_.:@-]+$/.test(s);
const jid=s=>typeof s==='string'&&/^\d{4,18}(?::\d{1,4})?@(s\.whatsapp\.net|lid)$/.test(s);
const hash=s=>createHash('sha256').update(s).digest('hex');
const proof=(prefix,raw)=>prefix+hash(raw);
const CHANNEL='WHATSAPP_PERSONAL';
const requireBinding=b=>{
 if(!b||!bounded(b.tenantId)||!bounded(b.accountId)||!bounded(b.principalRef)||
   !Number.isSafeInteger(b.bindingRevision)||b.bindingRevision<1||
   !Number.isSafeInteger(b.accountRevocationEpoch)||b.accountRevocationEpoch<0||
   b.channel!==CHANNEL)fail('W44_WHATSAPP_BINDING_INVALID');
 return b;
};
export function attachW44OfficialWhatsAppIdentity({
 db,transaction,verifyCurrentOwner,verifySdkSelf,verifySdkPeer
}={}){
 if(typeof db?.prepare!=='function'||typeof transaction!=='function'||
    typeof verifyCurrentOwner!=='function'||typeof verifySdkSelf!=='function'||
    typeof verifySdkPeer!=='function')fail('W44_ORIGINAL_NATIVE_PORTS_REQUIRED');
 const findAccount=db.prepare('SELECT * FROM identity_accounts WHERE tenant=? AND account=? AND channel=?');
 const findPeer=db.prepare('SELECT * FROM identity_peers WHERE tenant=? AND account=? AND channel=? AND peer_id=?');
 const findEpoch=db.prepare('SELECT epoch FROM identity_consent_epochs WHERE tenant=? AND account=? AND channel=? AND peer_id=?');
 const addAccount=db.prepare('INSERT INTO identity_accounts(tenant,account,channel,owner,binding_revision,revocation_epoch,active,binding_proof_ref) VALUES(?,?,?,?,?,?,1,?)');
 const addPeer=db.prepare('INSERT INTO identity_peers(tenant,account,channel,peer_id,binding_revision,bound,proof_ref,revocation_epoch) VALUES(?,?,?,?,?,1,?,0)');
 const peerEpoch=db.prepare('INSERT INTO identity_consent_epochs(tenant,account,channel,peer_id,epoch) VALUES(?,?,?,?,1) ON CONFLICT(tenant,account,channel,peer_id) DO UPDATE SET epoch=epoch+1');
 const listPeers=db.prepare('SELECT peer_id,binding_revision,proof_ref,revocation_epoch FROM identity_peers WHERE tenant=? AND account=? AND channel=? AND bound=1 ORDER BY peer_id LIMIT 10000');
 const accountOf=b=>findAccount.get(b.tenantId,b.accountId,CHANNEL);
 const peerOf=(b,remoteJid)=>findPeer.get(b.tenantId,b.accountId,CHANNEL,remoteJid);
 const current=(b,a)=>a&&a.active===1&&a.owner===b.principalRef&&
   a.binding_revision===b.bindingRevision&&
   a.revocation_epoch===b.accountRevocationEpoch&&
   a.binding_proof_ref.startsWith('BAILEYS_VERIFIED_SELF_SHA256_');
 const checked=async(b,operation)=>{
  requireBinding(b);
  if(await verifyCurrentOwner({binding:b,operation})!==true)
   fail('W44_NATIVE_OWNER_SESSION_REVOKED');
 };
 const expose=(b,peerId)=>Object.freeze({tenant:b.tenantId,account:b.accountId,
   channel:CHANNEL,peer_id:peerId,binding_revision:b.bindingRevision});
 async function readEnrollment({binding}={}){
  await checked(binding,'READ_ACCOUNT_ENROLLMENT');
  const a=accountOf(binding);
  if(!a)return Object.freeze({state:'NOT_LINKED',verified:false,canSend:false});
  if(!current(binding,a))return Object.freeze({state:'REVOKED_OR_STALE',verified:false,canSend:false});
  return Object.freeze({state:'LINKED',verified:true,
    bindingRevision:a.binding_revision,accountEpoch:a.revocation_epoch,canSend:false});
 }
 async function readCurrent({binding}={}){
  await checked(binding,'READ_ACCOUNT');
  const a=accountOf(binding);
  if(!current(binding,a))return null;
  const selfHash=a.binding_proof_ref.slice('BAILEYS_VERIFIED_SELF_SHA256_'.length);
  return Object.freeze({verified:true,tenant:binding.tenantId,account:binding.accountId,
   channel:CHANNEL,binding_revision:binding.bindingRevision,
   accountEpoch:a.revocation_epoch,platformSelfDigest:selfHash,canSend:false});
 }
 async function bindSdkSelf({binding,selfJid,selfLid=null}={}){
  await checked(binding,'ENROLL_SDK_SELF');
  if(!jid(selfJid)||(selfLid!==null&&!jid(selfLid)))
   fail('W44_SDK_SELF_JID_REQUIRED');
  if(await verifySdkSelf({binding,selfJid,selfLid})!==true)
   fail('W44_NATIVE_BAILEYS_SELF_NOT_VERIFIED');
  await checked(binding,'COMMIT_SDK_SELF');
  const marker=proof('BAILEYS_VERIFIED_SELF_SHA256_',selfJid);
  return transaction(()=>{
   const old=accountOf(binding);
   if(old){
    if(!current(binding,old)||old.binding_proof_ref!==marker)
     fail('W44_WHATSAPP_ACCOUNT_CONFLICT_OR_REVOKED');
   }else{
    if(binding.bindingRevision!==1||binding.accountRevocationEpoch!==0)
     fail('W44_EXPLICIT_RELINK_REQUIRED');
    addAccount.run(binding.tenantId,binding.accountId,CHANNEL,
     binding.principalRef,1,0,marker);
   }
   return Object.freeze({verified:true,tenant:binding.tenantId,
    account:binding.accountId,channel:CHANNEL,binding_revision:binding.bindingRevision,
    sdkSelfJid:selfJid,canSend:false});
  });
 }
 async function bindSdkPeer({binding,selfJid,remoteJid}={}){
  await checked(binding,'BIND_SDK_PEER');
  if(!jid(remoteJid)||!jid(selfJid)||remoteJid===selfJid)
   fail('W44_NATIVE_PEER_JID_INVALID');
  if(await verifySdkPeer({binding,selfJid,remoteJid})!==true)
   fail('W44_NATIVE_PEER_SOURCE_NOT_VERIFIED');
  await checked(binding,'COMMIT_SDK_PEER');
  return transaction(()=>{
   const a=accountOf(binding);
   if(!current(binding,a)||a.binding_proof_ref!==proof('BAILEYS_VERIFIED_SELF_SHA256_',selfJid))
    fail('W44_REAL_ACCOUNT_NOT_CURRENT');
   const old=peerOf(binding,remoteJid);
   const marker=proof('BAILEYS_VERIFIED_PEER_SHA256_',remoteJid);
   if(old&&old.bound!==1)fail('W44_REVOKED_PEER_MUST_BE_REAPPROVED');
   if(old&&(old.binding_revision!==binding.bindingRevision||old.proof_ref!==marker))
    fail('W44_PEER_BINDING_CONFLICT');
   if(!old){
    addPeer.run(binding.tenantId,binding.accountId,CHANNEL,remoteJid,
     binding.bindingRevision,marker);
    peerEpoch.run(binding.tenantId,binding.accountId,CHANNEL,remoteJid);
   }
   return Object.freeze({bound:true,persisted:true,peer_id:remoteJid,
    k:expose(binding,remoteJid),canSend:false});
  });
 }
 async function readPeer({binding,remoteJid}={}){
  await checked(binding,'READ_REAL_PEER');
  const a=accountOf(binding),peer=jid(remoteJid)?peerOf(binding,remoteJid):null;
  if(!current(binding,a)||!peer||peer.bound!==1||
     peer.binding_revision!==binding.bindingRevision||
     peer.proof_ref!==proof('BAILEYS_VERIFIED_PEER_SHA256_',remoteJid))return null;
  return Object.freeze({bound:true,peer_id:remoteJid,
   k:expose(binding,remoteJid),canSend:false,
   consentEpoch:findEpoch.get(binding.tenantId,binding.accountId,CHANNEL,remoteJid)?.epoch??0,
   accountEpoch:a.revocation_epoch});
 }
 async function list({binding}={}){
  await checked(binding,'LIST_REAL_PEERS');
  const a=accountOf(binding);
  if(!current(binding,a))return Object.freeze({verified:false,contacts:[],canSend:false});
  const rows=listPeers.all(binding.tenantId,binding.accountId,CHANNEL);
  return Object.freeze({verified:true,contacts:rows.filter(x=>
   x.binding_revision===binding.bindingRevision&&
   x.proof_ref===proof('BAILEYS_VERIFIED_PEER_SHA256_',x.peer_id)).map(x=>
   Object.freeze({k:expose(binding,x.peer_id),peerId:x.peer_id,canSend:false})),canSend:false});
 }
 async function revoke({binding}={}){
  await checked(binding,'REVOKE_REAL_ACCOUNT');
  return transaction(()=>{
   const a=accountOf(binding);
   if(!a||a.active===0)return Object.freeze({revoked:true,alreadyRevoked:true,canSend:false});
   if(!current(binding,a))fail('W44_CROSS_ACCOUNT_REVOKE_DENIED');
   db.prepare('UPDATE identity_accounts SET active=0,binding_revision=binding_revision+1,revocation_epoch=revocation_epoch+1 WHERE tenant=? AND account=? AND channel=?')
    .run(binding.tenantId,binding.accountId,CHANNEL);
   const rows=listPeers.all(binding.tenantId,binding.accountId,CHANNEL);
   for(const x of rows)peerEpoch.run(binding.tenantId,binding.accountId,CHANNEL,x.peer_id);
   db.prepare('UPDATE identity_peers SET bound=0,revocation_epoch=revocation_epoch+1 WHERE tenant=? AND account=? AND channel=?')
    .run(binding.tenantId,binding.accountId,CHANNEL);
   db.prepare("UPDATE identity_consents SET status='REVOKED',consent_revision=consent_revision+1,revocation_epoch=revocation_epoch+1 WHERE tenant=? AND account=? AND channel=? AND status!='REVOKED'")
    .run(binding.tenantId,binding.accountId,CHANNEL);
   return Object.freeze({revoked:true,canSend:false});
  });
 }
 return Object.freeze({readEnrollment,readCurrent,bindSdkSelf,bindSdkPeer,readPeer,list,revoke});
}
