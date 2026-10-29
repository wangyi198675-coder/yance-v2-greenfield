/**
 * W24 strict native adapter. W44 is the ONLY durable identity/custody authority.
 * No database, cached account/consent, sender, independent fence or W44 source here.
 * Synthetic fixtures only; the injecting backend owns authenticated actors/proofs.
 */
import {randomUUID} from 'node:crypto';
import {canonicalK,IdentityDenied} from './identity-consent.mjs';

const fail=code=>{throw new IdentityDenied(code)};
const positive=n=>Number.isSafeInteger(n)&&n>0;
const allowedConsent=new Set(['SEND_MESSAGE','TRANSLATE','ANALYZE']); // W44 exact accepted schema.
const privileged=new Set(['REGISTER_ACCOUNT','BIND_PEER','CREATE_CONSENT','RELINK_ACCOUNT']);
const isCommitted=s=>s?.ok===true&&s.status==='COMMITTED';
const isPending=s=>s?.status==='PENDING';
const freeze=x=>Object.freeze({...x});
function check(ctx,k){
 canonicalK(k);
 if(ctx?.input_domain!=='CONTACT'||ctx.tenant!==k.tenant||
    typeof ctx.principal_id!=='string'||!ctx.principal_id.startsWith('fake-'))
   fail('TRUSTED_CONTACT_ACTOR_REQUIRED');
 return ctx.principal_id;
}
function requireStore(store){
 const names=['readIdentityAuthority','readMutationFence','requestMutationFence',
  'finalizeMutationFence','mutationResult','cancelMutationFence','inspection'];
 if(!store||names.some(n=>typeof store[n]!=='function')||
   typeof store.requestNativeMutationFence!=='function'||
   typeof store.finalizeNativeMutationFence!=='function'||
   store.requestMutationFence!==store.requestNativeMutationFence||
   store.finalizeMutationFence!==store.finalizeNativeMutationFence)
   fail('W44_DURABLE_AUTHORITY_REQUIRED');
}
function proof(proofAuthority,ctx,k,kind,payload){
 if(!privileged.has(kind))return;
 if(typeof proofAuthority?.evaluate!=='function')fail('DURABLE_PROOF_AUTHORITY_REQUIRED');
 const result=proofAuthority.evaluate({ctx:freeze(ctx),k:freeze(k),kind,
  proof_ref:payload.bindingProofRef??payload.peerProofRef??payload.proofRef,
  purpose:payload.purpose,operation:payload.operation,subject_id:payload.subjectId});
 if(result?.then)fail('ASYNC_DURABLE_PROOF_UNSUPPORTED');
 if(result?.approved!==true)fail('DURABLE_PROOF_NOT_VERIFIED');
}
/** Caller MUST separately configure W44 verifyOwnerMutation to re-verify
 * trusted W24 proof in the SAME W44 transaction, not trust payload.approved. */
export function createDurableIdentityDriver({store,proofAuthority,grantAuthority}={}){
 requireStore(store);
 function read(ctx,k){
   const actor=check(ctx,k),s=store.readIdentityAuthority({actor,identity:k});
   if(!s||typeof s.valid!=='boolean'||!Number.isSafeInteger(s.bindingRevision)||
       !Number.isSafeInteger(s.accountEpoch)||!Number.isSafeInteger(s.consentEpoch)||
       !Number.isSafeInteger(s.custodyEpoch)||!Array.isArray(s.consents))
     fail('W44_DURABLE_IDENTITY_UNAVAILABLE');
   if(s.account&&s.account.owner!==actor)fail('ACCOUNT_OWNER_MISMATCH');
   return s;
 }
 function current(ctx,k){
   const s=read(ctx,k);
   if(!s.valid)fail(s.bindingRevision!==k.binding_revision?
     'STALE_BINDING_REVISION':'ACCOUNT_OR_PEER_UNBOUND');
   return freeze({...k,identity_key:canonicalK(k),account_revocation_epoch:s.accountEpoch});
 }
 function epoch(ctx,k){
   current(ctx,k);
   const e=read(ctx,k).consentEpoch;
   if(!positive(e))fail('DURABLE_CONSENT_EPOCH_MISSING');
   return e;
 }
 function mutate(ctx,k,kind,scope,payload,options={}){
   const actor=check(ctx,k);
   proof(proofAuthority,ctx,k,kind,payload);
   const s=read(ctx,k);
   if(kind!=='REGISTER_ACCOUNT'&&!s.account)fail('ACCOUNT_UNBOUND');
   if(kind!=='REGISTER_ACCOUNT'&&s.account?.owner!==actor)fail('ACCOUNT_OWNER_MISMATCH');
   if(kind==='BIND_PEER'||kind==='CREATE_CONSENT'||kind==='REVOKE_CONSENT'||
       kind==='HUMAN_TAKEOVER'){
     if(s.bindingRevision!==k.binding_revision||s.account?.active!==true)
       fail('ACCOUNT_OR_BINDING_NOT_CURRENT');
   }
   const fence=store.readMutationFence({actor,identity:k,scope});
   if(!fence?.ok||!Number.isSafeInteger(fence.generation))fail('W44_FENCE_UNAVAILABLE');
   const idempotencyKey=options.idempotencyKey??('fake-w24-'+randomUUID());
   if(typeof idempotencyKey!=='string'||!idempotencyKey.startsWith('fake-'))
     fail('INVALID_IDEMPOTENCY_KEY');
   const request=store.requestMutationFence({actor,identity:k,kind,scope,payload,
     idempotencyKey,expectedGeneration:fence.generation,
     expectedBindingRevision:s.bindingRevision,expectedAccountEpoch:s.accountEpoch,
     expectedConsentEpoch:s.consentEpoch,expectedCustodyEpoch:s.custodyEpoch});
   if(!request?.ok){
     if(request?.status==='CONFLICT')fail(request.reason??'W44_MUTATION_CONFLICT');
     fail('W44_MUTATION_REQUEST_FAILED');
   }
   if(request.status==='COMMITTED')
     return freeze({status:'COMMITTED',requestId:request.requestId,
       generation:request.generation,result:request.result,replayed:true});
   const finalized=store.finalizeMutationFence({requestId:request.requestId,
     actor,generation:request.generation,ownerValidatedMutation:payload});
   if(isPending(finalized))return freeze({status:'PENDING',accepted:false,
     reason:finalized.reason??'ARMED_SEND_PENDING',
     requestId:request.requestId,generation:request.generation});
   if(!isCommitted(finalized))fail(finalized?.reason??'W44_MUTATION_UNCOMMITTED');
   const after=store.mutationResult({requestId:request.requestId,actor});
   if(!isCommitted(after)||after.generation!==request.generation)
     fail('W44_MUTATION_POST_VERIFY_FAILED');
   return freeze({status:'COMMITTED',accepted:true,requestId:request.requestId,
     generation:request.generation,result:after.result});
 }
 function registerAccount(ctx,raw){
   const k={tenant:raw?.tenant,account:raw?.account,channel:raw?.channel,
     peer_id:raw?.peer_id,binding_revision:raw?.binding_revision};
   if(raw?.principal_id!==ctx?.principal_id)fail('ACCOUNT_OWNER_MISMATCH');
   if(k.binding_revision!==1)fail('INVALID_BINDING_REVISION');
   const result=mutate(ctx,k,'REGISTER_ACCOUNT','GLOBAL',
     {bindingProofRef:raw?.binding_proof_ref},{idempotencyKey:raw?.idempotency_key});
   return freeze({status:result.status,...result,
     tenant:k.tenant,account:k.account,channel:k.channel});
 }
 function bindPeer(ctx,raw){
   const k={tenant:raw?.tenant,account:raw?.account,channel:raw?.channel,
     peer_id:raw?.peer_id,binding_revision:raw?.binding_revision};
   const result=mutate(ctx,k,'BIND_PEER','CONTACT',
     {peerProofRef:raw?.peer_proof_ref},{idempotencyKey:raw?.idempotency_key});
   return freeze({...k,identity_key:canonicalK(k),...result});
 }
 function revokeAccount(ctx,raw){
   const k={tenant:raw?.tenant,account:raw?.account,channel:raw?.channel,
     peer_id:raw?.peer_id,binding_revision:raw?.expected_revision};
   return mutate(ctx,k,'REVOKE_ACCOUNT','GLOBAL',{},
      {idempotencyKey:raw?.idempotency_key});
 }
 function relinkAccount(ctx,raw){
   const k={tenant:raw?.tenant,account:raw?.account,channel:raw?.channel,
     peer_id:raw?.peer_id,binding_revision:raw?.expected_revision};
   return mutate(ctx,k,'RELINK_ACCOUNT','GLOBAL',
     {bindingProofRef:raw?.binding_proof_ref},{idempotencyKey:raw?.idempotency_key});
 }
 function createConsent(ctx,input){
   const k=input?.k;
   if(!allowedConsent.has(input?.operation))fail('DURABLE_CONSENT_OPERATION_UNSUPPORTED');
   if(!positive(input?.expires_at)||input.expires_at<=Date.now())fail('CONSENT_EXPIRED');
   const payload={consentId:input?.consent_id,subjectId:input?.subject_id,
     purpose:input?.purpose,operation:input?.operation,
     proofRef:input?.proof_ref,expiresAt:input.expires_at,approved:true};
   return mutate(ctx,k,'CREATE_CONSENT','CONTACT',payload,
     {idempotencyKey:input?.idempotency_key});
 }
 function revokeConsent(ctx,input){
   const k=input?.k;
   const s=read(ctx,k);
   const consent=s.consents.find(c=>c.consent_id===input?.consent_id);
   if(!consent||consent.consent_revision!==input?.expected_revision||
      consent.status!=='ACTIVE')fail('CONSENT_VERSION_CONFLICT');
   return mutate(ctx,k,'REVOKE_CONSENT','CONTACT',
     {consentId:input.consent_id,expectedConsentRevision:input.expected_revision},
     {idempotencyKey:input?.idempotency_key});
 }
 function assertConsent(ctx,k,operation,purpose,consentId,now){
   const s=read(ctx,k);
   // W44's existing W25 eligibility port does not pass a consent_id.
   // In that trusted SEND_MESSAGE-only path, qualify ONLY if exactly one
   // current durable matching Consent exists; never accept a missing Consent.
   const matches=s.consents.filter(c=>c.operation===operation&&
      (purpose===null||c.purpose===purpose)&&c.status==='ACTIVE'&&c.expires_at>now);
   const consent=consentId?s.consents.find(c=>c.consent_id===consentId):
     operation==='SEND_MESSAGE'&&matches.length===1?matches[0]:null;
   if(!consent)fail(matches.length>1?'CONSENT_AMBIGUOUS':'CONSENT_MISSING');
   if(consent.status!=='ACTIVE'||consent.operation!==operation||
      (purpose!==null&&consent.purpose!==purpose)||consent.expires_at<=now)
     fail('CONSENT_NOT_EFFECTIVE');
   return consent;
 }
 function evaluate(ctx,{k,operation,purpose=null,consent_id=null,now=Date.now()}){
   const before=current(ctx,k),initial=epoch(ctx,k);
   if(ctx.input_domain!=='CONTACT')fail('INPUT_DOMAIN_MISMATCH');
   if(!Number.isSafeInteger(now)||now<0)fail('INVALID_SERVER_TIME');
   if(operation!=='READ_INBOUND'){
     if(!allowedConsent.has(operation))fail('DURABLE_CONSENT_OPERATION_UNSUPPORTED');
     assertConsent(ctx,k,operation,purpose,consent_id,now);
   }
   if(operation==='SEND_MESSAGE'){
     if(typeof grantAuthority?.evaluate!=='function')fail('GRANT_AUTHORITY_UNAVAILABLE');
     const grant=grantAuthority.evaluate({ctx:freeze(ctx),k:before,operation,now});
     if(grant?.then)fail('ASYNC_GRANT_NOT_SUPPORTED');
     if(grant?.allowed!==true||grant.identity_key!==before.identity_key||
        grant.agent_active!==true||!positive(grant.grant_revision)||
        grant.expires_at<=now||grant.revoked===true)fail('GRANT_NOT_EFFECTIVE');
   }
   const after=current(ctx,k);
   if(after.account_revocation_epoch!==before.account_revocation_epoch||
      epoch(ctx,k)!==initial)fail('AUTHORITY_EPOCH_CHANGED');
   return freeze({allowed:true,identity_key:after.identity_key,
     binding_revision:after.binding_revision,account_revocation_epoch:after.account_revocation_epoch,
     consent_epoch:initial,operation,purpose,checked_at:now,reversible_snapshot_only:true});
 }
 function takeover(ctx,k,{expectedIdentityKey,expectedEpoch,
   expectedAccountRevocationEpoch,expectedConsentEpoch,action,idempotencyKey}={}){
   const before=current(ctx,k);
   if(expectedIdentityKey!==before.identity_key||expectedAccountRevocationEpoch!==
       before.account_revocation_epoch||expectedConsentEpoch!==epoch(ctx,k))
     fail('STALE_TAKEOVER_EPOCH');
   const actual=read(ctx,k);
   if(actual.custodyEpoch!==expectedEpoch)fail('STALE_CUSTODY_EPOCH');
   if(action!=='TYPE'&&action!=='IME_COMMIT'&&action!=='PASTE'&&
      action!=='ATTACH'&&action!=='DROP'&&action!=='VOICE'&&action!=='SEND_ATTEMPT')
     fail('NON_USER_EDIT_ACTION');
   const result=mutate(ctx,k,'HUMAN_TAKEOVER','CONTACT',{action:'USER_EDIT'},
     {idempotencyKey});
   if(isPending(result))return result;
   const after=read(ctx,k);
   if(!after.valid||after.mode!=='HUMAN'||after.custodyEpoch!==expectedEpoch+1||
      after.accountEpoch!==expectedAccountRevocationEpoch||
      after.consentEpoch!==expectedConsentEpoch)
     fail('TAKEOVER_POST_VERIFY_FAILED');
   return freeze({status:'COMMITTED',accepted:true,confirmedByGet:true,
     identity:freeze(k),identityKey:canonicalK(k),mode:'HUMAN',
     epoch:after.custodyEpoch,accountRevocationEpoch:after.accountEpoch,
     consentEpoch:after.consentEpoch,canSend:false,requestId:result.requestId});
 }
 function reconcile(ctx,requestId){
   if(typeof requestId!=='string'||!requestId.startsWith('fake-'))
     fail('INVALID_MUTATION_REQUEST_ID');
   const actor=ctx?.principal_id;
   if(typeof actor!=='string'||!actor.startsWith('fake-'))fail('TRUSTED_CONTACT_ACTOR_REQUIRED');
   return store.mutationResult({actor,requestId});
 }
 function finishPending(ctx,requestId,typedPayload){
   const found=reconcile(ctx,requestId);
   if(found?.status==='COMMITTED')return found;
   if(found?.status!=='PENDING')fail('MUTATION_NOT_PENDING');
   const finalized=store.finalizeMutationFence({requestId,generation:found.generation,
     actor:ctx.principal_id,ownerValidatedMutation:typedPayload});
   if(isPending(finalized))return finalized;
   if(!isCommitted(finalized))fail(finalized?.reason??'W44_MUTATION_UNCOMMITTED');
   return reconcile(ctx,requestId);
 }
 return Object.freeze({read,current,epoch,registerAccount,bindPeer,
   revokeAccount,relinkAccount,createConsent,revokeConsent,evaluate,takeover,
   reconcile,finishPending});
}

/** W24 Owner PURE proof used by W44 inside the same SQLite transaction.
 * No callbacks may mutate W24 memory, W44 rows, or make async/provider calls. */
export function createW24DurableProofVerifier({proofAuthority,authorizeOperator}={}){
 if(typeof authorizeOperator!=='function')fail('TRUSTED_OWNER_PROOF_PORT_REQUIRED');
 return ({actor,kind,identity,mutation})=>{
  try{
   if(typeof actor!=='string'||!actor.startsWith('fake-')||
     !identity||!mutation||typeof mutation!=='object'||
     authorizeOperator({actor,kind,identity})!==true)return {verified:false};
   if(kind==='HUMAN_TAKEOVER')
     return {verified:mutation.action==='USER_EDIT'};
   if(kind==='REVOKE_ACCOUNT'||kind==='REVOKE_CONSENT'||
      kind==='REVOKE_GRANT')return {verified:true};
   if(!privileged.has(kind)||typeof proofAuthority?.evaluate!=='function')
     return {verified:false};
   const proofRef=mutation.bindingProofRef??mutation.peerProofRef??mutation.proofRef;
   if(typeof proofRef!=='string'||!proofRef.startsWith('fake-'))
     return {verified:false};
   const ctx={tenant:identity.tenant,principal_id:actor,input_domain:'CONTACT'};
   const response=proofAuthority.evaluate({ctx:freeze(ctx),k:freeze(identity),kind,
     proof_ref:proofRef,purpose:mutation.purpose,
     operation:mutation.operation,subject_id:mutation.subjectId});
   if(response?.then)throw Error('ASYNC_MUTATION_PROOF_NOT_ATOMIC');
   return {verified:response?.approved===true};
  }catch{return {verified:false}}
 };
}
