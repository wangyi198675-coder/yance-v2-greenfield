import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openEligibilityStore} from './index.mjs';

// Synthetic W44-only STOP contract regression. No Agent toggle,
// social provider, W25 sender, second DB, human account or paid model.
const actor='fake-owner-1';
const K=(peer_id='fake-A')=>({tenant:'SYNTHETIC_TEST_ONLY',
  account:'fixture-stop',channel:'WHATSAPP_PERSONAL',peer_id,binding_revision:1});
let sequence=0;
const unique=prefix=>'fake-'+prefix+'-'+(++sequence);
function setup(t){
 const dir=mkdtempSync(join(tmpdir(),'w44-stop-fence-'));
 const path=join(dir,'existing-w44.sqlite'),stores=[];
 const opts={path,requireDurableIdentity:true,
   authorizeMutation:({actor:a})=>a===actor,
   verifyIdentity:()=>{throw Error('W24_MEMORY_BYPASS_FORBIDDEN')},
   verifyDeliveryArm:()=>({verified:true}),
   verifySettlement:({evidence})=>evidence==='fake-verified-ack'
     ?{verified:true,outcome:'CHARGED',actualUnits:1}
     :evidence==='fake-verified-no-send'
     ?{verified:true,outcome:'PROVEN_NO_SEND'}:{verified:false},
   verifyOwnerMutation:({actor:a,kind,mutation})=>({verified:a===actor&&
     mutation?.validatedByW24===true&&
     (kind!=='REVOKE_GRANT'||mutation.stopProofRef==='fake-explicit-stop')})};
 const create=()=>{const s=openEligibilityStore(opts);stores.push(s);return s};
 t.after(()=>{for(const s of stores.reverse())try{s.close()}catch{};
   rmSync(dir,{recursive:true,force:true})});
 const s=create();
 function mutate(k,kind,scope,payload,requestId=unique('native')){
   const current=s.readIdentityAuthority({actor,identity:k});
   const barrier=s.readMutationFence({actor,identity:k,scope});
   const full={actor,identity:k,scope,kind,
     expectedGeneration:barrier.generation,
     expectedBindingRevision:current.bindingRevision,
     expectedAccountEpoch:current.accountEpoch,
     expectedConsentEpoch:current.consentEpoch,
     expectedCustodyEpoch:current.custodyEpoch,
     idempotencyKey:requestId,payload:{...payload,validatedByW24:true}};
   const req=s.requestMutationFence(full);
   return {request:req,args:full,finalize:(store=s)=>
     store.finalizeMutationFence({requestId:req.requestId,
       generation:req.generation,actor,ownerValidatedMutation:full.payload})};
 }
 const init=mutate(K(),'REGISTER_ACCOUNT','GLOBAL',
   {bindingProofRef:'fake-verified-account'});
 assert.equal(init.finalize().status,'COMMITTED');
 for(const k of [K(),K('fake-B'),K('fake-C')]){
   const p=mutate(k,'BIND_PEER','CONTACT',{peerProofRef:'fake-verified-peer'});
   assert.equal(p.finalize().status,'COMMITTED');
 }
 s.grant({identity:K(),scope:'GLOBAL',actor,budgetUnits:5,
   expiresAt:Date.now()+300000});
 function stop(k,scope,id=unique('stop')){
   return mutate(k,'REVOKE_GRANT',scope,{grantScope:scope,
     stopProofRef:'fake-explicit-stop'},id);
 }
 return {s,create,stop,mutate};
}
function armed(s,k=K(),id=unique('message')){
 assert.equal(s.reserve({identity:k,intentId:id}).ok,true);
 assert.equal(s.enterBoundary({identity:k,intentId:id}).ok,true);
 assert.equal(s.armSend({identity:k,intentId:id,
   w25IntentId:unique('existing-w25-attempt')}).ok,true);
 return id;
}
test('stop request precedes send: PENDING gate blocks new ARM; CONTACT stop does not block B/C',t=>{
 const {s,stop}=setup(t);
 const p=stop(K(),'CONTACT');
 assert.equal(p.request.status,'PENDING');
 assert.equal(s.reserve({identity:K(),intentId:unique('next')}).reason,
   'AUTHORITY_MUTATION_PENDING');
 assert.equal(s.qualify(K('fake-B')).ok,true);
 assert.equal(s.qualify(K('fake-C')).ok,true);
 assert.equal(p.finalize().status,'COMMITTED');
 assert.equal(s.qualify(K()).reason,'CONTACT_REVOKED');
 assert.equal(s.qualify(K('fake-B')).ok,true);
 assert.equal(s.qualify(K('fake-C')).ok,true);
 assert.equal(s.mutationResult({requestId:p.request.requestId,actor}).status,
   'COMMITTED');
});
test('W25 ARMED before stop: stop is PENDING, not false success; UNKNOWN holds budget and lease',t=>{
 const {s,create,stop}=setup(t);
 const message=armed(s);
 const p=stop(K(),'CONTACT','fake-stop-after-armed');
 assert.equal(p.request.status,'PENDING');
 const blocked=p.finalize();
 assert.equal(blocked.status,'PENDING');
 assert.equal(blocked.reason,'ACTIVE_SEND_MUST_SETTLE_FIRST');
 assert.equal(s.mutationResult({requestId:p.request.requestId,actor}).status,
   'PENDING');
 assert.equal(s.settleBoundary({identity:K(),intentId:message,
   evidence:'fake-UNKNOWN'}).reason,'W25_RECEIPT_UNVERIFIED');
 const cold=create();
 assert.equal(cold.leaseStatus(K()).active,true);
 assert.equal(cold.mutationResult({requestId:p.request.requestId,actor}).status,
   'PENDING');
 assert.equal(cold.qualify(K()).reason,'AUTHORITY_MUTATION_PENDING');
 assert.equal(p.finalize(cold).status,'PENDING');
 assert.equal(cold.settleBoundary({identity:K(),intentId:message,
   evidence:'fake-verified-ack'}).state,'COMMITTED');
 assert.equal(cold.leaseStatus(K()).active,false);
 assert.equal(p.finalize(cold).status,'COMMITTED');
 assert.equal(cold.qualify(K()).reason,'CONTACT_REVOKED');
 assert.equal(cold.mutationResult({requestId:p.request.requestId,actor}).status,
   'COMMITTED');
 assert.equal(cold.finalizeMutationFence({requestId:p.request.requestId,
   generation:p.request.generation,actor,
   ownerValidatedMutation:p.args.payload}).replayed,true);
});
test('GLOBAL stop first freezes A/B/C; global revoke overrides existing CONTACT grants',t=>{
 const {s,stop}=setup(t);
 s.grant({identity:K('fake-B'),scope:'CONTACT',actor,budgetUnits:2,
   expiresAt:Date.now()+200000});
 const p=stop(K(),'GLOBAL');
 for(const k of [K(),K('fake-B'),K('fake-C')])
   assert.equal(s.qualify(k).reason,'AUTHORITY_MUTATION_PENDING');
 assert.equal(p.finalize().status,'COMMITTED');
 for(const k of [K(),K('fake-B'),K('fake-C')])
   assert.equal(s.qualify(k).reason,'GLOBAL_REVOKED');
});
test('GLOBAL stop requested after another contact is ARMED waits existing attempt; verified no-send completes',t=>{
 const {s,stop}=setup(t);
 const message=armed(s,K('fake-B'));
 const p=stop(K(),'GLOBAL');
 assert.equal(p.request.status,'PENDING');
 assert.equal(p.finalize().reason,'ACTIVE_SEND_MUST_SETTLE_FIRST');
 for(const k of [K(),K('fake-B'),K('fake-C')])
   assert.equal(s.qualify(k).reason,'AUTHORITY_MUTATION_PENDING');
 assert.equal(s.settleBoundary({identity:K('fake-B'),intentId:message,
   evidence:'fake-verified-no-send'}).state,'RELEASED');
 assert.equal(p.finalize().status,'COMMITTED');
 assert.equal(s.qualify(K('fake-B')).reason,'GLOBAL_REVOKED');
});
test('reject CONTACT fence carrying GLOBAL revoke payload; no scope-escalation through ARMED send',t=>{
 const {s,mutate}=setup(t);
 const b=armed(s,K('fake-B'));
 const malicious=mutate(K(),'REVOKE_GRANT','CONTACT',{
   grantScope:'GLOBAL',stopProofRef:'fake-explicit-stop'},'fake-scope-mismatch');
 assert.equal(malicious.request.reason,'STOP_SCOPE_MISMATCH');
 assert.equal(s.readMutationFence({actor,identity:K(),scope:'CONTACT'}).pending,false);
 assert.equal(s.readMutationFence({actor,identity:K(),scope:'GLOBAL'}).pending,false);
 assert.equal(s.qualify(K()).ok,true);
 assert.equal(s.leaseStatus(K('fake-B')).active,true);
 assert.equal(s.settleBoundary({identity:K('fake-B'),intentId:b,
   evidence:'fake-verified-no-send'}).state,'RELEASED');
});
test('PENDING status and generation survive restart; same stop request ID is idempotent',t=>{
 const {s,create,stop}=setup(t);
 const message=armed(s);
 const p=stop(K(),'CONTACT','fake-stable-stop');
 const first=p.finalize();
 assert.equal(first.status,'PENDING');
 const cold=create();
 const status=cold.mutationResult({requestId:p.request.requestId,actor});
 assert.equal(status.status,'PENDING');
 assert.equal(status.generation,p.request.generation);
 const repeated=cold.requestMutationFence(p.args);
 assert.equal(repeated.requestId,p.request.requestId);
 assert.equal(repeated.replayed,true);
 assert.equal(cold.settleBoundary({identity:K(),intentId:message,
   evidence:'fake-verified-ack'}).state,'COMMITTED');
 assert.equal(p.finalize(cold).status,'COMMITTED');
 assert.equal(cold.readMutationFence({actor,identity:K(),scope:'CONTACT'}).generation,
   p.request.generation);
 assert.equal(cold.mutationResult({requestId:p.request.requestId,actor}).status,
   'COMMITTED');
});
