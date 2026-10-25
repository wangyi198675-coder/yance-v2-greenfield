import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {canonicalK,openEligibilityStore} from './index.mjs';

const K=(peer='fake-A',account='fixture-1',revision=1)=>({
 tenant:'SYNTHETIC_TEST_ONLY',account,channel:'FB_PERSONAL',peer_id:peer,binding_revision:revision
});
const admin={actor:'fake-operator'};
const issue=(s,k,scope='GLOBAL',budgetUnits=9,expiresAt=999999,expectedEpoch=0)=>
 s.grant({identity:k,scope,budgetUnits,expiresAt,expectedEpoch,...admin});
const reserve=(s,k,id,units=1)=>s.reserve({identity:k,intentId:id,units});
const fence=(s,k,id)=>s.checkForSend({identity:k,intentId:id});

function setup(t){
 const dir=mkdtempSync(join(tmpdir(),'w44-grants-')),path=join(dir,'test.sqlite');
 let time=100000,consent=1,identityEpoch=1,valid=true;
 const ports=()=>({path,now:()=>time,
   verifyIdentity:k=>({valid,binding_revision:k.binding_revision,identity_epoch:identityEpoch,consent_epoch:consent}),
   authorizeMutation:({actor})=>actor==='fake-operator'});
 const s=openEligibilityStore(ports()),additional=[];
 t.after(()=>{for(const other of additional)other.close();s.close();rmSync(dir,{recursive:true,force:true})});
 return {s,path,ports,track:other=>{additional.push(other);return other},tick:n=>time=n,consent:n=>consent=n,identityEpoch:n=>identityEpoch=n,valid:n=>valid=n};
}

test('full K synthetic tenant/account/peer/binding isolation and no real identities',()=>{
 assert.notEqual(canonicalK(K()),canonicalK(K('fake-A','fixture-2')));
 assert.notEqual(canonicalK(K()),canonicalK(K('fake-A','fixture-1',2)));
 assert.throws(()=>canonicalK({...K(),tenant:'REAL'}),/ONLY_SYNTHETIC/);
 assert.throws(()=>canonicalK({...K(),peer_id:'real-user'}),/ONLY_SYNTHETIC/);
});
test('W24 ports are mandatory; request verified bit cannot bypass W24',t=>{
 assert.throws(()=>openEligibilityStore({path:':memory:'}),/W24_PORTS/);
 const x=setup(t),a=K();issue(x.s,a);
 assert.equal(x.s.qualify({...a,verified:true}).ok,true);
 x.valid(false);
 assert.equal(x.s.qualify({...a,verified:true}).reason,'W24_IDENTITY_OR_CONSENT_INVALID');
});
test('A human edit is per-contact; focus cannot change custody; B/C stay AUTO',t=>{
 const {s}=setup(t),[a,b,c]=[K(),K('fake-B'),K('fake-C')];issue(s,a);
 assert.throws(()=>s.setCustody({identity:a,mode:'HUMAN',action:'FOCUS',...admin}),/FOCUS_CANNOT/);
 assert.equal(s.inspection(a).mode,'AUTO');
 s.setCustody({identity:a,mode:'HUMAN',action:'USER_EDIT',...admin});
 assert.equal(s.qualify(a).reason,'HUMAN_CUSTODY');
 assert.equal(reserve(s,b,'fake-b').ok,true);
 assert.equal(reserve(s,c,'fake-c').ok,true);
 assert.equal(s.inspection(b).mode,'AUTO');
 assert.equal(s.inspection(c).mode,'AUTO');
 s.setCustody({identity:a,mode:'AUTO',action:'EXPLICIT_RESUME',expectedEpoch:1,...admin});
 assert.equal(s.qualify(a).ok,true);
});
test('per-contact grants, explicit contact deny and global kill switch',t=>{
 const {s}=setup(t),a=K(),b=K('fake-B');
 const c=issue(s,a,'CONTACT');
 assert.equal(s.qualify(a).ok,true);
 assert.equal(s.qualify(b).reason,'NO_EFFECTIVE_GRANT');
 const g=issue(s,a);
 s.revoke({identity:a,scope:'CONTACT',expectedEpoch:c.epoch,...admin});
 assert.equal(s.qualify(a).reason,'CONTACT_REVOKED');
 assert.equal(s.qualify(b).ok,true);
 s.revoke({identity:a,scope:'GLOBAL',expectedEpoch:g.epoch,...admin});
 assert.equal(s.qualify(b).reason,'GLOBAL_REVOKED');
});
test('budget reservation, expiry and fail-closed pre-send checks',t=>{
 const x=setup(t),a=K();issue(x.s,a,'GLOBAL',1,100100);
 assert.equal(reserve(x.s,a,'fake-1').ok,true);
 assert.equal(x.s.qualify(a).reason,'BUDGET_EXHAUSTED');
 x.tick(100100);
 assert.equal(fence(x.s,a,'fake-1').reason,'RESERVATION_EXPIRED');
 assert.equal(x.s.qualify(a).reason,'GLOBAL_EXPIRED');
});
test('durable reopen, intent idempotency, budget reconcile and release',t=>{
 const x=setup(t),a=K();issue(x.s,a,'GLOBAL',4);
 assert.equal(reserve(x.s,a,'fake-original',3).ok,true);
 assert.equal(reserve(x.s,a,'fake-original',3).reason,'IDEMPOTENT_RESERVED');
 assert.equal(reserve(x.s,a,'fake-original',2).reason,'IDEMPOTENCY_CONFLICT');
 const s2=openEligibilityStore(x.ports());
 assert.equal(s2.inspection(a).effectiveGrant.reserved,3);
 assert.equal(fence(s2,a,'fake-original').ok,true);
 assert.equal(s2.finish({identity:a,intentId:'fake-original',action:'COMMIT',actualUnits:2}).state,'COMMITTED');
 assert.equal(reserve(s2,a,'fake-next',2).ok,true);
 assert.equal(s2.finish({identity:a,intentId:'fake-next',action:'RELEASE'}).state,'RELEASED');
 assert.equal(s2.inspection(a).effectiveGrant.spent,2);
 assert.equal(s2.inspection(a).effectiveGrant.reserved,0);
 assert.equal(reserve(s2,a,'fake-new',2).ok,true);
 assert.equal(reserve(s2,a,'fake-over').reason,'BUDGET_EXHAUSTED');
 s2.close();
});
test('revoke, re-grant CAS and human takeover invalidate old reservation epochs',t=>{
 const {s}=setup(t),a=K();
 let g=issue(s,a);
 reserve(s,a,'fake-one');
 const revoked=s.revoke({identity:a,scope:'GLOBAL',expectedEpoch:g.epoch,...admin});
 assert.equal(fence(s,a,'fake-one').reason,'GRANT_CHANGED');
 assert.equal(s.finish({identity:a,intentId:'fake-one',action:'COMMIT',actualUnits:1}).ok,false);
 assert.throws(()=>issue(s,a),/STALE_GRANT_EPOCH/);
 g=issue(s,a,'GLOBAL',9,999999,revoked.epoch);
 assert.equal(reserve(s,a,'fake-two').ok,true);
 s.setCustody({identity:a,mode:'HUMAN',action:'USER_EDIT',...admin});
 assert.equal(fence(s,a,'fake-two').reason,'CUSTODY_CHANGED');
 assert.equal(s.finish({identity:a,intentId:'fake-two',action:'RELEASE'}).ok,true);
 assert.equal(s.qualify(a).reason,'HUMAN_CUSTODY');
});
test('W24 identity/consent version change denies; unauthorized issuer is rejected',t=>{
 const x=setup(t),a=K();
 assert.throws(()=>x.s.grant({identity:a,scope:'GLOBAL',actor:'fake-stranger',expiresAt:999999,budgetUnits:2}),/NOT_AUTHORIZED/);
 issue(x.s,a);reserve(x.s,a,'fake-one');
 x.consent(2);assert.equal(fence(x.s,a,'fake-one').reason,'W24_EPOCH_STALE');
 x.consent(1);x.identityEpoch(2);
 assert.equal(fence(x.s,a,'fake-one').reason,'W24_EPOCH_STALE');
});
test('two SQLite connections cannot over-reserve same global budget or intent',t=>{
 const x=setup(t),a=K(),b=K('fake-B');issue(x.s,a,'GLOBAL',1);
 const s2=openEligibilityStore(x.ports());
 assert.equal(reserve(x.s,a,'fake-one').ok,true);
 assert.equal(reserve(s2,b,'fake-two').reason,'BUDGET_EXHAUSTED');
 assert.equal(reserve(s2,a,'fake-one').reason,'IDEMPOTENT_RESERVED');
 s2.close();
});
test('six concurrent processes contend for two units, exactly two reserves win',async t=>{
 const x=setup(t),a=K();issue(x.s,a,'GLOBAL',2);
 const script=[
  'import {openEligibilityStore} from '+JSON.stringify(new URL('./index.mjs',import.meta.url).href)+';',
  'const k=JSON.parse(process.argv[2]);',
  'const s=openEligibilityStore({path:process.argv[1],now:()=>100000,verifyIdentity:x=>({valid:true,binding_revision:x.binding_revision,identity_epoch:1,consent_epoch:1}),authorizeMutation:()=>false});',
  'try {console.log(JSON.stringify(s.reserve({identity:k,intentId:"fake-child-"+process.argv[3],units:1})))} finally {s.close()}'
 ].join('\n');
 const job=i=>new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,['--input-type=module','-e',script,x.path,JSON.stringify(a),String(i)],{windowsHide:true});
  let stdout='',stderr='';
  p.stdout.on('data',s=>stdout+=s);p.stderr.on('data',s=>stderr+=s);
  p.on('error',reject);
  p.on('close',n=>n===0?resolve(JSON.parse(stdout.trim())):reject(Error(stderr+' code '+n)));
 });
 const results=await Promise.all([0,1,2,3,4,5].map(job));
 assert.equal(results.filter(r=>r.ok).length,2);
 assert.equal(results.filter(r=>r.reason==='BUDGET_EXHAUSTED').length,4);
 assert.equal(x.s.inspection(a).effectiveGrant.reserved,2);
});

test('revoke ungranted contact creates permanent DENY tombstone over GLOBAL',t=>{
 const {s}=setup(t),a=K(),b=K('fake-B');issue(s,a);
 assert.equal(s.qualify(b).ok,true);
 const tomb=s.revoke({identity:b,scope:'CONTACT',expectedEpoch:0,...admin});
 assert.equal(tomb.enabled,false);
 assert.equal(s.qualify(b).reason,'CONTACT_REVOKED');
 assert.equal(s.qualify(a).ok,true);
 assert.throws(()=>s.revoke({identity:b,scope:'CONTACT',expectedEpoch:0,...admin}),/STALE_GRANT_EPOCH/);
});
test('global revoke tombstone blocks existing contact grants',t=>{
 const {s}=setup(t),a=K();issue(s,a,'CONTACT');
 assert.equal(s.qualify(a).ok,true);
 s.revoke({identity:a,scope:'GLOBAL',expectedEpoch:0,...admin});
 assert.equal(s.qualify(a).reason,'GLOBAL_REVOKED');
});
test('same request ID across accounts is isolated, no cross-account spend',t=>{
 const {s}=setup(t),a=K(),b=K('fake-A','fixture-2');issue(s,a,'GLOBAL',1);issue(s,b,'GLOBAL',1);
 assert.equal(reserve(s,a,'fake-same').ok,true);
 assert.equal(reserve(s,b,'fake-same').ok,true);
 assert.equal(s.inspection(a).effectiveGrant.reserved,1);
 assert.equal(s.inspection(b).effectiveGrant.reserved,1);
});

test('grant epoch refresh preserves consumed budget and pending reservations',t=>{
 const {s}=setup(t),a=K();
 const g1=issue(s,a,'GLOBAL',2);
 assert.equal(reserve(s,a,'fake-sent',1).ok,true);
 assert.equal(s.finish({identity:a,intentId:'fake-sent',action:'COMMIT',actualUnits:1}).ok,true);
 assert.equal(reserve(s,a,'fake-pending',1).ok,true);
 const g2=issue(s,a,'GLOBAL',2,999999,g1.epoch);
 assert.equal(g2.epoch,2);
 const v=s.inspection(a).effectiveGrant;
 assert.equal(v.spent,1);
 assert.equal(v.reserved,1);
 assert.equal(s.qualify(a).reason,'BUDGET_EXHAUSTED');
 assert.equal(fence(s,a,'fake-pending').reason,'GRANT_CHANGED');
 assert.equal(s.finish({identity:a,intentId:'fake-pending',action:'RELEASE'}).ok,true);
 assert.equal(s.inspection(a).effectiveGrant.reserved,0);
 assert.equal(s.inspection(a).effectiveGrant.spent,1);
 assert.equal(s.qualify(a).availableUnits,1);
});
test('revoke then re-grant retains unsettled reservations, permits only safe release',t=>{
 const {s}=setup(t),a=K();
 const g1=issue(s,a,'GLOBAL',1);
 assert.equal(reserve(s,a,'fake-risk',1).ok,true);
 const revoked=s.revoke({identity:a,scope:'GLOBAL',expectedEpoch:g1.epoch,...admin});
 assert.equal(s.qualify(a).reason,'GLOBAL_REVOKED');
 const g3=issue(s,a,'GLOBAL',1,999999,revoked.epoch);
 assert.equal(g3.epoch,3);
 assert.equal(s.qualify(a).reason,'BUDGET_EXHAUSTED');
 assert.equal(s.finish({identity:a,intentId:'fake-risk',action:'COMMIT',actualUnits:1}).reason,'GRANT_CHANGED');
 assert.equal(s.finish({identity:a,intentId:'fake-risk',action:'RELEASE'}).ok,true);
 assert.equal(s.inspection(a).effectiveGrant.reserved,0);
 assert.equal(reserve(s,a,'fake-after-explicit-release').ok,true);
});
test('budget version conservation across reopen and competing SQLite connection',t=>{
 const x=setup(t),a=K();
 const v1=issue(x.s,a,'GLOBAL',1);
 assert.equal(reserve(x.s,a,'fake-first').ok,true);
 const s2=openEligibilityStore(x.ports());
 const v2=issue(s2,a,'GLOBAL',1,999999,v1.epoch);
 assert.equal(v2.epoch,2);
 assert.equal(reserve(s2,a,'fake-second').reason,'BUDGET_EXHAUSTED');
 assert.equal(x.s.inspection(a).effectiveGrant.reserved,1);
 assert.equal(x.s.finish({identity:a,intentId:'fake-first',action:'RELEASE'}).ok,true);
 assert.equal(reserve(s2,a,'fake-second').ok,true);
 s2.close();
});

test('pre-network boundary marker is durable and duplicate checks reuse one reservation',t=>{
 const x=setup(t),a=K();issue(x.s,a,'GLOBAL',2);
 assert.equal(reserve(x.s,a,'fake-boundary').ok,true);
 assert.equal(x.s.enterBoundary({identity:a,intentId:'fake-boundary'}).state,'BOUNDARY_ENTERED');
 assert.equal(x.s.enterBoundary({identity:a,intentId:'fake-boundary'}).idempotent,true);
 assert.equal(fence(x.s,a,'fake-boundary').reason,'NO_ACTIVE_RESERVATION');
 assert.equal(x.s.finish({identity:a,intentId:'fake-boundary',action:'RELEASE'}).reason,'BOUNDARY_UNCERTAIN_HOLD');
 assert.equal(x.s.inspection(a).effectiveGrant.reserved,1);
 assert.equal(x.s.finish({identity:a,intentId:'fake-boundary',action:'COMMIT',actualUnits:1}).reason,'W25_SETTLEMENT_PROOF_REQUIRED');
 const ledger=openEligibilityStore({...x.ports(),verifySettlement:({evidence})=>
   evidence==='fake-verified-w25'?{verified:true,outcome:'CHARGED',actualUnits:1}:{verified:false}});
 assert.equal(ledger.settleBoundary({identity:a,intentId:'fake-boundary',evidence:'fake-verified-w25'}).state,'COMMITTED');
 ledger.close();
 assert.equal(x.s.inspection(a).effectiveGrant.spent,1);
 assert.equal(x.s.inspection(a).effectiveGrant.reserved,0);
});
test('late charge after revoke cannot refund, verified W25 evidence settles spent once',t=>{
 const x=setup(t),a=K();const g=issue(x.s,a,'GLOBAL',1);
 reserve(x.s,a,'fake-unknown');
 x.s.enterBoundary({identity:a,intentId:'fake-unknown'});
 const rev=x.s.revoke({identity:a,scope:'GLOBAL',expectedEpoch:g.epoch,...admin});
 issue(x.s,a,'GLOBAL',1,999999,rev.epoch);
 assert.equal(x.s.qualify(a).reason,'BUDGET_EXHAUSTED');
 assert.equal(x.s.finish({identity:a,intentId:'fake-unknown',action:'RELEASE'}).reason,'BOUNDARY_UNCERTAIN_HOLD');
 assert.equal(x.s.finish({identity:a,intentId:'fake-unknown',action:'COMMIT',actualUnits:1}).reason,'W25_SETTLEMENT_PROOF_REQUIRED');
 const noPort=x.s.settleBoundary({identity:a,intentId:'fake-unknown',evidence:'fake-verified-charge'});
 assert.equal(noPort.reason,'W25_SETTLEMENT_AUTHORITY_UNAVAILABLE');
 const recorder=openEligibilityStore({...x.ports(),verifySettlement:({evidence})=>
   evidence==='fake-verified-charge'?{verified:true,outcome:'CHARGED',actualUnits:1}:{verified:false}});
 assert.equal(recorder.settleBoundary({identity:a,intentId:'fake-unknown',evidence:'fake-unsigned'}).reason,'W25_RECEIPT_UNVERIFIED');
 assert.equal(recorder.inspection(a).effectiveGrant.reserved,1);
 const charged=recorder.settleBoundary({identity:a,intentId:'fake-unknown',evidence:'fake-verified-charge'});
 assert.equal(charged.state,'COMMITTED');
 assert.equal(charged.unitsCharged,1);
 assert.equal(recorder.inspection(a).effectiveGrant.spent,1);
 assert.equal(recorder.inspection(a).effectiveGrant.reserved,0);
 assert.equal(recorder.settleBoundary({identity:a,intentId:'fake-unknown',evidence:'fake-verified-charge'}).reason,'NO_UNRESOLVED_BOUNDARY');
 assert.equal(recorder.qualify(a).reason,'BUDGET_EXHAUSTED');
 recorder.close();
});
test('verified W25 NO_SEND releases ambiguous boundary; UNKNOWN never releases',t=>{
 const x=setup(t),a=K();issue(x.s,a,'GLOBAL',1);
 reserve(x.s,a,'fake-rejected');
 x.s.enterBoundary({identity:a,intentId:'fake-rejected'});
 const verifier=openEligibilityStore({...x.ports(),verifySettlement:({evidence})=>
   evidence==='fake-proven-rejected'?{verified:true,outcome:'PROVEN_NO_SEND'}:{verified:false}});
 assert.equal(verifier.settleBoundary({identity:a,intentId:'fake-rejected',evidence:'fake-unknown'}).reason,'W25_RECEIPT_UNVERIFIED');
 assert.equal(verifier.inspection(a).effectiveGrant.reserved,1);
 assert.equal(verifier.settleBoundary({identity:a,intentId:'fake-rejected',evidence:'fake-proven-rejected'}).state,'RELEASED');
 assert.equal(verifier.inspection(a).effectiveGrant.reserved,0);
 assert.equal(reserve(verifier,a,'fake-next').ok,true);
 verifier.close();
});

test('durable final-send lease serializes CONTACT revoke until W25 settlement',t=>{
 const x=setup(t),a=K();
 const w=openEligibilityStore({...x.ports(),verifyDeliveryArm:()=>({verified:true}),
   verifySettlement:()=>({verified:true,outcome:'CHARGED',actualUnits:1})});
 x.track(w);
 issue(w,a,'GLOBAL',3);
 reserve(w,a,'fake-lease');w.enterBoundary({identity:a,intentId:'fake-lease'});
 assert.equal(w.armSend({identity:a,intentId:'fake-lease',w25IntentId:'fake-w25-1'}).ok,true);
 const staged=w.requestMutationFence({identity:a,scope:'CONTACT',...admin});
 assert.equal(staged.pending,true);
 assert.equal(w.finalizeMutationFence({identity:a,scope:'CONTACT',
   kind:'HUMAN_TAKEOVER',generation:staged.generation,...admin,
   applyW24:()=>({committed:true})}).reason,'ACTIVE_SEND_MUST_SETTLE_FIRST');
 assert.equal(w.qualify(a).reason,'AUTHORITY_MUTATION_PENDING');
 assert.equal(w.settleBoundary({identity:a,intentId:'fake-lease',evidence:'fake-verified'}).state,'COMMITTED');
 let commits=0;
 assert.equal(w.finalizeMutationFence({identity:a,scope:'CONTACT',kind:'HUMAN_TAKEOVER',
   generation:staged.generation,...admin,applyW24:()=>{commits++;return {committed:true}}}).ok,true);
 assert.equal(commits,1);
 assert.equal(w.inspection(a).mode,'HUMAN');
 assert.equal(w.qualify(a).reason,'HUMAN_CUSTODY');
});
test('A slow/UNKNOWN never blocks independent B/C, fake crash preserves active lease',t=>{
 const x=setup(t),a=K(),b=K('fake-B'),c=K('fake-C');
 const w=openEligibilityStore({...x.ports(),verifyDeliveryArm:()=>({verified:true}),
   verifySettlement:()=>({verified:false})});
 x.track(w);
 issue(w,a,'GLOBAL',3);
 reserve(w,a,'fake-A-unknown');w.enterBoundary({identity:a,intentId:'fake-A-unknown'});
 w.armSend({identity:a,intentId:'fake-A-unknown',w25IntentId:'fake-attempt-A'});
 assert.equal(w.leaseStatus(a).active,true);
 const other=openEligibilityStore({...x.ports(),verifyDeliveryArm:()=>({verified:true})});
 assert.equal(reserve(other,b,'fake-B-send').ok,true);
 assert.equal(reserve(other,c,'fake-C-send').ok,true);
 assert.equal(other.armSend({identity:a,intentId:'fake-A-unknown',w25IntentId:'fake-other'}).reason,'RECIPIENT_SEND_GATE_BUSY');
 assert.equal(w.settleBoundary({identity:a,intentId:'fake-A-unknown',evidence:'fake-unknown'}).reason,'W25_RECEIPT_UNVERIFIED');
 assert.equal(other.leaseStatus(a).active,true);
 assert.equal(other.inspection(b).mode,'AUTO');
 other.close();
});
test('account rebind request before arm denies, afterwards must await existing leases',t=>{
 const x=setup(t),a=K(),b=K('fake-B');
 const w=openEligibilityStore({...x.ports(),verifyDeliveryArm:()=>({verified:true}),
   verifySettlement:()=>({verified:true,outcome:'PROVEN_NO_SEND'})});
 x.track(w);
 issue(w,a,'GLOBAL',3);
 reserve(w,a,'fake-original');w.enterBoundary({identity:a,intentId:'fake-original'});
 const gate=w.requestMutationFence({identity:a,scope:'GLOBAL',...admin});
 assert.equal(w.armSend({identity:a,intentId:'fake-original',w25IntentId:'fake-w25'}).reason,'AUTHORITY_MUTATION_PENDING');
 assert.equal(reserve(w,b,'fake-new').reason,'AUTHORITY_MUTATION_PENDING');
 let epoch=0;
 assert.equal(w.finalizeMutationFence({identity:a,scope:'GLOBAL',kind:'REVOKE_ACCOUNT',
   generation:gate.generation,...admin,applyW24:()=>{epoch++;return {committed:true}}}).ok,true);
 assert.equal(epoch,1);
 assert.equal(w.qualify(b).reason,'GLOBAL_REVOKED');
});
test('crash/restart carries pending GLOBAL barrier and fail-closes new sends',t=>{
 const x=setup(t),a=K(),b=K('fake-B');
 const w=openEligibilityStore({...x.ports(),verifyDeliveryArm:()=>({verified:true})});
 issue(w,a,'GLOBAL',2);reserve(w,a,'fake-pending');
 const gate=w.requestMutationFence({identity:a,scope:'GLOBAL',...admin});
 w.close();
 const restarted=openEligibilityStore({...x.ports(),verifyDeliveryArm:()=>({verified:true})});
 x.track(restarted);
 assert.equal(restarted.qualify(b).reason,'AUTHORITY_MUTATION_PENDING');
 assert.equal(restarted.requestMutationFence({identity:a,scope:'GLOBAL',expectedGeneration:gate.generation,...admin}).reason,'MUTATION_ALREADY_PENDING');
 assert.equal(restarted.finalizeMutationFence({identity:a,scope:'GLOBAL',kind:'REVOKE_GRANT',
   generation:gate.generation,...admin,applyW24:()=>({committed:true})}).ok,true);
 assert.equal(restarted.qualify(b).reason,'GLOBAL_REVOKED');
});
test('armSend denies missing W25 verified durable outbox attempt',t=>{
 const x=setup(t),a=K();
 const w=openEligibilityStore(x.ports());x.track(w);issue(w,a);
 reserve(w,a,'fake-1');w.enterBoundary({identity:a,intentId:'fake-1'});
 assert.equal(w.armSend({identity:a,intentId:'fake-1',w25IntentId:'fake-w25'}).reason,'W25_PERSISTED_ATTEMPT_PROOF_MISSING');
 assert.equal(w.leaseStatus(a).active,false);
});

test('actual child-process crash retains committed ARMED lease and blocks revocation',async t=>{
 const x=setup(t),a=K(),b=K('fake-B');issue(x.s,a,'GLOBAL',3);
 reserve(x.s,a,'fake-crashed');x.s.enterBoundary({identity:a,intentId:'fake-crashed'});
 const script=[
  'import {openEligibilityStore} from '+JSON.stringify(new URL('./index.mjs',import.meta.url).href)+';',
  'const identity=JSON.parse(process.argv[2]);',
  'const s=openEligibilityStore({path:process.argv[1],now:()=>100000,',
  'verifyIdentity:k=>({valid:true,binding_revision:k.binding_revision,identity_epoch:1,consent_epoch:1}),',
  'authorizeMutation:()=>false,verifyDeliveryArm:()=>({verified:true})});',
  'const p=s.armSend({identity,intentId:"fake-crashed",w25IntentId:"fake-persisted-w25"});',
  'if(!p.ok)process.exit(9);process.exit(42);'
 ].join('\n');
 const code=await new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,['--input-type=module','-e',script,x.path,JSON.stringify(a)],
    {windowsHide:true});
  p.on('error',reject);p.on('close',resolve);
 });
 assert.equal(code,42);
 assert.equal(x.s.leaseStatus(a).active,true);
 const pending=x.s.requestMutationFence({identity:a,scope:'CONTACT',...admin});
 assert.equal(pending.activeLease,true);
 assert.equal(x.s.finalizeMutationFence({identity:a,scope:'CONTACT',...admin,
   kind:'HUMAN_TAKEOVER',generation:pending.generation,
   applyW24:()=>({committed:true})}).reason,'ACTIVE_SEND_MUST_SETTLE_FIRST');
 assert.equal(reserve(x.s,b,'fake-B-while-A-stuck').ok,true);
});
