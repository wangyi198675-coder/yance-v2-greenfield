/**
 * Issue #77: official account + peer post-authorization glue for ORIGINAL W24/W44.
 * The channel Owner and the existing local session resolve every proof. This
 * owns NO credentials, account registry, message store, login or sender.
 * Current W24/W44 synthetic-only source still denies all real K until
 * their separately authorized real actor/identity implementation is joined.
 */
import {IdentityDenied} from './identity-consent.mjs';
const CHANNELS=new Set(['FB_PERSONAL','FB_PAGE','WHATSAPP_PERSONAL','TELEGRAM_PERSONAL']);
const fail=code=>{throw new IdentityDenied(code)};
const safe=x=>typeof x==='string'&&x.length>0&&x.length<=180&&
  !/[\u0000-\u001f\u007f|]/.test(x);
const positive=x=>Number.isSafeInteger(x)&&x>0;
const nonneg=x=>Number.isSafeInteger(x)&&x>=0;
const committed=x=>x?.status==='COMMITTED'&&x?.accepted!==false;
const sameAccount=(a,b)=>a.tenant===b.tenant&&a.account===b.account&&
  a.channel===b.channel&&a.principalId===b.principalId;
export function createW24OfficialAccountLifecycle({
  identityConsent,resolveCurrentPrincipal,resolveOfficialAccount,
  resolveOfficialPeer,readW44IdentityAuthority
}={}){
 if(identityConsent?.isDurableIdentity!==true||
  typeof identityConsent?.registerAccount!=='function'||
  typeof identityConsent?.bindPeer!=='function'||
  typeof identityConsent?.assertCurrent!=='function'||
  [resolveCurrentPrincipal,resolveOfficialAccount,resolveOfficialPeer,
   readW44IdentityAuthority].some(x=>typeof x!=='function'))
  fail('ORIGINAL_W24_W44_AND_NATIVE_OWNERS_REQUIRED');
 async function account({session,channel,accountLocator,operation,allowOffline=false}){
  if(!CHANNELS.has(channel)||!safe(accountLocator))fail('CHANNEL_ACCOUNT_LOCATOR_INVALID');
  const principal=await resolveCurrentPrincipal({session,operation});
  if(principal?.verified!==true||!safe(principal.principalId)||
    !safe(principal.sessionRevision))fail('LOCAL_PRINCIPAL_NOT_AUTHENTICATED');
  const item=await resolveOfficialAccount({session,principal,channel,
   accountLocator,operation});
  // True source evidence MUST be assembled by the original SDK or official
  // REST owner, not by the browser's JSON or by bridge process status.
  if(item?.verifiedSource!==true||item?.platformOwnerVerified!==true||
    (!allowOffline&&(item?.userAuthorized!==true||item?.nativeSessionCurrent!==true))||
    item?.channel!==channel||item?.accountLocator!==accountLocator||
    item?.principalId!==principal.principalId||
    !safe(item.tenant)||!safe(item.account)||!safe(item.platformAccountId)||
    !safe(item.accountAnchorPeerId)||!positive(item.bindingRevision)||
    !safe(item.bindingProofRef)||
    (!allowOffline&&item.accountOnline!==true))
    fail('OFFICIAL_USER_ACCOUNT_NOT_AUTHORIZED');
  const ctx={tenant:item.tenant,principal_id:principal.principalId,
   input_domain:'CONTACT'};
  const key={tenant:item.tenant,account:item.account,channel,
   peer_id:item.accountAnchorPeerId,binding_revision:item.bindingRevision};
  const check=readW44IdentityAuthority({actor:ctx.principal_id,identity:key});
  if(!check||!nonneg(check.accountEpoch)||!nonneg(check.consentEpoch)||
    !nonneg(check.bindingRevision))fail('ORIGINAL_W44_ACCOUNT_AUTHORITY_UNAVAILABLE');
  if(check.account?.owner && check.account.owner!==ctx.principal_id)
    fail('ACCOUNT_OWNER_MISMATCH');
  return {session,principal,item,ctx,key,authority:check};
 }
 async function again(before,operation,allowOffline=false){
  const now=await account({session:before.session,channel:before.item.channel,
   accountLocator:before.item.accountLocator,operation,allowOffline});
  if(now.principal.sessionRevision!==before.principal.sessionRevision||
    now.principal.principalId!==before.principal.principalId||
    !sameAccount(before.item,now.item)||
    now.item.bindingRevision!==before.item.bindingRevision||
    now.item.platformAccountId!==before.item.platformAccountId)
    fail('OFFICIAL_ACCOUNT_SWITCH_OR_REBIND_STALE');
  return now;
 }
 function requireAccountAuthority(a,active=true){
  const s=a.authority;
  if(!s.account||s.account.owner!==a.ctx.principal_id||
    s.bindingRevision!==a.item.bindingRevision||
    (active&&s.account.active!==true))
    fail('W44_ACCOUNT_NOT_BOUND_OR_STALE');
  return s;
 }
 async function peer({owner,peerLocator,operation}){
  if(!safe(peerLocator))fail('PEER_LOCATOR_REQUIRED');
  requireAccountAuthority(owner);
  const p=await resolveOfficialPeer({session:owner.session,
   principal:owner.principal,account:owner.item,peerLocator,operation});
  if(p?.verifiedSource!==true||p?.platformPeerVerified!==true||
    p?.accountLocator!==owner.item.accountLocator||
    p?.platformAccountId!==owner.item.platformAccountId||
    p?.account!==owner.item.account||p?.tenant!==owner.item.tenant||
    p?.channel!==owner.item.channel||p?.peerLocator!==peerLocator||
    !safe(p.peerId)||!safe(p.platformPeerId)||!safe(p.peerProofRef)||
    p.bindingRevision!==owner.item.bindingRevision||
    p.nativeSessionCurrent!==true||p.revoked===true)
    fail('OFFICIAL_PEER_NOT_OWNED_BY_ACCOUNT');
  const k={tenant:owner.item.tenant,account:owner.item.account,
   channel:owner.item.channel,peer_id:p.peerId,
   binding_revision:owner.item.bindingRevision};
  return {p,k};
 }
 async function registerApprovedAccount({session,channel,accountLocator}={}){
  const a=await account({session,channel,accountLocator,operation:'REGISTER_ACCOUNT'});
  if(a.item.bindingRevision!==1)fail('NEW_ACCOUNT_REVISION_MUST_START_ONE');
  if(a.authority.account)fail('ACCOUNT_ALREADY_REGISTERED_USE_RELINK');
  const result=identityConsent.registerAccount(a.ctx,{
   ...a.key,principal_id:a.ctx.principal_id,
   binding_proof_ref:a.item.bindingProofRef});
  if(!committed(result))return Object.freeze({status:'PENDING',canSend:false});
  const after=await again(a,'REGISTER_ACCOUNT');
  requireAccountAuthority(after);
  return Object.freeze({status:'BOUND',channel,
   account:after.item.account,bindingRevision:after.item.bindingRevision,
   accountEpoch:after.authority.accountEpoch,canSend:false});
 }
 async function bindApprovedPeer({session,channel,accountLocator,peerLocator}={}){
  const a=await account({session,channel,accountLocator,operation:'BIND_PEER'});
  const {p,k}=await peer({owner:a,peerLocator,operation:'BIND_PEER'});
  const result=identityConsent.bindPeer(a.ctx,{
   ...k,peer_proof_ref:p.peerProofRef});
  if(!committed(result))return Object.freeze({status:'PENDING',canSend:false});
  const latest=await again(a,'READ_PEER');
  const rerun=await peer({owner:latest,peerLocator,operation:'READ_PEER'});
  if(rerun.p.platformPeerId!==p.platformPeerId||rerun.k.peer_id!==k.peer_id)
   fail('PEER_CHANGED_DURING_BIND');
  const current=identityConsent.assertCurrent(latest.ctx,k);
  if(current.binding_revision!==k.binding_revision||
    current.account_revocation_epoch!==latest.authority.accountEpoch)
    fail('W24_POST_BIND_AUTHORITY_CHANGED');
  return Object.freeze({status:'BOUND',identity:current,
   consentEpoch:identityConsent.readConsentEpoch(latest.ctx,k),canSend:false});
 }
 async function readApprovedPeer({session,channel,accountLocator,peerLocator}={}){
  const a=await account({session,channel,accountLocator,operation:'READ_PEER'});
  const firstPeer=await peer({owner:a,peerLocator,operation:'READ_PEER'});
  const {k}=firstPeer;
  const before=identityConsent.assertCurrent(a.ctx,k);
  const consentEpoch=identityConsent.readConsentEpoch(a.ctx,k);
  const later=await again(a,'READ_PEER');
  const secondPeer=await peer({owner:later,peerLocator,operation:'READ_PEER'});
  if(firstPeer.p.platformPeerId!==secondPeer.p.platformPeerId||
    firstPeer.k.peer_id!==secondPeer.k.peer_id)
   fail('PEER_CHANGED_DURING_READ');
  const after=identityConsent.assertCurrent(later.ctx,k);
  if(before.account_revocation_epoch!==after.account_revocation_epoch||
    later.authority.accountEpoch!==before.account_revocation_epoch||
    identityConsent.readConsentEpoch(later.ctx,k)!==consentEpoch)
    fail('ACCOUNT_PEER_OR_CONSENT_CHANGED_DURING_READ');
  // No takeover, grant, send or auto-reply side effect in this read.
  return Object.freeze({identity:after,
   consentEpoch,accountEpoch:later.authority.accountEpoch,
   bindingRevision:k.binding_revision,canSend:false});
 }
 async function revokeApprovedAccount({session,channel,accountLocator}={}){
  const a=await account({session,channel,accountLocator,
   operation:'REVOKE_ACCOUNT',allowOffline:true});
  requireAccountAuthority(a,false);
  const mutation=identityConsent.invalidateAccount(a.ctx,{
   tenant:a.key.tenant,account:a.key.account,channel:a.key.channel,
   peer_id:a.key.peer_id,expected_revision:a.authority.bindingRevision});
  if(!committed(mutation))return Object.freeze({status:'PENDING',canSend:false});
  const after=readW44IdentityAuthority({actor:a.ctx.principal_id,identity:a.key});
  if(after?.account?.active!==false||after.accountEpoch<=a.authority.accountEpoch)
    fail('W44_REVOKE_POST_VERIFY_FAILED');
  return Object.freeze({status:'REVOKED',account:a.item.account,
   accountEpoch:after.accountEpoch,canSend:false});
 }
 async function relinkApprovedAccount({session,channel,accountLocator}={}){
  const a=await account({session,channel,accountLocator,operation:'RELINK_ACCOUNT'});
  if(a.authority.account?.active!==false||
    a.authority.account?.owner!==a.ctx.principal_id||
    a.item.bindingRevision!==a.authority.bindingRevision+1)
    fail('RELINK_REQUIRES_PRIOR_REVOKE_AND_NEW_REVISION');
  const old=a.authority.bindingRevision;
  const result=identityConsent.relinkAccount(a.ctx,{
   tenant:a.key.tenant,account:a.key.account,channel:a.key.channel,
   peer_id:a.key.peer_id,expected_revision:old,
   binding_proof_ref:a.item.bindingProofRef});
  if(!committed(result))return Object.freeze({status:'PENDING',canSend:false});
  const after=await again(a,'RELINK_ACCOUNT');
  requireAccountAuthority(after);
  return Object.freeze({status:'RELINKED',account:a.item.account,
    bindingRevision:after.authority.bindingRevision,canSend:false,
    peersRequireFreshBinding:true});
 }
 return Object.freeze({registerApprovedAccount,bindApprovedPeer,
  readApprovedPeer,revokeApprovedAccount,relinkApprovedAccount});
}
