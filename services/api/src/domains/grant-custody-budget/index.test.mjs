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
 const s=openEligibilityStore(ports());
 t.after(()=>{s.close();rmSync(dir,{recursive:true,force:true})});
 return {s,path,ports,tick:n=>time=n,consent:n=>consent=n,identityEpoch:n=>identityEpoch=n,valid:n=>valid=n};
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
