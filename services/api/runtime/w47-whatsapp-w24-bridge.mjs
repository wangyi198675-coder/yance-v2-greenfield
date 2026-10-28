// W47 process-private W24 facade using W44's ORIGINAL SQLite identities.
// W54 issued local user session + original W28 real Baileys socket are the
// only enrollment authority. No test K, second grant/identity DB or sender.
import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex').slice(0,32);
const fail=x=>{throw Object.assign(Error(x),{code:x})};
const channel='WHATSAPP_PERSONAL';
const can=x=>x===true;
export function createW47WhatsAppW24Bridge({
  w44,w54,nativeBoot,sdkEvidence
}={}){
 const port=w44?.nativeWhatsApp;
 if(!port||!['readEnrollment','readCurrent','bindSdkSelf','bindSdkPeer',
    'readPeer','list','revoke'].every(x=>typeof port[x]==='function')||
    typeof w54?.assertCurrentNativeUser!=='function'||
    typeof sdkEvidence?.verifySdkSelf!=='function'||
    typeof sdkEvidence?.verifySdkPeer!=='function'||
    !['W54_NATIVE_CURRENT_USER','WEB_LOCAL_PRIVATE'].includes(nativeBoot?.source))return null;
 const binding=Object.freeze({
  channel,tenantId:'local-'+hash(nativeBoot.principalRef),
  accountId:'wa-'+hash(nativeBoot.installationRef+'|'+nativeBoot.principalRef),
  principalRef:nativeBoot.principalRef,
  bindingRevision:1,accountRevocationEpoch:0,
  installationRef:nativeBoot.installationRef,
 });
 let started=false,approvedAction=null,revoked=false;
 const currentOwner=async()=>{
  if(revoked||!can(await w54.assertCurrentNativeUser()))
   fail('W54_CURRENT_SIGNED_USER_REQUIRED');
 };
 const matching=b=>b?.accountId===binding.accountId&&
  b.tenantId===binding.tenantId&&b.principalRef===binding.principalRef&&
  b.channel===channel&&b.bindingRevision===binding.bindingRevision&&
  b.accountRevocationEpoch===binding.accountRevocationEpoch;
 const checked=async(b,stage)=>{
  await currentOwner();
  if(!matching(b))fail('W24_WHATSAPP_OWNER_SCOPE_MISMATCH');
  const enrollment=await port.readEnrollment({binding});
  if(enrollment.state==='REVOKED_OR_STALE')fail('W24_WHATSAPP_REVOKED');
  if(enrollment.state==='NOT_LINKED'&&approvedAction!=='PAIR_OWN_ACCOUNT')
   fail('W24_WHATSAPP_PAIRING_NOT_APPROVED');
  if(stage==='SIGNAL_RESUME'&&enrollment.state!=='LINKED')
   fail('W24_WHATSAPP_NO_EXISTING_ACCOUNT');
  return enrollment;
 };
 const authorizeStart=async({userAction,accountLocator}={})=>{
  await currentOwner();
  if(accountLocator!=='current-own-whatsapp'||
    !['PAIR_OWN_ACCOUNT','RESUME_EXPLICITLY_APPROVED'].includes(userAction))
   fail('W24_WHATSAPP_EXPLICIT_CONNECT_CLICK_REQUIRED');
  const status=await port.readEnrollment({binding});
  if(status.state==='REVOKED_OR_STALE')fail('W24_WHATSAPP_REVOKED');
  if(userAction==='PAIR_OWN_ACCOUNT'&&status.state!=='NOT_LINKED')
   fail('W24_WHATSAPP_ALREADY_LINKED_RECONNECT_REQUIRED');
  if(userAction==='RESUME_EXPLICITLY_APPROVED'&&status.state!=='LINKED')
   fail('W24_WHATSAPP_NOT_LINKED');
  approvedAction=userAction;started=true;
  return Object.freeze({
   ...binding,authorized:true,userConsented:true,platformPermitted:true,
   principalVerified:true,
   enrollmentApproved:userAction==='PAIR_OWN_ACCOUNT',
   accountVerified:userAction==='RESUME_EXPLICITLY_APPROVED',
   restoreApproved:userAction==='RESUME_EXPLICITLY_APPROVED',
   contactReadApproved:true,historyReadApproved:true,avatarReadApproved:true,
   revisionRevoked:false,canSend:false,
  });
 };
 const assertCurrent=async({binding:b,phase}={})=>{
  try{if(!started)return false;await checked(b,phase);return true}
  catch{return false}
 };
 const assertSignalCurrent=async({binding:b,phase}={})=>{
  try{if(!started)return false;await checked(b,phase);return true}
  catch{return false}
 };
 const resolveTrustedScope=async({binding:b,operation}={})=>{
  await checked(b,operation);
  return Object.freeze({installationRef:binding.installationRef,
   principalRef:binding.principalRef,tenantId:binding.tenantId,
   accountId:binding.accountId,bindingRevision:binding.bindingRevision,
   accountRevocationEpoch:binding.accountRevocationEpoch});
 };
 const resolveAccount=async({binding:b,selfJid,selfLid}={})=>{
  await checked(b,'SDK_ACCOUNT');
  if(!can(await sdkEvidence.verifySdkSelf({binding:b,selfJid,selfLid})))
   fail('W24_REAL_BAILEYS_SELF_PROOF_REQUIRED');
  // W44 official writer verifies SDK evidence again, inside its own port,
  // then commits on the original W44 transaction; no browser JID accepted.
  const account=await port.bindSdkSelf({binding,selfJid,selfLid});
  if(account?.verified!==true)fail('W44_ACCOUNT_NOT_COMMITTED');
  return Object.freeze({...account,tenant:binding.tenantId,
   account:binding.accountId,binding_revision:binding.bindingRevision});
 };
 const resolvePeer=async({binding:b,remoteJid}={})=>{
  await checked(b,'READ_PEER');
  return port.readPeer({binding,remoteJid});
 };
 const bindObservedPeer=async({binding:b,self,remoteJid}={})=>{
  await checked(b,'BIND_PEER');
  if(!can(await sdkEvidence.verifySdkPeer({binding:b,selfJid:self?.jid,remoteJid})))
   fail('W24_REAL_SDK_PEER_REQUIRED');
  return port.bindSdkPeer({binding,selfJid:self.jid,remoteJid});
 };
 const recordVerifiedPeer=async({k,binding:b,providerRemoteJid}={})=>{
  await checked(b,'PERSIST_PEER');
  const peer=await port.readPeer({binding,remoteJid:providerRemoteJid});
  if(peer?.bound!==true||k?.peer_id!==peer.peer_id||
     k?.tenant!==binding.tenantId||k?.account!==binding.accountId)
   fail('W44_PEER_RECEIPT_NOT_CURRENT');
  return Object.freeze({persisted:true,canSend:false});
 };
 const revokeApprovedAccount=async({binding:b}={})=>{
  await checked(b,'REVOKE');
  const out=await port.revoke({binding});
  if(out?.revoked!==true)fail('W44_REVOKE_NOT_COMMITTED');
  revoked=true;started=false;approvedAction=null;
  return out;
 };

 // Current W44 account+peer epochs are the only source for W25 read/write.
 async function readVerifiedPeerByK({k}={}){
  await currentOwner();
  if(!started||!k||k.tenantId!==binding.tenantId||
    k.accountId!==binding.accountId||k.channel!==channel||
    String(k.bindingRevision)!==String(binding.bindingRevision))
   fail('W24_WHATSAPP_CURRENT_FULL_K_REQUIRED');
  const account=await port.readCurrent({binding});
  const peer=await port.readPeer({binding,remoteJid:k.peerId});
  if(account?.verified!==true||peer?.bound!==true||
    !Number.isSafeInteger(peer.consentEpoch)||peer.consentEpoch<1)
   fail('W24_WHATSAPP_K_OR_PEER_NOT_CURRENT');
  return Object.freeze({verified:true,principalId:binding.principalRef,
   tenantId:binding.tenantId,accountId:binding.accountId,channel,
   peerId:k.peerId,bindingRevision:binding.bindingRevision,
   accountEpoch:account.accountEpoch,consentEpoch:peer.consentEpoch,
   connectionEpoch:nativeBoot.nativeRevocationGeneration,canSend:false});
 }
 async function authorizePrivateRead({k,operation}={}){
  if(!['PERSIST_INBOUND','PERSIST_HISTORY','READ_INBOUND','READ_HISTORY',
    'READ_SEND_STATUS'].includes(operation))
   fail('W24_WHATSAPP_PRIVATE_PURPOSE_UNSUPPORTED');
  const proof=await readVerifiedPeerByK({k});
  if(!started||!approvedAction)fail('W24_WHATSAPP_CONSENT_NOT_ACTIVE');
  return proof;
 }
 return Object.freeze({
  authorizeStart,assertCurrent,resolveTrustedScope,assertSignalCurrent,
  revokeApprovedAccount,binding,
  identity:Object.freeze({resolveAccount,resolvePeer,
   bindObservedPeer,recordVerifiedPeer}),
  readCurrent:async()=>{await currentOwner();return port.readCurrent({binding})},
  listPeers:async()=>{await currentOwner();return port.list({binding})},
  readVerifiedPeerByK,authorizePrivateRead,
 });
}
