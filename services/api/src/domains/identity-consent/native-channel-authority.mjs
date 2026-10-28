/**
 * W24 original IdentityConsent -> W25 sole inbound ledger narrow native seam.
 * No SDK, credentials, OS session, grant, DB, fake principal issuer or sender.
 * W26-29 + W47/W54 MUST supply actual authenticated channel/account/peer
 * binding. W24/W44 synthetic-only canonical K continues to DENY real actors.
 */
import {canonicalK,IdentityDenied} from './identity-consent.mjs';
const refuse=reason=>{throw new IdentityDenied(reason)};
const valid=s=>typeof s==='string'&&s.length>0&&s.length<=512;
const positive=x=>Number.isSafeInteger(x)&&x>0;
const nonneg=x=>Number.isSafeInteger(x)&&x>=0;
const currentRevision=k=>Number(k?.bindingRevision);

export function createW24NativeInboundIdentityPort({
  identityConsent, resolveVerifiedChannelBinding
}={}){
 if(identityConsent?.isDurableIdentity!==true||
    typeof identityConsent?.assertCurrent!=='function'||
    typeof identityConsent?.readConsentEpoch!=='function'||
    typeof resolveVerifiedChannelBinding!=='function')
   refuse('W24_AND_AUTHENTICATED_CHANNEL_BINDING_REQUIRED');
 async function readW24Identity({k,nativePrincipalId,channelAccount,peerId}={}){
  if(!k||!valid(nativePrincipalId)||!valid(channelAccount)||!valid(peerId)||
    !positive(currentRevision(k))||channelAccount!==k.accountId||
    peerId!==k.peerId)
    refuse('NATIVE_ACCOUNT_PEER_BINDING_REQUIRED');
  // The locator is untrusted. The native platform Owner must independently
  // resolve it from the OS/app session + officially approved SDK account.
  const binding=await resolveVerifiedChannelBinding({
    channel:k.channel,accountLocator:k.accountId,peerLocator:k.peerId
  });
  if(!binding||binding.authoritative!==true||
    binding.nativeSessionCurrent!==true||
    binding.platformConnectionAuthorized!==true||
    binding.peerBound===false||
    binding.platformProofVerified!==true||
    !valid(binding.principalId)||binding.principalId!==nativePrincipalId||
    binding.tenant!==k.tenantId||binding.account!==k.accountId||
    binding.channel!==k.channel||binding.peerId!==k.peerId||
    binding.bindingRevision!==currentRevision(k))
    refuse('UPSTREAM_ACCOUNT_NOT_AUTHORITATIVE');
  const identity={tenant:binding.tenant,account:binding.account,
    channel:binding.channel,peer_id:binding.peerId,
    binding_revision:binding.bindingRevision};
  // This rejects real K on the current synthetic-only W24/W44 owner build.
  // Owner must independently sign the native identity format & proof port;
  // NEVER map a real platform account to fake synthetic tenant or owner.
  const fullKey=canonicalK(identity);
  const trustedContext={tenant:binding.tenant,principal_id:binding.principalId,
    input_domain:'CONTACT'};
  const current=identityConsent.assertCurrent(trustedContext,identity);
  const consentEpoch=identityConsent.readConsentEpoch(trustedContext,identity);
  if(!current||current.identity_key!==fullKey||
    current.binding_revision!==binding.bindingRevision||
    !nonneg(current.account_revocation_epoch)||!positive(consentEpoch))
    refuse('W24_NATIVE_IDENTITY_OR_CONSENT_NOT_CURRENT');
  return Object.freeze({valid:true,identityKey:fullKey,
    bindingRevision:current.binding_revision,
    accountEpoch:current.account_revocation_epoch,
    consentEpoch,principalId:binding.principalId,canSend:false});
 }
 return Object.freeze({readW24Identity});
}
