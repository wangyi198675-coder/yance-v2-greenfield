/**
 * W24 P0 RED / gap witness. Tests pass when the EXISTING split-brain risk
 * is reproduced: PASS here is NOT release security PASS.
 * Uses unmodified W44 real SQLite in a separate owner worktree.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {IdentityConsentService} from './identity-consent.mjs';
const w44Root=process.env.YANCE_W44_ROOT;
if(!w44Root)throw Error('EXPLICIT_EXISTING_W44_ROOT_REQUIRED');
const w44Module=resolve(w44Root,'services/api/src/domains/grant-custody-budget/index.mjs');
const {openEligibilityStore}=await import(pathToFileURL(w44Module).href);
const k={tenant:'SYNTHETIC_TEST_ONLY',account:'fixture-w24-audit',channel:'FB_PERSONAL',
  peer_id:'fake-A',binding_revision:1};
const kb={...k,peer_id:'fake-B'},kc={...k,peer_id:'fake-C'};
const ctx={tenant:k.tenant,principal_id:'fake-owner',input_domain:'CONTACT'};
function harness(t){
 const dir=mkdtempSync(join(tmpdir(),'w24-p0-red-sqlite-')),db=join(dir,'existing-w44.sqlite');
 const ids=new IdentityConsentService({proofAuthority:{evaluate:()=>({approved:true})}});
 ids.registerAccount(ctx,{...k,principal_id:ctx.principal_id});
 for(const x of [k,kb,kc])ids.bindPeer(ctx,x);
 const ports={
  path:db,
  verifyIdentity:x=>{
   try {
    const s=ids.assertCurrent(ctx,x);
    return {valid:true,binding_revision:s.binding_revision,
      identity_epoch:s.account_revocation_epoch+1,consent_epoch:ids.readConsentEpoch(ctx,x)};
   }catch {return {valid:false};}
  },
  authorizeMutation:({actor})=>actor===ctx.principal_id
 };
 const s=openEligibilityStore(ports);
 t.after(()=>{s.close();rmSync(dir,{recursive:true,force:true})});
 return {ids,s,ports,db};
}

test('P0 RED: W44 SQLite survives restart but W24 in-memory accounts/peers/consents do NOT',t=>{
 const {ids,s,ports}=harness(t);
 s.grant({identity:k,scope:'GLOBAL',actor:ctx.principal_id,budgetUnits:4,
   expiresAt:Date.now()+300000});
 ids.createConsent(ctx,{k,consent_id:'fake-consent',subject_id:'fake-user',
   purpose:'SYNTHETIC_TEST',operation:'RECORDING',proof_ref:'fake-proof',
   expires_at:Date.now()+300000});
 assert.equal(ids.readConsentEpoch(ctx,k),2);
 const s2=openEligibilityStore(ports);
 try {
  assert.equal(s2.inspection(k).effectiveGrant.budgetLimit,4);
  const restartedIdentity=new IdentityConsentService();
  assert.throws(()=>restartedIdentity.assertCurrent(ctx,k),
    e=>e.code==='ACCOUNT_UNBOUND');
  assert.equal(restartedIdentity.readConsentEpoch?typeof restartedIdentity.readConsentEpoch:'','function');
  console.log('W24_P0_IDENTITY_RESTART_GAP_CONFIRMED: grant SQLite survives, identity/peer/consent RAM lost');
 }finally{s2.close()}
});

test('W44 pre-ARM mutation marker durably blocks A, only A while B/C remain AUTO',t=>{
 const {s,ports}=harness(t);
 s.grant({identity:k,scope:'GLOBAL',actor:ctx.principal_id,
   budgetUnits:5,expiresAt:Date.now()+300000});
 const marker=s.requestMutationFence({identity:k,scope:'CONTACT',actor:ctx.principal_id,expectedGeneration:0});
 assert.equal(marker.ok,true);
 assert.equal(marker.pending,true);
 assert.equal(s.reserve({identity:k,intentId:'fake-A-intent'}).reason,'AUTHORITY_MUTATION_PENDING');
 for(const peer of [kb,kc]){
  assert.equal(s.inspection(peer).mode,'AUTO');
  assert.equal(s.reserve({identity:peer,intentId:'fake-'+peer.peer_id}).ok,true);
 }
 const reopen=openEligibilityStore(ports);
 try{
  assert.equal(reopen.leaseStatus(k).mutationPending,true);
  assert.equal(reopen.reserve({identity:k,intentId:'fake-restarted'}).reason,'AUTHORITY_MUTATION_PENDING');
  assert.equal(reopen.leaseStatus(kb).mutationPending,false);
 } finally{reopen.close()}
 const global=s.requestMutationFence({identity:k,scope:'GLOBAL',actor:ctx.principal_id,expectedGeneration:0});
 assert.equal(global.ok,true);
 for(const peer of [kb,kc])
  assert.equal(s.reserve({identity:peer,intentId:'fake-global-'+peer.peer_id}).reason,'AUTHORITY_MUTATION_PENDING');
 console.log('W44_SQLITE_PRE_ARM_HOLD_CONFIRMED',JSON.stringify({contact:marker.generation,global:global.generation}));
});

test('P0 RED: direct W24 revoke bypasses pending W44 fence; rollback cannot unmutate W24 RAM',t=>{
 const {ids,s,ports}=harness(t);
 const input={k,consent_id:'fake-consent',subject_id:'fake-user',
   purpose:'SYNTHETIC_TEST',operation:'RECORDING',proof_ref:'fake-proof',
   expires_at:Date.now()+300000};
 ids.createConsent(ctx,input);
 const barrier=s.requestMutationFence({identity:k,scope:'CONTACT',actor:ctx.principal_id});
 assert.equal(barrier.ok,true);
 // This is a deliberately UNAUTHORIZED direct legacy mutation. Reproduces P0,
 // not a blessed integration path.
 const direct=ids.revokeConsent(ctx,{consent_id:input.consent_id,
   expected_revision:1,idempotency_key:'fake-unsafe-revoke'});
 assert.equal(direct.status,'REVOKED');
 assert.equal(ids.readConsentEpoch(ctx,k),3);
 assert.equal(s.leaseStatus(k).mutationPending,true);
 const other=openEligibilityStore(ports);
 try{assert.equal(other.leaseStatus(k).mutationPending,true)}finally{other.close()}
 // Even a trusted callback inside W44's transaction is not atomic with
 // an in-memory W24 mutation: force failure after invalidating identity.
 assert.throws(()=>s.finalizeMutationFence({identity:k,scope:'CONTACT',
   actor:ctx.principal_id,generation:barrier.generation,kind:'REVOKE_CONSENT',
   applyW24:()=>{
     ids.invalidateAccount(ctx,{...k,expected_revision:1});
     throw Error('SYNTHETIC_FAULT_AFTER_W24_MUTATION');
   }}),/SYNTHETIC_FAULT_AFTER_W24_MUTATION/);
 assert.equal(s.leaseStatus(k).mutationPending,true);
 assert.throws(()=>ids.assertCurrent(ctx,k),e=>e.code==='ACCOUNT_OR_PEER_UNBOUND');
 console.log('W24_P0_SPLIT_TRANSACTION_GAP_CONFIRMED: W44 rolls back, W24 RAM cannot rollback');
});

test('W44 actual OS Worker CAS: one first fence wins, competing process loses; persisted across open',async t=>{
 const {db}=harness(t);
 const moduleUrl=pathToFileURL(w44Module).href;
 const childSource=[
  'import {openEligibilityStore} from '+JSON.stringify(moduleUrl)+';',
  'const k=JSON.parse(process.argv[2]);',
  'const s=openEligibilityStore({path:process.argv[1],verifyIdentity:x=>({valid:true,binding_revision:x.binding_revision,identity_epoch:1,consent_epoch:1}),authorizeMutation:()=>true});',
  'try{console.log(JSON.stringify(s.requestMutationFence({identity:k,scope:"CONTACT",actor:"fake-owner",expectedGeneration:0})))}finally{s.close()}'
 ].join('\n');
 const job=()=>new Promise((resolve,reject)=>{
  const proc=spawn(process.execPath,['--input-type=module','-e',childSource,db,JSON.stringify(k)],{windowsHide:true});
  let out='',err='';
  proc.stdout.on('data',x=>out+=x);
  proc.stderr.on('data',x=>err+=x);
  proc.on('error',reject);
  proc.on('close',code=>{
   if(code===0){try{resolve(JSON.parse(out.trim()))}catch(e){reject(e)}}
   else reject(Error('WORKER_FAILED:'+err));
  });
 });
 const results=await Promise.all([job(),job()]);
 assert.equal(results.filter(x=>x.ok===true).length,1);
 assert.equal(results.filter(x=>x.reason==='MUTATION_ALREADY_PENDING').length,1);
 const opened=openEligibilityStore({
  path:db,verifyIdentity:x=>({valid:true,binding_revision:x.binding_revision,identity_epoch:1,consent_epoch:1}),
  authorizeMutation:()=>true
 });
 try{
  assert.equal(opened.leaseStatus(k).mutationPending,true);
  assert.equal(opened.reserve({identity:k,intentId:'fake-no-new-send'}).reason,'AUTHORITY_MUTATION_PENDING');
 }finally{opened.close()}
 console.log('W44_TWO_OS_WORKER_CAS_SQLITE_PASS',JSON.stringify(results));
});
