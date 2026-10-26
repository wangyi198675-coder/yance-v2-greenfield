import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openEligibilityStore} from './index.mjs';

// W44 native management tests use fixtures only, NOT user authorization.
const actor='fake-owner-1';
const K=(peer_id='fake-A')=>({tenant:'SYNTHETIC_TEST_ONLY',
  account:'fixture-native-control',channel:'TELEGRAM_PERSONAL',peer_id,binding_revision:1});
let idCounter=0;
const id=tag=>'fake-'+tag+'-'+(++idCounter);
function setup(t,{bootstrap=true}={}){
 const dir=mkdtempSync(join(tmpdir(),'w44-manage-'));
 const path=join(dir,'authority.sqlite'),opened=[];
 let tick=Date.now();
 const opts={path,requireDurableIdentity:true,now:()=>tick,
   authorizeMutation:({actor:a})=>a===actor,
   verifyIdentity:()=>{throw Error('IN_MEMORY_IDENTITY_PROHIBITED')},
   verifyDeliveryArm:()=>({verified:true}),
   verifySettlement:({evidence})=>evidence==='fake-ack'
     ?{verified:true,outcome:'CHARGED',actualUnits:1}
     :evidence==='fake-proven-no-send'
       ?{verified:true,outcome:'PROVEN_NO_SEND'}:{verified:false},
   verifyOwnerMutation:({actor:a,kind,mutation})=>({
     verified:a===actor&&(
       ['REGISTER_ACCOUNT','BIND_PEER','HUMAN_TAKEOVER'].includes(kind)||
       ['ISSUE_GRANT','PAUSE_GRANT','RESUME_GRANT','REVOKE_GRANT'].includes(kind)&&
         mutation?.approvalRef==='fake-approved-user-action'
     )})};
 const create=()=>{const s=openEligibilityStore(opts);opened.push(s);return s};
 t.after(()=>{for(const s of opened.reverse())try{s.close()}catch{};
    rmSync(dir,{recursive:true,force:true})});
 const s=create();
 function mutate(k,scope,kind,payload){
   const a=s.readIdentityAuthority({identity:k,actor});
   const b=s.readMutationFence({identity:k,actor,scope});
   const p={...payload},request=s.requestMutationFence({identity:k,actor,scope,kind,payload:p,
     idempotencyKey:id('identity'),
     expectedGeneration:b.generation,expectedBindingRevision:a.bindingRevision,
     expectedAccountEpoch:a.accountEpoch,expectedConsentEpoch:a.consentEpoch,
     expectedCustodyEpoch:a.custodyEpoch});
   assert.equal(request.ok,true,JSON.stringify(request));
   const done=s.finalizeMutationFence({requestId:request.requestId,
     generation:request.generation,actor,ownerValidatedMutation:p});
   assert.equal(done.status,'COMMITTED',JSON.stringify(done));
   return done;
 }
 if(bootstrap){
   mutate(K(),'GLOBAL','REGISTER_ACCOUNT',{bindingProofRef:'fake-verified-account'});
   for(const k of [K(),K('fake-B'),K('fake-C')])
     mutate(k,'CONTACT','BIND_PEER',{peerProofRef:'fake-verified-peer'});
 }
 function grant(k,scope,action,options={},store=s){
   const state=store.readGrantState({identity:k,actor,scope});
   const payload={grantScope:scope,approvalRef:'fake-approved-user-action',...options};
   return store.grantAction({identity:k,scope,actor,action,payload,
     idempotencyKey:id('manage'),expectedGeneration:state.barrier.generation,
     expectedBindingRevision:state.identityEpochs.bindingRevision,
     expectedAccountEpoch:state.identityEpochs.accountEpoch,
     expectedConsentEpoch:state.identityEpochs.consentEpoch,
     expectedCustodyEpoch:state.identityEpochs.custodyEpoch});
 }
 return {s,create,grant,mutate,now:()=>tick,advance:ms=>tick+=ms};
}
test('W44 native reads distinguish no account from a signed synthetic grant; never claims real permission',t=>{
 const f=setup(t,{bootstrap:false});
 const state=f.s.readGrantState({identity:K(),actor,scope:'GLOBAL'});
 assert.equal(state.reason,'ACCOUNT_NOT_CONFIGURED');
 assert.equal(state.realUserAuthorized,false);
 assert.equal(state.realAccountVerified,false);
 const refused=f.grant(K(),'GLOBAL','ISSUE',
   {budgetUnits:3,expiresAt:f.now()+100000,expectedGrantEpoch:0});
 assert.equal(refused.status,'DENIED');
 assert.equal(refused.reason,'ACCOUNT_OR_PEER_UNBOUND');
 assert.throws(()=>f.s.readGrantState({identity:{...K(),tenant:'real-customer'},actor,scope:'GLOBAL'}),
   /ONLY_SYNTHETIC_FULL_K/);
 assert.throws(()=>f.s.readGrantState({identity:K(),actor:'fake-stranger',scope:'GLOBAL'}),
   /W24_MUTATION_NOT_AUTHORIZED/);
});
test('scoped issue exposes durable budget/expiry/readback and eligibility A/B/C, without live-authorization claim',t=>{
 const f=setup(t);
 const created=f.grant(K(),'GLOBAL','ISSUE',
   {budgetUnits:3,expiresAt:f.now()+200000,expectedGrantEpoch:0});
 assert.equal(created.status,'COMMITTED',JSON.stringify(created));
 assert.equal(created.readback.grant.epoch,1);
 assert.equal(created.readback.grant.budgetLimit,3);
 assert.equal(created.readback.realUserAuthorized,false);
 for(const k of [K(),K('fake-B'),K('fake-C')])
   assert.equal(f.s.qualify(k).ok,true);
 const local=f.grant(K('fake-B'),'CONTACT','ISSUE',
   {budgetUnits:2,expiresAt:f.now()+150000,expectedGrantEpoch:0});
 assert.equal(local.status,'COMMITTED',JSON.stringify(local));
 assert.equal(f.s.readGrantState({identity:K('fake-B'),actor,scope:'CONTACT'}).effectiveScope,'CONTACT');
 assert.equal(f.s.readGrantState({identity:K('fake-C'),actor,scope:'CONTACT'}).effectiveScope,'GLOBAL');
});
test('CONTACT pause and resume blocks A alone, B/C remain eligible under GLOBAL',t=>{
 const f=setup(t);
 assert.equal(f.grant(K(),'GLOBAL','ISSUE',
   {budgetUnits:4,expiresAt:f.now()+200000,expectedGrantEpoch:0}).status,'COMMITTED');
 const paused=f.grant(K(),'CONTACT','PAUSE');
 assert.equal(paused.status,'COMMITTED',JSON.stringify(paused));
 assert.equal(paused.readback.paused,true);
 assert.equal(f.s.qualify(K()).reason,'CONTACT_PAUSED');
 assert.equal(f.s.qualify(K('fake-B')).ok,true);
 assert.equal(f.s.qualify(K('fake-C')).ok,true);
 const opened=f.create();
 assert.equal(opened.readGrantState({identity:K(),actor,scope:'CONTACT'}).paused,true);
 const resumed=f.grant(K(),'CONTACT','RESUME',{},opened);
 assert.equal(resumed.status,'COMMITTED',JSON.stringify(resumed));
 assert.equal(opened.qualify(K()).ok,true);
 assert.equal(opened.qualify(K('fake-B')).ok,true);
 assert.equal(opened.readGrantState({identity:K(),actor,scope:'CONTACT'}).pauseEpoch,2);
});
test('GLOBAL pause/resume applies to A/B/C even with B contact grant; revoke never resurrects',t=>{
 const f=setup(t);
 assert.equal(f.grant(K(),'GLOBAL','ISSUE',{budgetUnits:5,expiresAt:f.now()+300000,
   expectedGrantEpoch:0}).status,'COMMITTED');
 assert.equal(f.grant(K('fake-B'),'CONTACT','ISSUE',
   {budgetUnits:2,expiresAt:f.now()+250000,expectedGrantEpoch:0}).status,'COMMITTED');
 assert.equal(f.grant(K(),'GLOBAL','PAUSE').status,'COMMITTED');
 for(const k of [K(),K('fake-B'),K('fake-C')])assert.equal(f.s.qualify(k).reason,'GLOBAL_PAUSED');
 assert.equal(f.grant(K(),'GLOBAL','RESUME').status,'COMMITTED');
 for(const k of [K(),K('fake-B'),K('fake-C')])assert.equal(f.s.qualify(k).ok,true);
 assert.equal(f.grant(K(),'GLOBAL','REVOKE').status,'COMMITTED');
 for(const k of [K(),K('fake-B'),K('fake-C')])assert.equal(f.s.qualify(k).reason,'GLOBAL_REVOKED');
 assert.equal(f.grant(K(),'GLOBAL','RESUME').reason,'GRANT_NOT_PAUSED');
});
test('after actual A HUMAN takeover, A fails closed while B/C legally continue',t=>{
 const f=setup(t);
 assert.equal(f.grant(K(),'GLOBAL','ISSUE',{budgetUnits:5,expiresAt:f.now()+300000,
   expectedGrantEpoch:0}).status,'COMMITTED');
 f.mutate(K(),'CONTACT','HUMAN_TAKEOVER',{action:'USER_EDIT'});
 assert.equal(f.s.qualify(K()).reason,'HUMAN_CUSTODY');
 assert.equal(f.s.qualify(K('fake-B')).ok,true);
 assert.equal(f.s.qualify(K('fake-C')).ok,true);
 assert.equal(f.s.readGrantState({identity:K(),actor,scope:'CONTACT'}).custodyMode,'HUMAN');
});
test('budget exhausted and expiry are truthful; invalid new budget denied before PENDING',t=>{
 const f=setup(t);
 assert.equal(f.grant(K(),'GLOBAL','ISSUE',{budgetUnits:1,expiresAt:f.now()+120000,
   expectedGrantEpoch:0}).status,'COMMITTED');
 const reserved=f.s.reserve({identity:K(),intentId:id('budget')});
 assert.equal(reserved.ok,true);
 assert.equal(f.s.qualify(K()).reason,'BUDGET_EXHAUSTED');
 let s=f.s.readGrantState({identity:K(),actor,scope:'GLOBAL'});
 assert.equal(s.reason,'BUDGET_EXHAUSTED');
 assert.equal(s.budget.reserved,1);
 const denied=f.grant(K(),'GLOBAL','ISSUE',{budgetUnits:0,
   expiresAt:f.now()+500000,expectedGrantEpoch:s.grant.epoch});
 assert.equal(denied.reason,'INVALID_GRANT_BUDGET_OR_EXPIRY');
 assert.equal(f.s.readGrantState({identity:K(),actor,scope:'GLOBAL'}).barrier.pending,false);
 assert.equal(f.s.finish({identity:K(),intentId:JSON.parse(reserved.intentKey)[1],action:'RELEASE'}).state,'RELEASED');
 f.advance(120001);
 assert.equal(f.s.qualify(K()).reason,'GLOBAL_EXPIRED');
 assert.equal(f.s.readGrantState({identity:K(),actor,scope:'GLOBAL'}).reason,'GLOBAL_EXPIRED');
});
test('invalid proof / version race produces DENIED or CONFLICT without pending barrier',t=>{
 const f=setup(t);
 const before=f.s.readGrantState({identity:K(),actor,scope:'GLOBAL'});
 const expected={expectedGeneration:before.barrier.generation,
   expectedBindingRevision:before.identityEpochs.bindingRevision,
   expectedAccountEpoch:before.identityEpochs.accountEpoch,
   expectedConsentEpoch:before.identityEpochs.consentEpoch,
   expectedCustodyEpoch:before.identityEpochs.custodyEpoch};
 const denied=f.s.grantAction({identity:K(),actor,scope:'GLOBAL',action:'ISSUE',
   idempotencyKey:id('invalid-proof'),...expected,
   payload:{grantScope:'GLOBAL',approvalRef:'fake-client-claim',
     expectedGrantEpoch:0,budgetUnits:3,expiresAt:f.now()+100000}});
 assert.equal(denied.reason,'W24_MUTATION_PROOF_REJECTED');
 assert.equal(f.s.readGrantState({identity:K(),actor,scope:'GLOBAL'}).barrier.pending,false);
 assert.equal(f.grant(K(),'GLOBAL','ISSUE',
   {budgetUnits:3,expiresAt:f.now()+200000,expectedGrantEpoch:0}).status,'COMMITTED');
 const stale=f.s.grantAction({identity:K(),actor,scope:'GLOBAL',action:'ISSUE',
   idempotencyKey:id('stale'),...expected,
   payload:{grantScope:'GLOBAL',approvalRef:'fake-approved-user-action',
     expectedGrantEpoch:0,budgetUnits:4,expiresAt:f.now()+300000}});
 assert.equal(stale.status,'CONFLICT');
 assert.equal(stale.reason,'STALE_MUTATION_GENERATION');
 assert.equal(f.s.readGrantState({identity:K(),actor,scope:'GLOBAL'}).barrier.pending,false);
});
test('ARMED/UNKNOWN pause persists PENDING through restart; verified late ACK settles original, never retries',t=>{
 const f=setup(t);
 assert.equal(f.grant(K(),'GLOBAL','ISSUE',
   {budgetUnits:2,expiresAt:f.now()+200000,expectedGrantEpoch:0}).status,'COMMITTED');
 const msg=id('w25-message');
 assert.equal(f.s.reserve({identity:K(),intentId:msg}).ok,true);
 assert.equal(f.s.enterBoundary({identity:K(),intentId:msg}).ok,true);
 assert.equal(f.s.armSend({identity:K(),intentId:msg,w25IntentId:id('w25-original')}).ok,true);
 const pending=f.grant(K(),'CONTACT','PAUSE');
 assert.equal(pending.status,'PENDING',JSON.stringify(pending));
 assert.equal(pending.readback.barrier.pending,true);
 assert.equal(f.s.settleBoundary({identity:K(),intentId:msg,evidence:'fake-UNKNOWN'}).reason,
   'W25_RECEIPT_UNVERIFIED');
 const restarted=f.create();
 assert.equal(restarted.mutationResult({requestId:pending.requestId,actor}).status,'PENDING');
 assert.equal(restarted.leaseStatus(K()).active,true);
 assert.equal(restarted.qualify(K()).reason,'AUTHORITY_MUTATION_PENDING');
 assert.equal(restarted.settleBoundary({identity:K(),intentId:msg,
   evidence:'fake-ack'}).state,'COMMITTED');
 const committed=restarted.finalizeMutationFence({requestId:pending.requestId,
   generation:pending.generation,actor,
   ownerValidatedMutation:{grantScope:'CONTACT',approvalRef:'fake-approved-user-action'}});
 assert.equal(committed.status,'COMMITTED',JSON.stringify(committed));
 assert.equal(restarted.readGrantState({identity:K(),actor,scope:'CONTACT'}).paused,true);
 assert.equal(restarted.readGrantState({identity:K(),actor,scope:'GLOBAL'}).budget.spent,1);
 assert.equal(restarted.mutationResult({requestId:pending.requestId,actor}).status,'COMMITTED');
});

test('GLOBAL ARMED pause yields accurate CONTACT B/C readback as pending through cold reopen',t=>{
 const f=setup(t);
 assert.equal(f.grant(K(),'GLOBAL','ISSUE',{budgetUnits:3,expiresAt:f.now()+220000,
   expectedGrantEpoch:0}).status,'COMMITTED');
 const msg=id('armed-global');
 assert.equal(f.s.reserve({identity:K('fake-B'),intentId:msg}).ok,true);
 assert.equal(f.s.enterBoundary({identity:K('fake-B'),intentId:msg}).ok,true);
 assert.equal(f.s.armSend({identity:K('fake-B'),intentId:msg,
   w25IntentId:id('w25-global-attempt')}).ok,true);
 const p=f.grant(K(),'GLOBAL','PAUSE');
 assert.equal(p.status,'PENDING');
 const contact=f.s.readGrantState({identity:K('fake-C'),actor,scope:'CONTACT'});
 assert.equal(contact.reason,'AUTHORITY_MUTATION_PENDING');
 assert.equal(contact.barrier.globalPending,true);
 assert.equal(contact.barrier.blockingRequestId,p.requestId);
 assert.equal(f.s.qualify(K('fake-C')).reason,'AUTHORITY_MUTATION_PENDING');
 const after=f.create();
 assert.equal(after.readGrantState({identity:K('fake-C'),actor,scope:'CONTACT'}).barrier.globalPending,true);
 assert.equal(after.settleBoundary({identity:K('fake-B'),intentId:msg,
   evidence:'fake-proven-no-send'}).state,'RELEASED');
 assert.equal(after.finalizeMutationFence({actor,requestId:p.requestId,
   generation:p.generation,
   ownerValidatedMutation:{grantScope:'GLOBAL',approvalRef:'fake-approved-user-action'}}).status,'COMMITTED');
 for(const k of [K(),K('fake-B'),K('fake-C')])assert.equal(after.qualify(k).reason,'GLOBAL_PAUSED');
});
test('signed reissue cannot reset spent budget or return success on old grant epoch',t=>{
 const f=setup(t);
 assert.equal(f.grant(K(),'GLOBAL','ISSUE',{budgetUnits:2,expiresAt:f.now()+200000,
   expectedGrantEpoch:0}).status,'COMMITTED');
 const msg=id('spent');
 assert.equal(f.s.reserve({identity:K(),intentId:msg}).ok,true);
 assert.equal(f.s.enterBoundary({identity:K(),intentId:msg}).ok,true);
 assert.equal(f.s.armSend({identity:K(),intentId:msg,w25IntentId:id('w25-charged')}).ok,true);
 assert.equal(f.s.settleBoundary({identity:K(),intentId:msg,evidence:'fake-ack'}).state,'COMMITTED');
 assert.equal(f.s.readGrantState({identity:K(),actor,scope:'GLOBAL'}).budget.spent,1);
 const low=f.grant(K(),'GLOBAL','ISSUE',
   {budgetUnits:0,expiresAt:f.now()+200000,expectedGrantEpoch:1});
 assert.equal(low.status,'CONFLICT');
 assert.equal(low.reason,'INVALID_GRANT_BUDGET_OR_EXPIRY');
 const valid=f.grant(K(),'GLOBAL','ISSUE',
   {budgetUnits:2,expiresAt:f.now()+400000,expectedGrantEpoch:1});
 assert.equal(valid.status,'COMMITTED');
 assert.equal(valid.readback.budget.spent,1);
 assert.equal(valid.readback.budget.available,1);
 const stale=f.grant(K(),'GLOBAL','ISSUE',
   {budgetUnits:3,expiresAt:f.now()+500000,expectedGrantEpoch:1});
 assert.equal(stale.status,'CONFLICT');
 assert.equal(stale.reason,'STALE_GRANT_EPOCH');
 assert.equal(f.s.readGrantState({identity:K(),actor,scope:'GLOBAL'}).barrier.pending,false);
});
