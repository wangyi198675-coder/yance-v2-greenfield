// Original W24 IdentityConsent to existing W47 authorized-contact GET.
// No second account store; all native platform inventory callbacks come from
// W26-29 and must check REAL SDK account authorization and peer provenance.
const required=s=>typeof s==='string'&&s.length>0&&s.length<=200;
const deny=s=>{throw Error(s)};
const samePrincipal=(a,b)=>a?.verified===true&&a?.source==='W54_NATIVE_CURRENT_USER'&&
 required(a.principalRef)&&a.principalRef===b?.principalRef&&
 a.installationRef===b?.installationRef&&
 a.revocationGeneration===b?.revocationGeneration;
const channels=new Set(['FB_PERSONAL','FB_PAGE','WHATSAPP_PERSONAL','TELEGRAM_PERSONAL']);
export function createW24NativeOwnerReadPorts({
  identityConsent, resolveNativePrincipal, listVerifiedPlatformAccounts,
  listVerifiedPlatformPeers, readW44IdentityAuthority
}={}){
 if(identityConsent?.isDurableIdentity!==true||
   typeof identityConsent?.assertCurrent!=='function'||
   typeof identityConsent?.readConsentEpoch!=='function'||
   [resolveNativePrincipal,listVerifiedPlatformAccounts,listVerifiedPlatformPeers,readW44IdentityAuthority]
   .some(x=>typeof x!=='function'))
   deny('W24_STRICT_AND_NATIVE_OWNER_READ_PORTS_REQUIRED');
 const confirmPrincipal=async({principal,session})=>{
  const latest=await resolveNativePrincipal({session,operation:'READ_CONTACTS'});
  if(!samePrincipal(latest,principal))deny('NATIVE_PRINCIPAL_REVOKED_OR_UNVERIFIED');
  return latest;
 };
 const verifiedAccount=x=>x?.platformAuthorizationVerified===true&&
  x?.nativeSessionCurrent===true&&x?.channelAccountBindingCurrent===true&&
  x?.authorization==='ONLINE_VERIFIED'&&channels.has(x.channel)&&
  required(x.accountRef)&&/^[A-Za-z0-9_-]{8,150}$/.test(x.accountRef)&&
  required(x.ownerPrincipalRef)&&required(x.tenant)&&required(x.accountId)&&
  required(x.accountAnchorPeerId)&&Number.isSafeInteger(x.bindingRevision)&&
  x.bindingRevision>=1;
 async function readW24AuthorizedAccounts({principal,session}={}){
  const native=await confirmPrincipal({principal,session});
  const rows=await listVerifiedPlatformAccounts({nativePrincipal:native,session});
  if(!Array.isArray(rows)||rows.length>50)deny('NATIVE_ACCOUNTS_NOT_AUTHORITATIVE');
  const seen=new Set();
  return Object.freeze(rows.map(a=>{
   if(!verifiedAccount(a)||a.ownerPrincipalRef!==native.principalRef||
     seen.has(a.accountRef))deny('ACCOUNT_AUTHORIZATION_MISSING_OR_DUPLICATE');
   seen.add(a.accountRef);
   const w44=readW44IdentityAuthority({actor:native.principalRef,
     identity:{tenant:a.tenant,account:a.accountId,channel:a.channel,
      peer_id:a.accountAnchorPeerId,binding_revision:a.bindingRevision}});
   if(!w44?.account||w44.account.owner!==native.principalRef||
     w44.account.active!==true||w44.bindingRevision!==a.bindingRevision||
     !Number.isSafeInteger(w44.accountEpoch)||w44.accountEpoch<0)
    deny('W24_ACCOUNT_NOT_REGISTERED_OR_REVOKED');
   return Object.freeze({accountRef:a.accountRef,channel:a.channel,
    ownerPrincipalRef:a.ownerPrincipalRef,authorization:'ONLINE_VERIFIED',
    bindingRevision:a.bindingRevision,accountEpoch:w44.accountEpoch,
    tenant:a.tenant,accountId:a.accountId,accountAnchorPeerId:a.accountAnchorPeerId});
  }));
 }
 async function readW24VerifiedContacts({principal,session,accounts}={}){
  const native=await confirmPrincipal({principal,session});
  if(!Array.isArray(accounts)||accounts.some(a=>a.ownerPrincipalRef!==native.principalRef||
    a.authorization!=='ONLINE_VERIFIED'))
    deny('ACCOUNT_SCOPE_NOT_AUTHORIZED');
  const current=await listVerifiedPlatformAccounts({nativePrincipal:native,session});
  if(!Array.isArray(current)||current.length>50)deny('PLATFORM_ACCOUNT_REVOCATION_UNAVAILABLE');
  const currentKey=new Map();
  for(const a of current) {
   if(!verifiedAccount(a)||a.ownerPrincipalRef!==native.principalRef||
     currentKey.has(a.accountRef))deny('CURRENT_ACCOUNT_NOT_AUTHORIZED');
   currentKey.set(a.accountRef,a);
  }
  if(accounts.length!==current.length||accounts.some(a=>
    !currentKey.has(a.accountRef)||currentKey.get(a.accountRef).channel!==a.channel||
    currentKey.get(a.accountRef).tenant!==a.tenant||
    currentKey.get(a.accountRef).accountId!==a.accountId||
    currentKey.get(a.accountRef).accountAnchorPeerId!==a.accountAnchorPeerId||
    currentKey.get(a.accountRef).bindingRevision!==a.bindingRevision))
    deny('ACCOUNT_BINDING_CHANGED_DURING_READ');
  const seen=new Set(),result=[];
  for(const account of accounts){
   const original=currentKey.get(account.accountRef);
   const w44=readW44IdentityAuthority({actor:native.principalRef,
     identity:{tenant:original.tenant,account:original.accountId,
      channel:original.channel,peer_id:original.accountAnchorPeerId,
      binding_revision:original.bindingRevision}});
   if(w44?.account?.active!==true||w44.account.owner!==native.principalRef||
     w44.bindingRevision!==original.bindingRevision||w44.accountEpoch!==account.accountEpoch)
    deny('W24_ACCOUNT_REVOKED_DURING_READ');
   const peers=await listVerifiedPlatformPeers({nativePrincipal:native,
    account:original,session});
   if(!Array.isArray(peers)||peers.length>10000)deny('PEER_LIST_NOT_AUTHORITATIVE');
   for(const peer of peers){
    if(peer?.platformPeerVerified!==true||peer?.nativeSessionCurrent!==true||
       peer?.channelAccountBindingCurrent!==true||
       peer.accountRef!==account.accountRef||peer.channel!==account.channel||
       peer.tenant!==original.tenant||peer.accountId!==original.accountId||
       peer.bindingRevision!==original.bindingRevision||
       !required(peer.peerRef)||!/^[A-Za-z0-9_.:@+-]{4,200}$/.test(peer.peerRef)||
       !Number.isSafeInteger(peer.bindingRevision)||peer.bindingRevision<1||
       !required(peer.tenant)||!required(peer.accountId)||
       !required(peer.displayName)||peer.displayName.length>180 ||
       peer.ownerPrincipalRef!==native.principalRef)
      deny('PEER_NATIVE_BINDING_NOT_VERIFIED');
    const pair=account.accountRef+'|'+account.channel+'|'+peer.peerRef;
    if(seen.has(pair))deny('DUPLICATE_NATIVE_CONTACT');seen.add(pair);
    const k={tenant:peer.tenant,account:peer.accountId,channel:account.channel,
      peer_id:peer.peerRef,binding_revision:peer.bindingRevision};
    const ctx={tenant:peer.tenant,principal_id:native.principalRef,
      input_domain:'CONTACT'};
    const read=identityConsent.assertCurrent(ctx,k);
    const epoch=identityConsent.readConsentEpoch(ctx,k);
    if(read?.binding_revision!==peer.bindingRevision||
       !Number.isSafeInteger(epoch)||epoch<=0)
      deny('W24_CONTACT_CONSENT_OR_BINDING_STALE');
    result.push(Object.freeze({accountRef:account.accountRef,
      channel:account.channel,peerRef:peer.peerRef,
      bindingRevision:peer.bindingRevision,displayName:peer.displayName,
      w24CurrentKVerified:true,w24ConsentCurrent:true}));
   }
  }
  for(const account of accounts){
   const w44=readW44IdentityAuthority({actor:native.principalRef,
    identity:{tenant:account.tenant,account:account.accountId,
     channel:account.channel,peer_id:account.accountAnchorPeerId,
     binding_revision:account.bindingRevision}});
   if(w44?.account?.active!==true||w44.account.owner!==native.principalRef||
     w44.bindingRevision!==account.bindingRevision||w44.accountEpoch!==account.accountEpoch)
    deny('W24_ACCOUNT_CHANGED_BEFORE_CONTACT_RESPONSE');
  }
  const latest=await resolveNativePrincipal({session,operation:'READ_CONTACTS'});
  if(!samePrincipal(latest,native))deny('NATIVE_PRINCIPAL_REVOKED_DURING_READ');
  return Object.freeze(result);
 }
 return Object.freeze({readW24AuthorizedAccounts,readW24VerifiedContacts});
}
