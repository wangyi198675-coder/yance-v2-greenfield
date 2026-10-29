import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openEligibilityStore} from './index.mjs';

// All identities, approvals, provider receipts and clocks are SYNTHETIC.
// Never assert that a live user authorized or any real message was sent.
const actor='fake-mode-owner';
const K=(peer_id='fake-A')=>({tenant:'SYNTHETIC_TEST_ONLY',
 account:'fixture-modes',channel:'WHATSAPP_PERSONAL',peer_id,binding_revision:1});
let next=0;const iid=tag=>'fake-'+tag+'-'+(++next);
function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'w44-modes-'));
 let tick=Date.now(),stores=[];
 let agentState={active:false,revision:null};
 const options={path:join(dir,'w44.sqlite'),requireDurableIdentity:true,now:()=>tick,
  readAgentState:()=>agentState,
  authorizeMutation:({actor:a})=>a===actor,
  verifyDeliveryArm:()=>({verified:true}),
  verifySettlement:({evidence})=>evidence==='fake-ack'
   ?{verified:true,outcome:'CHARGED',actualUnits:1}:{verified:false},
  verifyOwnerMutation:({actor:a,kind,mutation})=>({verified:a===actor&&(
    ['REGISTER_ACCOUNT','BIND_PEER','HUMAN_TAKEOVER','REVOKE_ACCOUNT'].includes(kind)||
    ['ISSUE_GRANT','PAUSE_GRANT','RESUME_GRANT','REVOKE_GRANT',
     'MODE_MANUAL','MODE_ASSIST','MODE_AUTO'].includes(kind)&&
     mutation?.approvalRef==='fake-approved-user-action')})};
 const open=()=>{const s=openEligibilityStore(options);stores.push(s);return s};
 t.after(()=>{for(const s of stores.reverse())try{s.close()}catch{};
  rmSync(dir,{recursive:true,force:true})});
 const s=open();
 const mutation=(k,scope,kind,payload,store=s)=>{
  const a=store.readIdentityAuthority({actor,identity:k});
  const b=store.readMutationFence({actor,identity:k,scope});
  const req=store.requestMutationFence({identity:k,actor,scope,kind,
   idempotencyKey:iid('bootstrap'),payload,expectedGeneration:b.generation,
   expectedBindingRevision:a.bindingRevision,expectedAccountEpoch:a.accountEpoch,
   expectedConsentEpoch:a.consentEpoch,expectedCustodyEpoch:a.custodyEpoch});
  assert.equal(req.status,'PENDING',JSON.stringify(req));
  const done=store.finalizeMutationFence({requestId:req.requestId,
   generation:req.generation,actor,ownerValidatedMutation:payload});
  assert.equal(done.status,'COMMITTED',JSON.stringify(done));
 };
 mutation(K(),'GLOBAL','REGISTER_ACCOUNT',{bindingProofRef:'fake-binding-proof'});
 for(const k of [K(),K('fake-B'),K('fake-C')])
  mutation(k,'CONTACT','BIND_PEER',{peerProofRef:'fake-peer-proof'});
 const grant=(scope='GLOBAL',k=K(),units=3,store=s)=>{
  const b=store.readGrantState({actor,identity:k,scope});
  return store.grantAction({actor,identity:k,scope,action:'ISSUE',
   idempotencyKey:iid('grant'),expectedGeneration:b.barrier.generation,
   expectedBindingRevision:b.identityEpochs.bindingRevision,
   expectedAccountEpoch:b.identityEpochs.accountEpoch,
   expectedConsentEpoch:b.identityEpochs.consentEpoch,
   expectedCustodyEpoch:b.identityEpochs.custodyEpoch,
   payload:{grantScope:scope,approvalRef:'fake-approved-user-action',
    budgetUnits:units,expiresAt:tick+600000,expectedGrantEpoch:b.grant?.epoch??0}});
 };
 const switchTo=(targetMode,k=K(),options={})=>{
  const store=options.store??s;
  const b=store.readModeState({actor,identity:k});
  return store.switchMode({identity:k,actor,targetMode,
   idempotencyKey:options.id??iid('mode'),
   expectedGeneration:options.expectedGeneration??b.barriers.generation,
   expectedBindingRevision:b.identityEpochs.bindingRevision,
   expectedAccountEpoch:b.identityEpochs.accountEpoch,
   expectedConsentEpoch:b.identityEpochs.consentEpoch,
   expectedCustodyEpoch:options.expectedCustodyEpoch??b.identityEpochs.custodyEpoch,
   payload:{targetMode,approvalRef:options.proof??'fake-approved-user-action'}});
 };
 return {s,open,grant,switchTo,mutation,now:()=>tick,advance:ms=>tick+=ms,
  setAgentState:x=>{agentState=x}};
}
test('three-mode GET is read-only; MANUAL and ASSIST both prohibit automatic send',t=>{
 const f=fixture(t),a=K();
 const before=f.s.readModeState({identity:a,actor});
 assert.equal(before.selectedMode,'AUTO'); // legacy unset custody: no grant, not authorization
 assert.equal(before.nativeAutoEligible,false);
 assert.equal(before.effectiveMode,'MANUAL');
 assert.equal(before.realUserAuthorized,false);
 assert.equal(before.canSend,false);
 assert.equal(f.s.readModeState({identity:a,actor}).identityEpochs.custodyEpoch,0);
 assert.equal(f.switchTo('MANUAL').status,'COMMITTED');
 assert.equal(f.s.qualify(a).reason,'HUMAN_CUSTODY');
 assert.equal(f.switchTo('ASSIST').status,'COMMITTED');
 assert.equal(f.s.qualify(a).reason,'ASSIST_MODE_NO_AUTO');
 assert.equal(f.s.readModeState({identity:a,actor}).selectedMode,'ASSIST');
 assert.equal(f.s.readModeState({identity:a,actor}).realAutoAuthorized,false);
 const reopened=f.open();
 assert.equal(reopened.readModeState({identity:a,actor}).selectedMode,'ASSIST');
});
test('verified grant required to enter AUTO; MANUAL A does not touch B/C',t=>{
 const f=fixture(t);
 assert.equal(f.switchTo('ASSIST').status,'COMMITTED');
 const missing=f.switchTo('AUTO');
 assert.equal(missing.reason,'NO_EFFECTIVE_GRANT');
 assert.equal(f.s.readModeState({identity:K(),actor}).barriers.pending,false);
 assert.equal(f.grant().status,'COMMITTED');
 const auto=f.switchTo('AUTO');
 assert.equal(auto.status,'COMMITTED',JSON.stringify(auto));
 assert.equal(auto.readback.selectedMode,'AUTO');
 assert.equal(auto.readback.nativeAutoEligible,true);
 assert.equal(auto.readback.realAutoAuthorized,false);
 assert.equal(f.switchTo('MANUAL').status,'COMMITTED');
 assert.equal(f.s.qualify(K()).reason,'HUMAN_CUSTODY');
 assert.equal(f.s.qualify(K('fake-B')).ok,true);
 assert.equal(f.s.qualify(K('fake-C')).ok,true);
});
test('stale epoch/409, forged W24 proof, other actor and invalid mode never succeed',t=>{
 const f=fixture(t),before=f.s.readModeState({identity:K(),actor});
 const bad=f.switchTo('ASSIST',K(),{proof:'fake-unverified'});
 assert.equal(bad.status,'CONFLICT');
 assert.equal(bad.reason,'W24_MUTATION_PROOF_REJECTED');
 assert.equal(f.s.readModeState({identity:K(),actor}).barriers.pending,false);
 assert.equal(f.switchTo('ASSIST').status,'COMMITTED');
 const stale=f.switchTo('MANUAL',K(),{expectedGeneration:before.barriers.generation,
  expectedCustodyEpoch:before.identityEpochs.custodyEpoch});
 assert.equal(stale.status,'CONFLICT');
 assert.equal(stale.reason,'STALE_MUTATION_GENERATION');
 assert.equal(f.switchTo('INVALID').status,'DENIED');
 assert.throws(()=>f.s.readModeState({identity:K(),actor:'fake-other'}),/W24_MUTATION_NOT_AUTHORIZED/);
});
test('expired or exhausted budget, revoked grant and global pause prohibit AUTO',t=>{
 const f=fixture(t);
 assert.equal(f.grant('GLOBAL',K(),1).status,'COMMITTED');
 assert.equal(f.switchTo('ASSIST').status,'COMMITTED');
 const msg=iid('budget');assert.equal(f.s.reserve({identity:K('fake-B'),intentId:msg}).ok,true);
 assert.equal(f.switchTo('AUTO').reason,'BUDGET_EXHAUSTED');
 assert.equal(f.s.finish({identity:K('fake-B'),intentId:msg,action:'RELEASE'}).state,'RELEASED');
 const global=f.s.readGrantState({identity:K(),actor,scope:'GLOBAL'});
 const paused=f.s.grantAction({identity:K(),actor,scope:'GLOBAL',action:'PAUSE',
  idempotencyKey:iid('pause'),expectedGeneration:global.barrier.generation,
  expectedBindingRevision:global.identityEpochs.bindingRevision,
  expectedAccountEpoch:global.identityEpochs.accountEpoch,
  expectedConsentEpoch:global.identityEpochs.consentEpoch,
  expectedCustodyEpoch:global.identityEpochs.custodyEpoch,
  payload:{grantScope:'GLOBAL',approvalRef:'fake-approved-user-action'}});
 assert.equal(paused.status,'COMMITTED');
 assert.equal(f.switchTo('AUTO').reason,'GRANT_PAUSED');
});
test('W25 ARMED/UNKNOWN: switch stays PENDING across restart; no success until trusted ACK',t=>{
 const f=fixture(t);
 assert.equal(f.grant().status,'COMMITTED');
 const msg=iid('armed');assert.equal(f.s.reserve({identity:K(),intentId:msg}).ok,true);
 assert.equal(f.s.enterBoundary({identity:K(),intentId:msg}).ok,true);
 assert.equal(f.s.armSend({identity:K(),intentId:msg,w25IntentId:iid('attempt')}).ok,true);
 const pending=f.switchTo('ASSIST');
 assert.equal(pending.status,'PENDING');
 assert.equal(pending.readback.selectedMode,'AUTO');
 assert.equal(pending.readback.barriers.pending,true);
 assert.equal(f.s.settleBoundary({identity:K(),intentId:msg,evidence:'fake-UNKNOWN'}).reason,
  'W25_RECEIPT_UNVERIFIED');
 const cold=f.open();
 assert.equal(cold.mutationResult({requestId:pending.requestId,actor}).status,'PENDING');
 assert.equal(cold.qualify(K()).reason,'AUTHORITY_MUTATION_PENDING');
 assert.equal(cold.settleBoundary({identity:K(),intentId:msg,evidence:'fake-ack'}).state,'COMMITTED');
 const finalized=cold.finalizeMutationFence({requestId:pending.requestId,
  generation:pending.generation,actor,
  ownerValidatedMutation:{targetMode:'ASSIST',approvalRef:'fake-approved-user-action'}});
 assert.equal(finalized.status,'COMMITTED');
 assert.equal(cold.readModeState({identity:K(),actor}).selectedMode,'ASSIST');
 assert.equal(cold.qualify(K('fake-B')).ok,true);
 assert.equal(cold.mutationResult({requestId:pending.requestId,actor}).status,'COMMITTED');
});
test('actual USER_EDIT takes over only A; merely reading B or browsing history has zero mutation',t=>{
 const f=fixture(t);assert.equal(f.grant().status,'COMMITTED');
 const before=f.s.readModeState({identity:K('fake-B'),actor});
 f.mutation(K(),'CONTACT','HUMAN_TAKEOVER',{action:'USER_EDIT'});
 assert.equal(f.s.readModeState({identity:K(),actor}).selectedMode,'MANUAL');
 assert.equal(f.s.qualify(K()).reason,'HUMAN_CUSTODY');
 assert.equal(f.s.qualify(K('fake-B')).ok,true);
 assert.equal(f.s.qualify(K('fake-C')).ok,true);
 const after=f.s.readModeState({identity:K('fake-B'),actor});
 assert.equal(after.identityEpochs.custodyEpoch,before.identityEpochs.custodyEpoch);
});

test('expired AUTO grant and explicit scope revocation never resume old AUTO',t=>{
 const f=fixture(t);assert.equal(f.grant().status,'COMMITTED');
 assert.equal(f.switchTo('ASSIST').status,'COMMITTED');
 f.advance(600001);
 assert.equal(f.switchTo('AUTO').reason,'NO_EFFECTIVE_GRANT');
 assert.equal(f.s.readModeState({identity:K(),actor}).barriers.pending,false);
 assert.equal(f.grant().status,'COMMITTED'); // new scoped signed grant
 const before=f.s.readGrantState({identity:K(),actor,scope:'GLOBAL'});
 const revoke=f.s.grantAction({identity:K(),actor,scope:'GLOBAL',action:'REVOKE',
  idempotencyKey:iid('rev'),expectedGeneration:before.barrier.generation,
  expectedBindingRevision:before.identityEpochs.bindingRevision,
  expectedAccountEpoch:before.identityEpochs.accountEpoch,
  expectedConsentEpoch:before.identityEpochs.consentEpoch,
  expectedCustodyEpoch:before.identityEpochs.custodyEpoch,
  payload:{grantScope:'GLOBAL',approvalRef:'fake-approved-user-action'}});
 assert.equal(revoke.status,'COMMITTED');
 assert.equal(f.switchTo('AUTO').reason,'NO_EFFECTIVE_GRANT');
 assert.equal(f.s.qualify(K('fake-B')).reason,'GLOBAL_REVOKED');
});
test('account revocation invalidates mode transitions and readback without resurrecting grant',t=>{
 const f=fixture(t);assert.equal(f.grant().status,'COMMITTED');
 assert.equal(f.switchTo('ASSIST').status,'COMMITTED');
 f.mutation(K(),'GLOBAL','REVOKE_ACCOUNT',{});
 const result=f.switchTo('AUTO');
 assert.equal(result.status,'DENIED');
 assert.equal(result.reason,'ACCOUNT_OR_PEER_REVOKED');
 const state=f.s.readModeState({identity:K(),actor});
 assert.equal(state.nativeAutoEligible,false);
 assert.equal(state.realAutoAuthorized,false);
 assert.equal(f.s.qualify(K()).reason,'W24_IDENTITY_OR_CONSENT_INVALID');
});
test('GLOBAL pending grant stop blocks a concurrent CONTACT AUTO switch; other contacts remain fenced',t=>{
 const f=fixture(t);assert.equal(f.grant().status,'COMMITTED');
 assert.equal(f.switchTo('ASSIST').status,'COMMITTED');
 const msg=iid('global-pending');
 assert.equal(f.s.reserve({identity:K('fake-B'),intentId:msg}).ok,true);
 assert.equal(f.s.enterBoundary({identity:K('fake-B'),intentId:msg}).ok,true);
 assert.equal(f.s.armSend({identity:K('fake-B'),intentId:msg,w25IntentId:iid('w25')}).ok,true);
 const g=f.s.readGrantState({identity:K(),actor,scope:'GLOBAL'});
 const stop=f.s.grantAction({identity:K(),actor,scope:'GLOBAL',action:'PAUSE',
  idempotencyKey:iid('global-pause'),expectedGeneration:g.barrier.generation,
  expectedBindingRevision:g.identityEpochs.bindingRevision,
  expectedAccountEpoch:g.identityEpochs.accountEpoch,
  expectedConsentEpoch:g.identityEpochs.consentEpoch,
  expectedCustodyEpoch:g.identityEpochs.custodyEpoch,
  payload:{grantScope:'GLOBAL',approvalRef:'fake-approved-user-action'}});
 assert.equal(stop.status,'PENDING');
 const auto=f.switchTo('AUTO');
 assert.equal(auto.reason,'GLOBAL_AUTHORITY_MUTATION_PENDING');
 assert.equal(f.s.readModeState({identity:K(),actor}).barriers.globalPending,true);
 assert.equal(f.s.qualify(K('fake-C')).reason,'AUTHORITY_MUTATION_PENDING');
});
test('competing SQLite handles use same CONTACT generation: one commits, old concurrent CAS conflicts',t=>{
 const f=fixture(t),other=f.open();
 assert.equal(f.switchTo('ASSIST').status,'COMMITTED');
 const old=other.readModeState({identity:K(),actor});
 assert.equal(f.switchTo('MANUAL').status,'COMMITTED');
 const stale=other.switchMode({identity:K(),actor,targetMode:'AUTO',
  idempotencyKey:iid('concurrent'),expectedGeneration:old.barriers.generation,
  expectedBindingRevision:old.identityEpochs.bindingRevision,
  expectedAccountEpoch:old.identityEpochs.accountEpoch,
  expectedConsentEpoch:old.identityEpochs.consentEpoch,
  expectedCustodyEpoch:old.identityEpochs.custodyEpoch,
  payload:{targetMode:'AUTO',approvalRef:'fake-approved-user-action'}});
 assert.equal(stale.status,'CONFLICT');
 assert.equal(stale.reason,'STALE_MUTATION_GENERATION');
 assert.equal(other.readModeState({identity:K(),actor}).selectedMode,'MANUAL');
});

test('menu GET is read-only and reports W43 inactive, active then disabled without altering grants',t=>{
 const f=fixture(t);assert.equal(f.grant().status,'COMMITTED');
 const before=f.s.readModeState({identity:K(),actor});
 const off=f.s.readContactManagedMenuState({identity:K(),actor});
 assert.equal(off.agent.active,false);
 assert.equal(off.status,'AGENT_HOLD');
 assert.equal(off.canAuto,false);
 assert.equal(off.contact.effectiveScope,'GLOBAL');
 assert.equal(off.global.grant.enabled,true);
 f.setAgentState({active:true,revision:'fake-agent-revision'});
 const active=f.s.readContactManagedMenuState({identity:K(),actor});
 assert.equal(active.agent.active,true);
 assert.equal(active.status,'REAL_USER_AUTH_HOLD'); // fixture cannot grant real social permission
 assert.equal(active.canAuto,false);
 f.setAgentState({active:false,revision:'fake-agent-revision'});
 assert.equal(f.s.readContactManagedMenuState({identity:K(),actor}).status,'AGENT_HOLD');
 const after=f.s.readModeState({identity:K(),actor});
 assert.deepEqual(after.identityEpochs,before.identityEpochs);
 assert.deepEqual(after.barriers,before.barriers);
});
test('menu reads A do not mutate A or B/C even when A HUMAN and B independently AUTO',t=>{
 const f=fixture(t);assert.equal(f.grant().status,'COMMITTED');
 f.mutation(K(),'CONTACT','HUMAN_TAKEOVER',{action:'USER_EDIT'});
 f.setAgentState({active:true,revision:'fake-agent'});
 const b=f.s.readModeState({identity:K('fake-B'),actor});
 for(let i=0;i<5;i++)f.s.readContactManagedMenuState({identity:K(),actor});
 assert.equal(f.s.readContactManagedMenuState({identity:K(),actor}).mode.selectedMode,'MANUAL');
 assert.equal(f.s.qualify(K()).reason,'HUMAN_CUSTODY');
 assert.equal(f.s.qualify(K('fake-B')).ok,true);
 assert.equal(f.s.qualify(K('fake-C')).ok,true);
 assert.deepEqual(f.s.readModeState({identity:K('fake-B'),actor}).identityEpochs,b.identityEpochs);
});
