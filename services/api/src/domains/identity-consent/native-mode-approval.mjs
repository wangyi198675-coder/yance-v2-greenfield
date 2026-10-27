/**
 * W24 -> ORIGINAL W44 MANUAL / ASSIST / AUTO approved user gesture bridge.
 * Resolves the five-part K only from current authenticated W24 owner reads.
 * No independent mode store, login, proof minting, sender, or W44 mutation.
 *
 * Original W24/W44 currently accept only synthetic fixtures. The live result
 * is deliberately REAL_ACCOUNT_AUTH_HOLD until BOTH original owners add and
 * sign an actual platform user account/peer + durable actor source.
 */
import {canonicalK} from './identity-consent.mjs';
const MODES=Object.freeze({MANUAL:'MODE_MANUAL',ASSIST:'MODE_ASSIST',AUTO:'MODE_AUTO'});
const fail=code=>{throw Object.assign(new Error(code),{code})};
const safe=s=>typeof s==='string'&&s.length>0&&s.length<=180&&!/[\u0000-\u001f]/.test(s);
const positive=n=>Number.isSafeInteger(n)&&n>0;
const nonneg=n=>Number.isSafeInteger(n)&&n>=0;
const sameEpoch=(a,b)=>a&&b&&
 a.bindingRevision===b.bindingRevision&&a.accountEpoch===b.accountEpoch&&
 a.consentEpoch===b.consentEpoch&&a.custodyEpoch===b.custodyEpoch;
const canonicalMatches=(a,b)=>a?.identityKey===b?.identityKey&&
 a?.accountRef===b?.accountRef&&a?.bindingRevision===b?.bindingRevision&&
 a?.accountEpoch===b?.accountEpoch&&a?.consentEpoch===b?.consentEpoch;
const sameNative=(a,b)=>a?.verified===true&&b?.verified===true&&
 a.source==='W54_NATIVE_CURRENT_USER'&&b.source==='W54_NATIVE_CURRENT_USER'&&
 safe(a.principalRef)&&a.principalRef===b.principalRef&&
 a.installationRef===b.installationRef&&
 a.revocationGeneration===b.revocationGeneration;
/**
 * The signed original W54 user-gesture verifier is synchronous because W44
 * invokes it INSIDE its own BEGIN IMMEDIATE W44 verifyOwnerMutation callback.
 * It must verify an immutable proofRef issued by the real session owner, never
 * user JSON or a UI-selected mode boolean.
 */
export function createW24ModeApprovalPort({
 readW24AuthorizedAccounts,readW24VerifiedContacts,
 resolveNativePrincipal,resolveSignedUserGesture,verifySignedUserGesture,
 readW44ModeState,readW44GrantState,clock=Date.now
}={}){
 if([readW24AuthorizedAccounts,readW24VerifiedContacts,resolveNativePrincipal,
  resolveSignedUserGesture,verifySignedUserGesture,readW44ModeState,
  readW44GrantState,clock].some(x=>typeof x!=='function'))
  fail('W24_EXISTING_NATIVE_AND_W44_MODE_PORTS_REQUIRED');
 async function current({session,principal,selector}){
  if(typeof selector!=='string'||selector.length<8||selector.length>900)
   fail('CONTACT_SELECTOR_INVALID');
  const signed=await resolveNativePrincipal({session,operation:'READ_MODE'});
  if(!sameNative(signed,principal))fail('W54_CURRENT_OWNER_NOT_VERIFIED');
  const accounts=await readW24AuthorizedAccounts({principal:signed,session});
  const contacts=await readW24VerifiedContacts({principal:signed,session,accounts});
  if(!Array.isArray(accounts)||!Array.isArray(contacts))
   fail('W24_CURRENT_CONTACT_SCOPE_NOT_VERIFIED');
  // selector is a lookup ONLY. Never accept a browser-provided tenant,
  // account, peer, K, actor, approvalRef, or permission bit.
  const c=contacts.find(x=>x.identityKey===selector);
  if(!c||contacts.some(x=>x!==c&&x.identityKey===selector))
   fail('CONTACT_NOT_IN_CURRENT_W24_AUTH_SCOPE');
  const a=accounts.find(x=>x.accountRef===c.accountRef);
  if(!a||!c.identity||c.identity.tenant!==a.tenant||
     c.identity.account!==a.accountId||c.identity.channel!==a.channel||
     c.identity.peer_id!==c.peerRef||
     c.identity.binding_revision!==a.bindingRevision||
     canonicalK(c.identity)!==selector||
     c.w24CurrentKVerified!==true||c.w24ConsentCurrent!==true||
     !nonneg(c.accountEpoch)||!positive(c.consentEpoch)||
     c.accountEpoch!==a.accountEpoch)
   fail('W24_SIGNED_ACCOUNT_AND_FULL_K_REQUIRED');
  return Object.freeze({principal:signed,contact:c,
   actor:signed.principalRef,k:Object.freeze({...c.identity})});
 }
 function readMode(entry){
  const m=readW44ModeState({identity:entry.k,actor:entry.actor});
  const w44Key=JSON.stringify([entry.k.tenant,entry.k.account,
   entry.k.channel,entry.k.peer_id,entry.k.binding_revision]);
  if(m?.ok!==true||!m.identityEpochs||m.identityKey!==w44Key||
    m.identityEpochs.bindingRevision!==entry.k.binding_revision||
    m.identityEpochs.accountEpoch!==entry.contact.accountEpoch||
    m.identityEpochs.consentEpoch!==entry.contact.consentEpoch||
    !nonneg(m.identityEpochs.custodyEpoch)||
    !nonneg(m.barriers?.generation))
   fail('W44_MODE_K_OR_EPOCH_MISMATCH');
  return m;
 }
 function inspectProof({proofRef,kind,entry,mode,requestId,now}){
  if(!safe(proofRef)||!safe(requestId)||!MODES[mode])
   fail('W24_TYPED_USER_APPROVAL_REQUIRED');
  const p=verifySignedUserGesture({
   approvalRef:proofRef,requestId,kind,
   actor:entry.actor,identity:entry.k,identityKey:canonicalK(entry.k),
   scope:'CONTACT',targetMode:mode,identityEpochs:entry.mode?.identityEpochs,
   now
  });
  // Proof check MUST NOT be async inside W44 SQLite transaction.
  if(p&&typeof p.then==='function')fail('ASYNC_MODE_PROOF_NOT_ATOMIC');
  if(p?.verified!==true||p.source!=='ORIGINAL_W54_SIGNED_USER_GESTURE'||
     p.scope!=='CONTACT'||p.kind!==kind||p.actor!==entry.actor||
     p.identityKey!==canonicalK(entry.k)||p.targetMode!==mode||
     p.requestId!==requestId||p.approvalRef!==proofRef||
     !nonneg(p.issuedAt)||p.issuedAt>now||
     !positive(p.expiresAt)||p.expiresAt<=now||
     !sameEpoch(p.identityEpochs,entry.mode?.identityEpochs))
   fail('W24_TYPED_MODE_APPROVAL_NOT_VERIFIED');
  if(mode==='AUTO'){
   if(p.continuousDelegationApproved!==true||
      p.grantScope!=='GLOBAL'&&p.grantScope!=='CONTACT'||
      !positive(p.maxBudgetUnits)||!positive(p.grantExpiresAt)||
      p.grantExpiresAt<=now)
    fail('W24_AUTO_GRANT_BUDGET_SCOPE_PROOF_REQUIRED');
  }
  return p;
 }
 function autoEligibility(entry,mode,p,now){
  const scope=mode.effectiveScope;
  if(!['GLOBAL','CONTACT'].includes(scope)||mode.globalPaused||
     mode.contactPaused||mode.barriers?.pending||mode.barriers?.globalPending||
     mode.barriers?.activeLease||!mode.budget||
     !positive(mode.budget.available))
   fail('W44_AUTO_CURRENT_GRANT_NOT_EFFECTIVE');
  const actual=readW44GrantState({identity:entry.k,actor:entry.actor,scope});
  if(actual?.ok!==true||actual.grant?.enabled!==true||
     actual.grant.expiresAt<=now||actual.grant.epoch!==p.grantEpoch||
     !positive(actual.grant.available)||
     p.grantScope!==scope||p.maxBudgetUnits>actual.grant.available||
     p.grantExpiresAt>actual.grant.expiresAt||
     actual.paused===true||actual.globalPaused===true||
     actual.contactPaused===true||
     actual.identityEpochs?.bindingRevision!==entry.k.binding_revision||
     actual.identityEpochs?.accountEpoch!==entry.contact.accountEpoch||
     actual.identityEpochs?.consentEpoch!==entry.contact.consentEpoch)
   fail('W44_AUTO_GRANT_SCOPE_EXPIRED_OR_BUDGET_CHANGED');
 }
 /**
  * Read does NOT request or mutate mode, custody, W25, or Grant.
  * The verified K remains an identity selector, not a send/auto grant.
  */
 async function readModeEligibility({session,principal,contactSelector}={}){
  const e=await current({session,principal,selector:contactSelector});
  const m=readMode(e);
  return Object.freeze({
   identity:Object.freeze({...e.k}),identityKey:canonicalK(e.k),
   accountRef:e.contact.accountRef,
   selectedMode:m.selectedMode,effectiveMode:m.effectiveMode,
   identityEpochs:Object.freeze({...m.identityEpochs}),
   barriers:Object.freeze({...m.barriers}),
   authorityClass:m.authorityClass,
   realAccountVerified:m.realAccountVerified===true,
   realUserAuthorized:m.realUserAuthorized===true,
   realAutoAuthorized:false,canSend:false
  });
 }
 /**
  * Returns W44.switchMode typed arguments for the ORIGINAL W47 adapter.
  * Real eligibility never follows merely from an SDK process running.
  */
 async function prepareModeChange({session,principal,contactSelector,targetMode}={}){
  if(!MODES[targetMode])fail('INVALID_MODE_TARGET');
  const e=await current({session,principal,selector:contactSelector});
  const m=readMode(e);
  // The existing W44 MODE fixtures explicitly report both false. Never
  // silently promote synthetic or inherited demo grants to a live authority.
  if(m.realAccountVerified!==true||m.realUserAuthorized!==true||
     m.authorityClass==='SYNTHETIC_FIXTURE_ONLY')
   fail('REAL_ACCOUNT_AUTH_HOLD');
  const now=clock();
  if(!positive(now))fail('INVALID_SERVER_CLOCK');
  const gesture=await resolveSignedUserGesture({
   session,principal:e.principal,contact:e.contact,identity:e.k,
   targetMode,kind:MODES[targetMode],scope:'CONTACT'
  });
  if(!safe(gesture?.approvalRef)||!safe(gesture?.serverRequestId))
   fail('W54_SIGNED_MODE_USER_ACTION_REQUIRED');
  const signed={...e,mode:m};
  const p=inspectProof({proofRef:gesture.approvalRef,
    kind:MODES[targetMode],entry:signed,
    mode:targetMode,requestId:gesture.serverRequestId,now});
  if(targetMode==='AUTO')autoEligibility(e,m,p,now);
  const closing=await current({session,principal,selector:contactSelector});
  const state=readMode(closing);
  if(!canonicalMatches(e.contact,closing.contact)||
     !sameNative(e.principal,closing.principal)||
     !sameEpoch(m.identityEpochs,state.identityEpochs)||
     m.barriers.generation!==state.barriers.generation)
   fail('W24_MODE_SOURCE_CHANGED_DURING_APPROVAL');
  if(targetMode==='AUTO')autoEligibility(closing,state,p,clock());
  return Object.freeze({
   kind:MODES[targetMode],scope:'CONTACT',
   identity:Object.freeze({...closing.k}),actor:closing.actor,
   targetMode,idempotencyKey:gesture.serverRequestId,
   expectedGeneration:state.barriers.generation,
   expectedBindingRevision:state.identityEpochs.bindingRevision,
   expectedAccountEpoch:state.identityEpochs.accountEpoch,
   expectedConsentEpoch:state.identityEpochs.consentEpoch,
   expectedCustodyEpoch:state.identityEpochs.custodyEpoch,
   payload:Object.freeze({targetMode,approvalRef:gesture.approvalRef}),
   realAccountVerified:true,userActionVerified:true,
   canSend:false
  });
 }
 /**
  * Register as ONE existing original W44 verifyOwnerMutation callback
  * alongside the original W24 durable proof verifier.
  * Verifies the signed immutable reference again within W44's own transaction.
  * W44 itself checks current K/epoch CAS/grant/pause/UNKNOWN in that transaction.
  */
 function verifyW44ModeMutation({actor,kind,identity,mutation,requestId}={}){
  try{
   if(!Object.values(MODES).includes(kind)||!mutation||
      mutation.targetMode!==kind.slice(5)||!safe(mutation.approvalRef)||
      !safe(requestId)||!safe(actor))return {verified:false};
   const signed=verifySignedUserGesture({
    approvalRef:mutation.approvalRef,requestId,kind,
    actor,identity,identityKey:canonicalK(identity),scope:'CONTACT',
    targetMode:mutation.targetMode,now:clock()
   });
   if(signed&&typeof signed.then==='function')return {verified:false};
   // W44 remains the sole atomic authority for current epochs and Grant.
   return {verified:signed?.verified===true&&
    signed.source==='ORIGINAL_W54_SIGNED_USER_GESTURE'&&
    signed.approvalRef===mutation.approvalRef&&signed.requestId===requestId&&
    signed.actor===actor&&signed.kind===kind&&signed.scope==='CONTACT'&&
    signed.identityKey===canonicalK(identity)&&
    signed.targetMode===mutation.targetMode&&
    signed.identityEpochs?.bindingRevision===identity.binding_revision&&
    nonneg(signed.identityEpochs?.accountEpoch)&&
    nonneg(signed.identityEpochs?.consentEpoch)&&
    nonneg(signed.identityEpochs?.custodyEpoch)&&
    nonneg(signed.issuedAt)&&signed.issuedAt<=clock()&&
    positive(signed.expiresAt)&&signed.expiresAt>clock()&&
    (kind!=='MODE_AUTO'||(signed.continuousDelegationApproved===true&&
     ['GLOBAL','CONTACT'].includes(signed.grantScope)&&
     positive(signed.maxBudgetUnits)&&positive(signed.grantEpoch)&&
     positive(signed.grantExpiresAt)&&signed.grantExpiresAt>clock()))};
  }catch{return {verified:false}}
 }
 return Object.freeze({readModeEligibility,prepareModeChange,
  verifyW44ModeMutation});
}
