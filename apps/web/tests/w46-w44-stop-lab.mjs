// W46 TEST-ONLY bridge to the ORIGINAL W44 REVOKE_GRANT native transaction.
// This is NOT an application server, authenticated session or product endpoint.
// Reuses the original W46 SQLite fixture file, no new product DB or Agent.
import {randomUUID} from 'node:crypto';
const actor='fake-owner-1';
const fail=code=>{throw Error(code)};
const scopes=new Set(['CONTACT','GLOBAL']);
const accountId=k=>[k.tenant,k.account,k.channel].join('|');
const key=k=>[k.tenant,k.account,k.channel,k.peer_id,k.binding_revision].join('|');
export function setupNativeStopLab({openEligibilityStore,path,contacts}={}){
 if(typeof openEligibilityStore!=='function'||!path||!Array.isArray(contacts))
   fail('W44_NATIVE_DEPENDENCY_REQUIRED');
 const store=openEligibilityStore({
   path,requireDurableIdentity:true,
   authorizeMutation:({actor:a})=>a===actor,
   verifyIdentity:()=>{throw Error('DURABLE_W44_NEVER_W24_RAM')},
   verifyDeliveryArm:()=>({verified:true}), // LAB ONLY, no W25 sender
   verifyOwnerMutation:({actor:a,kind,mutation})=>({
     verified:a===actor&&mutation?.validatedByW24===true &&
       (kind!=='REVOKE_GRANT'||mutation.stopProofRef==='fake-explicit-stop')})
 });
 function trusted(k){
   if(!k||k.tenant!=='SYNTHETIC_TEST_ONLY'||!k.account?.startsWith('fixture-')||
      !k.peer_id?.startsWith('fake-'))fail('SYNTHETIC_CONTACT_ONLY');
   const c=contacts.find(x=>key(x)===key(k));
   if(!c)fail('STOP_IDENTITY_NOT_IN_ORIGINAL_BC');
   // Test trusted actor is server-owned; browser never provides actor.
   return c;
 }
 function nativeMutation(k,kind,scope,payload){
   const current=store.readIdentityAuthority({actor,identity:k});
   const fence=store.readMutationFence({actor,identity:k,scope});
   const body={actor,identity:k,scope,kind,expectedGeneration:fence.generation,
     expectedBindingRevision:current.bindingRevision,
     expectedAccountEpoch:current.accountEpoch,
     expectedConsentEpoch:current.consentEpoch,
     expectedCustodyEpoch:current.custodyEpoch,
     idempotencyKey:'fake-w46-stop-'+randomUUID(),
     payload:{...payload,validatedByW24:true}};
   const requested=store.requestMutationFence(body);
   if(requested?.ok!==true||requested?.status!=='PENDING')
     fail(requested?.reason||'NATIVE_REVOKE_REQUEST_FAILED');
   const final=store.finalizeMutationFence({actor,
     requestId:requested.requestId,generation:requested.generation,
     ownerValidatedMutation:body.payload});
   return {requested,final};
 }
 const uniqueAccounts=new Set();
 for(const c of contacts){
   trusted(c);
   const a=accountId(c);
   if(!uniqueAccounts.has(a)){
     uniqueAccounts.add(a);
     const register=nativeMutation(c,'REGISTER_ACCOUNT','GLOBAL',
       {bindingProofRef:'fake-verified-account'});
     if(register.final?.status!=='COMMITTED')fail('LAB_ACCOUNT_REGISTRATION_FAILED');
   }
   const bound=nativeMutation(c,'BIND_PEER','CONTACT',
     {peerProofRef:'fake-verified-peer'});
   if(bound.final?.status!=='COMMITTED')fail('LAB_PEER_BIND_FAILED');
 }
 for(const a of uniqueAccounts){
   const c=contacts.find(x=>accountId(x)===a);
   store.grant({identity:c,scope:'GLOBAL',actor,budgetUnits:5,expiresAt:Date.now()+900000});
 }
 const result=(k,scope)=>{
   trusted(k);if(!scopes.has(scope))fail('STOP_SCOPE_INVALID');
   const current=store.readIdentityAuthority({actor,identity:k});
   if(current.valid!==true)fail('W44_DURABLE_IDENTITY_INVALID');
   const fence=store.readMutationFence({actor,identity:k,scope});
   if(fence.kind==='REVOKE_GRANT'&&fence.status==='PENDING'){
     const actual=store.mutationResult({actor,requestId:fence.requestId});
     if(actual.status!=='PENDING')fail('STOP_PENDING_MISMATCH');
     return {status:'PENDING',requestId:fence.requestId,generation:fence.generation};
   }
   if(fence.kind==='REVOKE_GRANT'&&fence.status==='COMMITTED'){
     const actual=store.mutationResult({actor,requestId:fence.requestId});
     if(actual.status!=='COMMITTED')fail('STOP_COMMITTED_NOT_READ_BACK');
     const denied=store.qualify(k);
     if(denied.ok===true)fail('W44_REVOKE_DID_NOT_FENCE_QUALIFICATION');
     return {status:'COMMITTED',requestId:fence.requestId,generation:fence.generation};
   }
   const grant=store.qualify(k);
   return {status:grant?.ok===true?'ACTIVE':'UNQUALIFIED',
     generation:fence.generation,reason:grant?.ok?null:grant?.reason||'NO_EFFECTIVE_GRANT'};
 };
 const read=(k,scope)=>({authoritative:true,identityKey:key(trusted(k)),scope,
    canSend:false,...result(k,scope)});
 const stop=(k,scope)=>{
   trusted(k);if(!scopes.has(scope))fail('STOP_SCOPE_INVALID');
   const before=read(k,scope);
   if(before.status==='PENDING'||before.status==='COMMITTED')return before;
   if(before.status!=='ACTIVE')fail('STOP_GRANT_NOT_EFFECTIVE');
   const {requested,final}=nativeMutation(k,'REVOKE_GRANT',scope,
      {grantScope:scope,stopProofRef:'fake-explicit-stop'});
   if(!['PENDING','COMMITTED'].includes(final?.status))fail('NATIVE_STOP_FINALIZE_INVALID');
   const after=read(k,scope);
   if(after.status!==final.status||after.requestId!==requested.requestId)
     fail('NATIVE_STOP_MUTATION_RESULT_MISMATCH');
   return after;
 };
 return Object.freeze({read,stop,store,
   armPending:(k,source)=>{
     trusted(k);
     // Original W44 synthetic ARM is only for testing PENDING, no W25 Provider.
     const reserved=store.reserve({identity:k,intentId:source,units:1});
     if(reserved.ok!==true)fail('STOP_LAB_RESERVE_FAILED');
     if(store.enterBoundary({identity:k,intentId:source}).ok!==true)fail('STOP_LAB_BOUNDARY_FAILED');
     if(store.armSend({identity:k,intentId:source,w25IntentId:'fake-w25-'+randomUUID()}).ok!==true)
       fail('STOP_LAB_ARM_FAILED');
     return true;
   },
   settle:(k,id)=>{
     trusted(k);
     // Not exposed as product endpoint; only synthetic local test uses this.
     return store.settleBoundary({identity:k,intentId:id,evidence:'fake-verified-no-send'});
   },
   close:()=>store.close()
 });
}
