import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {openEligibilityStore} from './index.mjs';

const actor='fake-owner-1',K=(peer='fake-A',binding=1)=>({
 tenant:'SYNTHETIC_TEST_ONLY',account:'fixture-1',channel:'FB_PERSONAL',
 peer_id:peer,binding_revision:binding});
const obj=(k=K())=>({actor,identity:k});
const ports=path=>({path,requireDurableIdentity:true,
 verifyIdentity:()=>{throw Error('W24_MEMORY_SHOULD_NEVER_BE_TRUSTED');},
 authorizeMutation:({actor:a})=>a===actor,
 verifyDeliveryArm:()=>({verified:true}),
 verifySettlement:({evidence})=>evidence==='fake-proven-no-send'
   ?{verified:true,outcome:'PROVEN_NO_SEND'}:{verified:false},
 verifyOwnerMutation:({actor:a,mutation})=>({
   verified:a===actor&&mutation?.validatedByW24===true}),
 verifyOwnerCancellation:({actor:a,provenNoMutation})=>({
   verified:a===actor&&provenNoMutation?.proofRef==='fake-confirmed-no-mutation'})});
function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'w44-native-authority-')),
 path=join(dir,'ONE-authority-budget.sqlite'),stores=[];
 const create=(overrides={})=>{const s=openEligibilityStore({...ports(path),...overrides});stores.push(s);return s};
 t.after(()=>{for(const s of stores.reverse())try{s.close()}catch{};rmSync(dir,{recursive:true,force:true})});
 return {path,create,s:create()};
}
function request(s,k,kind,payload,scope='CONTACT',id='fake-req-'+Math.random().toString(36).slice(2)){
 const state=s.readIdentityAuthority(obj(k));
 const barrier=s.readMutationFence({...obj(k),scope});
 const args={...obj(k),scope,kind,idempotencyKey:id,
 expectedGeneration:barrier.generation,
 expectedBindingRevision:state.bindingRevision,
 expectedAccountEpoch:state.accountEpoch,
 expectedConsentEpoch:state.consentEpoch,
 expectedCustodyEpoch:state.custodyEpoch,
 payload:{...payload,validatedByW24:true}};
 return {args,r:s.requestNativeMutationFence(args)};
}
function apply(s,k,kind,payload,scope='CONTACT',id){
 const {args,r}=request(s,k,kind,payload,scope,id);
 assert.equal(r.ok,true,JSON.stringify(r));
 const out=s.finalizeNativeMutationFence({requestId:r.requestId,
    generation:r.generation,actor,ownerValidatedMutation:args.payload});
 return {args,r,out};
}
function register(s){
 const a=apply(s,K(),'REGISTER_ACCOUNT',{bindingProofRef:'fake-verified-channel'},'GLOBAL');
 assert.equal(a.out.status,'COMMITTED');
 return a;
}
function bind(s,k=K()){const a=apply(s,k,'BIND_PEER',{peerProofRef:'fake-verified-peer'});assert.equal(a.out.status,'COMMITTED');return a}

test('same W44 SQLite durable Account/Peer/Consent epochs survive restart and repeated generations',t=>{
 const f=fixture(t);const s=f.s;register(s);bind(s);
 let v=s.readIdentityAuthority(obj());
 assert.equal(v.valid,true);assert.equal(v.identityEpoch,1);
 const created=apply(s,K(),'CREATE_CONSENT',{consentId:'fake-consent-A',
  subjectId:'fake-subject-A',purpose:'friend-chat',operation:'SEND_MESSAGE',
  proofRef:'fake-consent-proof',expiresAt:Date.now()+200000,approved:true});
 assert.equal(created.out.status,'COMMITTED');
 const consentEpoch=s.readIdentityAuthority(obj()).consentEpoch;
 assert.ok(consentEpoch>=2);
 const revoked=apply(s,K(),'REVOKE_CONSENT',{consentId:'fake-consent-A',expectedConsentRevision:1});
 assert.equal(revoked.out.status,'COMMITTED');
 assert.ok(s.readIdentityAuthority(obj()).consentEpoch>consentEpoch);
 assert.equal(s.mutationResult({requestId:revoked.r.requestId,actor}).status,'COMMITTED');
 const other=f.create(),r=other.readIdentityAuthority(obj());
 assert.equal(r.valid,true);assert.equal(r.consents[0].status,'REVOKED');
 assert.equal(r.consentEpoch,s.readIdentityAuthority(obj()).consentEpoch);
 assert.equal(other.readMutationFence({...obj(),scope:'CONTACT'}).generation,3);
});
test('durable register, rebind and old peer/tombstone protection never resurrects old K',t=>{
 const {s,create}=fixture(t);register(s);bind(s);
 const off=apply(s,K(),'REVOKE_ACCOUNT',{},'GLOBAL');
 assert.equal(off.out.status,'COMMITTED');
 assert.equal(s.readIdentityAuthority(obj()).valid,false);
 assert.equal(s.readIdentityAuthority(obj()).bindingRevision,2);
 const second=K('fake-A',2);
 const relink=apply(s,second,'RELINK_ACCOUNT',{bindingProofRef:'fake-relinked-provider-proof'},'GLOBAL');
 assert.equal(relink.out.status,'COMMITTED');
 assert.equal(s.readIdentityAuthority(obj(second)).valid,false);
 assert.equal(s.readIdentityAuthority(obj()).valid,false);
 const third=K('fake-A',3);
 const oldEpoch=s.readIdentityAuthority(obj(third)).consentEpoch;
 bind(s,third);
 assert.equal(s.readIdentityAuthority(obj(third)).valid,true);
 assert.ok(s.readIdentityAuthority(obj(third)).consentEpoch>oldEpoch);
 const reopened=create();
 assert.equal(reopened.readIdentityAuthority(obj(third)).valid,true);
 assert.equal(reopened.readIdentityAuthority(obj()).valid,false);
});
test('mutation request idempotency, 409 epochs and durable repeated CAS across two workers',t=>{
 const f=fixture(t);register(f.s);bind(f.s);
 const a=f.s,b=f.create();
 const first=request(a,K(),'CREATE_CONSENT',{consentId:'fake-C-1',
  subjectId:'fake-S',purpose:'chat',operation:'SEND_MESSAGE',
  proofRef:'fake-proof',expiresAt:Date.now()+300000,approved:true},'CONTACT','fake-request-409');
 assert.equal(first.r.status,'PENDING');
 assert.equal(b.requestNativeMutationFence(first.args).requestId,first.r.requestId);
 const conflicting={...first.args,idempotencyKey:'fake-request-other'};
 assert.equal(b.requestNativeMutationFence(conflicting).reason,'MUTATION_ALREADY_PENDING');
 const bad={...first.args,payload:{...first.args.payload,consentId:'fake-C-OTHER'}};
 assert.equal(b.requestNativeMutationFence(bad).reason,'IDEMPOTENCY_CONFLICT');
 assert.equal(b.finalizeNativeMutationFence({requestId:first.r.requestId,generation:first.r.generation,
   actor,ownerValidatedMutation:first.args.payload}).status,'COMMITTED');
 assert.equal(a.mutationResult({requestId:first.r.requestId,actor}).status,'COMMITTED');
 assert.equal(a.finalizeNativeMutationFence({requestId:first.r.requestId,generation:first.r.generation,
   actor,ownerValidatedMutation:first.args.payload}).replayed,true);
 assert.equal(b.requestNativeMutationFence(conflicting).reason,'STALE_MUTATION_GENERATION');
 const second=apply(b,K(),'REVOKE_CONSENT',{consentId:'fake-C-1',expectedConsentRevision:1});
 assert.equal(second.out.status,'COMMITTED');
 assert.equal(second.r.generation,first.r.generation+1);
});
test('PENDING HUMAN A blocks only A, account GLOBAL revocation blocks A/B/C',t=>{
 const {s}=fixture(t);register(s);bind(s,K('fake-A'));bind(s,K('fake-B'));bind(s,K('fake-C'));
 s.grant({identity:K(),scope:'GLOBAL',actor,budgetUnits:4,expiresAt:Date.now()+100000});
 const waiting=request(s,K(),'HUMAN_TAKEOVER',{action:'USER_EDIT'});
 assert.equal(waiting.r.status,'PENDING');
 assert.equal(s.qualify(K()).reason,'AUTHORITY_MUTATION_PENDING');
 assert.equal(s.qualify(K('fake-B')).ok,true);
 assert.equal(s.qualify(K('fake-C')).ok,true);
 assert.equal(s.finalizeNativeMutationFence({requestId:waiting.r.requestId,
   generation:waiting.r.generation,actor,ownerValidatedMutation:waiting.args.payload}).status,'COMMITTED');
 assert.equal(s.inspection(K()).mode,'HUMAN');
 assert.equal(s.qualify(K('fake-B')).ok,true);
 const global=request(s,K(),'REVOKE_ACCOUNT',{},'GLOBAL');
 assert.equal(global.r.status,'PENDING');
 assert.equal(s.qualify(K('fake-B')).reason,'AUTHORITY_MUTATION_PENDING');
 assert.equal(s.qualify(K('fake-C')).reason,'AUTHORITY_MUTATION_PENDING');
 assert.equal(s.finalizeNativeMutationFence({requestId:global.r.requestId,
   generation:global.r.generation,actor,ownerValidatedMutation:global.args.payload}).status,'COMMITTED');
 assert.equal(s.readIdentityAuthority(obj(K('fake-B'))).valid,false);
});
test('W25 ARMED then revocation stays durable PENDING through UNKNOWN and cold reopen',t=>{
 const f=fixture(t),s=f.s;register(s);bind(s);
 s.grant({identity:K(),scope:'GLOBAL',actor,budgetUnits:1,expiresAt:Date.now()+100000});
 assert.equal(s.reserve({identity:K(),intentId:'fake-unknown'}).ok,true);
 assert.equal(s.enterBoundary({identity:K(),intentId:'fake-unknown'}).ok,true);
 assert.equal(s.armSend({identity:K(),intentId:'fake-unknown',w25IntentId:'fake-w25-attempt'}).ok,true);
 const pending=request(s,K(),'REVOKE_ACCOUNT',{},'GLOBAL','fake-revoke-after-arm');
 assert.equal(pending.r.status,'PENDING');
 assert.equal(s.finalizeNativeMutationFence({requestId:pending.r.requestId,
   generation:pending.r.generation,actor,ownerValidatedMutation:pending.args.payload}).reason,'ACTIVE_SEND_MUST_SETTLE_FIRST');
 const cold=f.create();
 assert.equal(cold.mutationResult({requestId:pending.r.requestId,actor}).status,'PENDING');
 assert.equal(cold.readIdentityAuthority(obj()).valid,true);
 assert.equal(cold.leaseStatus(K()).active,true);
 assert.equal(cold.settleBoundary({identity:K(),intentId:'fake-unknown',evidence:'fake-UNKNOWN'}).reason,'W25_RECEIPT_UNVERIFIED');
 assert.equal(cold.leaseStatus(K()).active,true);
 assert.equal(cold.settleBoundary({identity:K(),intentId:'fake-unknown',evidence:'fake-proven-no-send'}).state,'RELEASED');
 assert.equal(cold.finalizeNativeMutationFence({requestId:pending.r.requestId,
    generation:pending.r.generation,actor,ownerValidatedMutation:pending.args.payload}).status,'COMMITTED');
 assert.equal(cold.readIdentityAuthority(obj()).valid,false);
});
test('process exits after persistent request: new process reads PENDING and CAS finalizes once',async t=>{
 const f=fixture(t);register(f.s);bind(f.s);
 const script=[
  'import {openEligibilityStore} from '+JSON.stringify(new URL('./index.mjs',import.meta.url).href)+';',
  'const actor="fake-owner-1",k='+JSON.stringify(K())+';',
  'const s=openEligibilityStore({path:process.argv[1],requireDurableIdentity:true,',
  'verifyIdentity:()=>null,authorizeMutation:()=>true});',
  'const a=s.readIdentityAuthority({actor,identity:k});',
  'const b=s.readMutationFence({actor,identity:k,scope:"CONTACT"});',
  'const r=s.requestNativeMutationFence({identity:k,actor,scope:"CONTACT",',
  'kind:"HUMAN_TAKEOVER",idempotencyKey:"fake-crash-pending",',
  'expectedGeneration:b.generation,expectedBindingRevision:a.bindingRevision,',
  'expectedAccountEpoch:a.accountEpoch,expectedConsentEpoch:a.consentEpoch,',
  'expectedCustodyEpoch:a.custodyEpoch,payload:{action:"USER_EDIT",validatedByW24:true}});',
  'process.exit(r.ok?48:49);'
 ].join('\n');
 const exitCode=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,
   ['--input-type=module','-e',script,f.path],{windowsHide:true});
   child.on('error',reject);child.on('exit',resolve)});
 assert.equal(exitCode,48);
 const opened=f.create(),pending=opened.mutationResult({requestId:'fake-crash-pending',actor});
 assert.equal(pending.status,'PENDING');
 assert.equal(opened.readMutationFence({...obj(),scope:'CONTACT'}).pending,true);
 assert.equal(opened.finalizeNativeMutationFence({requestId:pending.requestId,generation:pending.generation,
  actor,ownerValidatedMutation:{action:'USER_EDIT',validatedByW24:true}}).status,'COMMITTED');
 assert.equal(opened.readIdentityAuthority(obj()).mode,'HUMAN');
});
test('no live mutation without W24 typed validation and no legacy in-memory authority',t=>{
 const f=fixture(t);const s=f.s;
 assert.equal(s.qualify(K()).reason,'W24_IDENTITY_OR_CONSENT_INVALID');
 const pending=request(s,K(),'REGISTER_ACCOUNT',{bindingProofRef:'fake-proof'},'GLOBAL');
 assert.equal(pending.r.status,'PENDING');
 assert.equal(s.finalizeNativeMutationFence({requestId:pending.r.requestId,generation:pending.r.generation,
   actor,ownerValidatedMutation:{...pending.args.payload,invalid:true}}).reason,'W24_TYPED_PAYLOAD_MISMATCH');
 const noValidator=f.create({verifyOwnerMutation:undefined});
 assert.equal(noValidator.finalizeNativeMutationFence({requestId:pending.r.requestId,
   generation:pending.r.generation,actor,ownerValidatedMutation:pending.args.payload}).reason,
   'W24_MUTATION_VALIDATOR_REQUIRED');
 assert.equal(s.mutationResult({requestId:pending.r.requestId,actor}).status,'PENDING');
});

test('GLOBAL revoke and explicit relink cannot resurrect prior AUTO grant',t=>{
 const {s}=fixture(t);register(s);bind(s);
 s.grant({identity:K(),scope:'GLOBAL',actor,budgetUnits:4,expiresAt:Date.now()+100000});
 assert.equal(s.qualify(K()).ok,true);
 apply(s,K(),'REVOKE_ACCOUNT',{},'GLOBAL');
 const k2=K('fake-A',2);
 apply(s,k2,'RELINK_ACCOUNT',{bindingProofRef:'fake-relay-proof'},'GLOBAL');
 bind(s,K('fake-A',3));
 const next=K('fake-A',3);
 assert.equal(s.qualify(next).reason,'GLOBAL_REVOKED');
 assert.equal(s.readIdentityAuthority(obj(next)).valid,true);
});
test('strict durable mode prohibits old mutable W24 callback or nontransactional takeover',t=>{
 const {s}=fixture(t);register(s);bind(s);
 assert.throws(()=>s.setCustody({identity:K(),actor,mode:'HUMAN',action:'USER_EDIT'}),
   /NATIVE_TRANSACTIONAL_TAKEOVER_REQUIRED/);
 assert.throws(()=>s.requestMutationFence({identity:K(),scope:'CONTACT',actor}),
   /MUTATION_KIND_SCOPE_MISMATCH/);
 assert.throws(()=>s.finalizeMutationFence({identity:K(),scope:'CONTACT',actor,
   kind:'REVOKE_ACCOUNT',generation:1,applyW24:()=>({committed:true})}),
   /W24_TYPED_MUTATION_REQUIRED/);
 assert.equal(s.readIdentityAuthority(obj()).mode,'AUTO');
});
test('two independent OS workers CAS same native mutation: only one PENDING',async t=>{
 const f=fixture(t);register(f.s);bind(f.s);
 const script=[
 'import {openEligibilityStore} from '+JSON.stringify(new URL('./index.mjs',import.meta.url).href)+';',
 'const k='+JSON.stringify(K())+',actor="fake-owner-1";',
 'const s=openEligibilityStore({path:process.argv[1],requireDurableIdentity:true,',
 'verifyIdentity:()=>null,authorizeMutation:()=>true});',
 'const a=s.readIdentityAuthority({actor,identity:k});',
 'const b=s.readMutationFence({actor,identity:k,scope:"CONTACT"});',
 'const r=s.requestNativeMutationFence({identity:k,scope:"CONTACT",actor,',
 'kind:"HUMAN_TAKEOVER",idempotencyKey:"fake-multi-worker-"+process.argv[2],',
 'expectedGeneration:b.generation,expectedBindingRevision:a.bindingRevision,',
 'expectedAccountEpoch:a.accountEpoch,expectedConsentEpoch:a.consentEpoch,',
 'expectedCustodyEpoch:a.custodyEpoch,payload:{action:"USER_EDIT",validatedByW24:true}});',
 'process.stdout.write(JSON.stringify(r));s.close();'
 ].join('\n');
 const run=n=>new Promise((resolve,reject)=>{
   const p=spawn(process.execPath,['--input-type=module','-e',script,f.path,n],{windowsHide:true});
   let out='',err='';p.stdout.on('data',s=>out+=s);p.stderr.on('data',s=>err+=s);
   p.on('error',reject);p.on('exit',code=>{
     if(code!==0)return reject(new Error('worker failed '+code+' '+err));
     try{resolve(JSON.parse(out))}catch(e){reject(e)}
   });
 });
 const results=await Promise.all([run('1'),run('2')]);
 assert.equal(results.filter(r=>r.ok).length,1);
 assert.equal(results.filter(r=>r.reason==='MUTATION_ALREADY_PENDING').length,1);
 assert.equal(f.s.readMutationFence({...obj(),scope:'CONTACT'}).pending,true);
});

test('cancel fence requires W24 proven no mutation, preserves monotonic generation',t=>{
 const {s}=fixture(t);register(s);bind(s);
 const pending=request(s,K(),'HUMAN_TAKEOVER',{action:'USER_EDIT'},'CONTACT','fake-cancel-request');
 assert.equal(pending.r.status,'PENDING');
 const fake=s.cancelMutationFence({requestId:pending.r.requestId,
   expectedGeneration:pending.r.generation,actor,provenNoMutation:{proofRef:'fake-user-claim'}});
 assert.equal(fake.reason,'CANCEL_UNPROVEN');
 assert.equal(s.mutationResult({requestId:pending.r.requestId,actor}).status,'PENDING');
 const canceled=s.cancelMutationFence({requestId:pending.r.requestId,
   expectedGeneration:pending.r.generation,actor,
   provenNoMutation:{proofRef:'fake-confirmed-no-mutation'}});
 assert.equal(canceled.status,'REJECTED');
 assert.equal(s.mutationResult({requestId:pending.r.requestId,actor}).status,'REJECTED');
 assert.equal(s.readMutationFence({...obj(),scope:'CONTACT'}).pending,false);
 const next=apply(s,K(),'HUMAN_TAKEOVER',{action:'USER_EDIT'});
 assert.equal(next.r.generation,pending.r.generation+1);
 assert.equal(next.out.status,'COMMITTED');
});
test('invalid typed mutation never partially writes Peer or falsely reports success',t=>{
 const {s}=fixture(t);register(s);
 const staged=request(s,K(),'BIND_PEER',{peerProofRef:'unverified-supplied-value'});
 assert.equal(staged.r.status,'PENDING');
 const failed=s.finalizeNativeMutationFence({requestId:staged.r.requestId,
   generation:staged.r.generation,actor,ownerValidatedMutation:staged.args.payload});
 assert.equal(failed.reason,'W24_PEER_PROOF_REQUIRED');
 assert.equal(s.readIdentityAuthority(obj()).valid,false);
 assert.equal(s.mutationResult({requestId:staged.r.requestId,actor}).status,'PENDING');
 assert.equal(s.readMutationFence({...obj(),scope:'CONTACT'}).pending,true);
});
