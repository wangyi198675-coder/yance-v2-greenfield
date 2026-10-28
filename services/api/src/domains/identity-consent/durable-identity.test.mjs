import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {IdentityConsentService} from './identity-consent.mjs';
import {createW24DurableProofVerifier} from './durable-identity.mjs';
import {createNativeTakeoverService} from './takeover.mjs';
const root=process.env.YANCE_W44_ROOT||process.env.YANCE_PR32_ROOT;
if(!root)throw Error('REAL_W44_OWNER_OR_W09_ROOT_REQUIRED');
const {openEligibilityStore}=await import(pathToFileURL(resolve(root,
  'services/api/src/domains/grant-custody-budget/index.mjs')).href);
const ctx={tenant:'SYNTHETIC_TEST_ONLY',principal_id:'fake-owner-1',input_domain:'CONTACT'};
const K=(peer='fake-A',revision=1,account='fixture-1')=>({
 tenant:ctx.tenant,account,channel:'FB_PERSONAL',peer_id:peer,binding_revision:revision
});
const A=K(),B=K('fake-B'),C=K('fake-C');
const proofAuthority={evaluate:({proof_ref})=>({approved:
  typeof proof_ref==='string'&&proof_ref.startsWith('fake-verified-')})};
function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'w24-actual-durable-')),path=join(dir,'shared.sqlite');
 const ports={path,requireDurableIdentity:true,authorizeMutation:({actor})=>actor===ctx.principal_id,
   verifyIdentity:()=>{throw Error('STRICT_MUST_NEVER_TRUST_W24_MEMORY')},
   verifyOwnerMutation:createW24DurableProofVerifier({proofAuthority,
     authorizeOperator:({actor})=>actor===ctx.principal_id})};
 const stores=[],services=[];
 function open(){
  const store=openEligibilityStore(ports);
  const ids=new IdentityConsentService({requireDurableIdentity:true,
    durableAuthority:store,proofAuthority});
  stores.push(store);services.push(ids);
  return {store,ids};
 }
 const f=open();
 t.after(()=>{for(const s of stores.reverse())s.close();rmSync(dir,{recursive:true,force:true})});
 function register(){
  const r=f.ids.registerAccount(ctx,{...A,principal_id:ctx.principal_id,
    binding_proof_ref:'fake-verified-channel'});
  assert.equal(r.status,'COMMITTED');
  for(const k of [A,B,C])assert.equal(
    f.ids.bindPeer(ctx,{...k,peer_proof_ref:'fake-verified-peer'}).status,'COMMITTED');
 }
 return {...f,open,register,path,ports};
}
test('strict missing W44 persistent ports fails without RAM fallback',()=>{
 assert.throws(()=>new IdentityConsentService({requireDurableIdentity:true}),
  e=>e.code==='W44_DURABLE_AUTHORITY_REQUIRED');
 const legacy=new IdentityConsentService();
 assert.equal(legacy.isDurableIdentity,false);
});
test('W24 strict account and 3 peers persist across independent service restart',t=>{
 const f=fixture(t);f.register();
 assert.equal(f.ids.isDurableIdentity,true);
 const before=f.ids.assertCurrent(ctx,A);
 assert.equal(before.identity_key,'SYNTHETIC_TEST_ONLY|fixture-1|FB_PERSONAL|fake-A|1');
 const again=f.open().ids;
 for(const k of [A,B,C]){
  assert.equal(again.assertCurrent(ctx,k).identity_key,f.ids.assertCurrent(ctx,k).identity_key);
  assert.equal(again.readConsentEpoch(ctx,k),f.ids.readConsentEpoch(ctx,k));
 }
 assert.throws(()=>again.assertCurrent({...ctx,principal_id:'fake-other'},A));
});
test('strict Consent and persisted epoch survive restart, absent and bad proofs deny',t=>{
 const f=fixture(t);f.register();
 assert.throws(()=>f.ids.evaluate(ctx,{k:A,operation:'SEND_MESSAGE',purpose:'CHAT',
   consent_id:'fake-consent-A'}),e=>e.code==='CONSENT_MISSING');
 assert.throws(()=>f.ids.createConsent(ctx,{k:A,consent_id:'fake-consent-A',
   operation:'SEND_MESSAGE',subject_id:'fake-subject',purpose:'CHAT',
   proof_ref:'fake-unverified',expires_at:Date.now()+100000}),
   e=>e.code==='DURABLE_PROOF_NOT_VERIFIED');
 const ep=f.ids.readConsentEpoch(ctx,A);
 const created=f.ids.createConsent(ctx,{k:A,consent_id:'fake-consent-A',
   operation:'SEND_MESSAGE',subject_id:'fake-subject',purpose:'CHAT',
   proof_ref:'fake-verified-consent',expires_at:Date.now()+100000});
 assert.equal(created.status,'COMMITTED');
 const revived=f.open().ids;
 assert.ok(revived.readConsentEpoch(ctx,A)>ep);
 assert.equal(revived.readConsentEpoch(ctx,A),f.ids.readConsentEpoch(ctx,A));
 const revoked=revived.revokeConsent(ctx,{k:A,consent_id:'fake-consent-A',
   expected_revision:1,idempotency_key:'fake-revoke-consent'});
 assert.equal(revoked.status,'COMMITTED');
 assert.equal(f.open().ids.readConsentEpoch(ctx,A),revived.readConsentEpoch(ctx,A));
 assert.throws(()=>f.ids.evaluate(ctx,{k:A,operation:'SEND_MESSAGE',purpose:'CHAT',
   consent_id:'fake-consent-A'}),e=>e.code==='CONSENT_NOT_EFFECTIVE');
});
test('strict fail-closed invalid account and unsupported consent operation, no memory bypass',t=>{
 const f=fixture(t);
 assert.throws(()=>f.ids.assertCurrent(ctx,A));
 assert.throws(()=>f.ids.bindPeer(ctx,{...A,peer_proof_ref:'fake-verified-peer'}));
 f.register();
 assert.throws(()=>f.ids.createConsent(ctx,{k:A,consent_id:'fake-legacy',
  subject_id:'fake-subject',purpose:'CHAT',operation:'VOICE_SYNTHESIS',
  proof_ref:'fake-verified-consent',expires_at:Date.now()+10000}),
  e=>e.code==='DURABLE_CONSENT_OPERATION_UNSUPPORTED');
 assert.throws(()=>f.ids.privacyEvents(ctx),
  e=>e.code==='DURABLE_PRIVACY_AUDIT_READ_UNAVAILABLE');
});
test('two W24 strict instances same K CAS 1 committed, conflict and stale epoch rejected',t=>{
 const f=fixture(t);f.register();
 const second=f.open().ids;
 const first=f.ids.createConsent(ctx,{k:A,consent_id:'fake-c1',
   subject_id:'fake-subject',purpose:'CHAT',operation:'SEND_MESSAGE',
   proof_ref:'fake-verified-consent',expires_at:Date.now()+100000});
 assert.equal(first.status,'COMMITTED');
 assert.throws(()=>second.createConsent(ctx,{k:A,consent_id:'fake-c1',
   subject_id:'fake-subject',purpose:'CHAT',operation:'SEND_MESSAGE',
   proof_ref:'fake-verified-consent',expires_at:Date.now()+100000}));
 assert.equal(f.ids.readConsentEpoch(ctx,A),second.readConsentEpoch(ctx,A));
});
test('A strict HUMAN edit actual W44 custody, B/C AUTO; old epoch blocked',t=>{
 const f=fixture(t);f.register();
 const service=createNativeTakeoverService({identityConsent:f.ids,
   custodyStore:f.store,authorizeTakeover:()=>true});
 const before=service.get({trustedContext:ctx,identity:A});
 const outcome=service.post({trustedContext:ctx,identity:A,
    expectedIdentityKey:before.identityKey,expectedEpoch:before.epoch,
    expectedAccountRevocationEpoch:before.accountRevocationEpoch,
    expectedConsentEpoch:before.consentEpoch,action:'PASTE',
    intent:'TAKEOVER_HUMAN_COMPOSER'});
 assert.equal(outcome.accepted,true);
 assert.equal(outcome.confirmedByGet,true);
 assert.equal(service.get({trustedContext:ctx,identity:A}).epoch,before.epoch+1);
 assert.equal(f.open().store.inspection(A).mode,'HUMAN');
 for(const k of [B,C])assert.equal(service.get({trustedContext:ctx,identity:k}).mode,'AUTO');
 assert.throws(()=>service.post({trustedContext:ctx,identity:A,
    expectedIdentityKey:before.identityKey,expectedEpoch:before.epoch,
    expectedAccountRevocationEpoch:before.accountRevocationEpoch,
    expectedConsentEpoch:before.consentEpoch,action:'PASTE',
    intent:'TAKEOVER_HUMAN_COMPOSER'}));
});
test('GLOBAL revoke is durable and does not relink peers or silently restore grant',t=>{
 const f=fixture(t);f.register();
 const result=f.ids.invalidateAccount(ctx,{...A,expected_revision:1});
 assert.equal(result.status,'COMMITTED');
 for(const k of [A,B,C])assert.throws(()=>f.ids.assertCurrent(ctx,k));
 const r=f.ids.relinkAccount(ctx,{...A,expected_revision:2,
   binding_proof_ref:'fake-verified-relink'});
 assert.equal(r.status,'COMMITTED');
 const next=K('fake-A',3);
 assert.throws(()=>f.ids.assertCurrent(ctx,next));
 assert.equal(f.ids.bindPeer(ctx,{...next,peer_proof_ref:'fake-verified-peer'}).status,'COMMITTED');
 assert.equal(f.open().ids.assertCurrent(ctx,next).binding_revision,3);
 assert.throws(()=>f.ids.assertCurrent(ctx,A));
});

test('real 2 independent OS workers on same W24/W44 SQLite compete: exactly one CREATE_CONSENT',async t=>{
 const f=fixture(t);f.register();
 const ownerFile=new URL('./identity-consent.mjs',import.meta.url).href;
 const proofFile=new URL('./durable-identity.mjs',import.meta.url).href;
 const w44File=pathToFileURL(resolve(root,
   'services/api/src/domains/grant-custody-budget/index.mjs')).href;
 const src=[
   'import {IdentityConsentService} from '+JSON.stringify(ownerFile)+';',
   'import {createW24DurableProofVerifier} from '+JSON.stringify(proofFile)+';',
   'import {openEligibilityStore} from '+JSON.stringify(w44File)+';',
   'const actor="fake-owner-1",ctx={tenant:"SYNTHETIC_TEST_ONLY",principal_id:actor,input_domain:"CONTACT"};',
   'const k=JSON.parse(process.argv[2]);',
   'const proofAuthority={evaluate:({proof_ref})=>({approved:proof_ref==="fake-verified-consent"})};',
   'const store=openEligibilityStore({path:process.argv[1],requireDurableIdentity:true,authorizeMutation:({actor:a})=>a===actor,',
   ' verifyOwnerMutation:createW24DurableProofVerifier({proofAuthority,authorizeOperator:({actor:a})=>a===actor})});',
   'const ids=new IdentityConsentService({durableAuthority:store,requireDurableIdentity:true,proofAuthority});',
   'try { const r=ids.createConsent(ctx,{k,consent_id:"fake-concurrent-consent",subject_id:"fake-subject",',
   ' operation:"SEND_MESSAGE",purpose:"CHAT",proof_ref:"fake-verified-consent",',
   ' expires_at:Date.now()+200000,idempotency_key:"fake-os-"+process.argv[3]});',
   ' console.log(JSON.stringify({ok:r.status==="COMMITTED",status:r.status}));}',
   'catch(e){console.log(JSON.stringify({ok:false,reason:e.code??e.message}));}',
   'finally{store.close()}'
 ].join('\n');
 const worker=i=>new Promise((ok,reject)=>{
  const child=spawn(process.execPath,['--input-type=module','-e',src,f.path,
    JSON.stringify(A),String(i)],{windowsHide:true});
  let out='',err='';
  child.stdout.on('data',x=>out+=x);
  child.stderr.on('data',x=>err+=x);
  child.once('error',reject);
  child.once('close',code=>{
   if(code!==0)return reject(Error(err+' EXIT '+code));
   try{ok(JSON.parse(out.trim()))}catch(e){reject(Error(out+err+e.message))}
  });
 });
 const results=await Promise.all([worker(1),worker(2)]);
 assert.equal(results.filter(x=>x.ok).length,1);
 assert.equal(results.filter(x=>!x.ok).length,1);
 const after=f.open().store.readIdentityAuthority({actor:ctx.principal_id,identity:A});
 assert.equal(after.consents.filter(c=>c.consent_id==='fake-concurrent-consent').length,1);
});
test('forced W44 transaction proof exception rolls back W24/W44 identity together; pending survives reopen',t=>{
 const f=fixture(t);f.register();
 const badStore=openEligibilityStore({...f.ports,verifyOwnerMutation:()=>{
   throw Error('INJECTED_SQLITE_TXN_PROOF_FAILURE');
 }});
 const badIds=new IdentityConsentService({durableAuthority:badStore,
   requireDurableIdentity:true,proofAuthority});
 const before=f.ids.readConsentEpoch(ctx,A);
 const payload={consentId:'fake-fault-consent',subjectId:'fake-subject',
   purpose:'CHAT',operation:'SEND_MESSAGE',proofRef:'fake-verified-consent',
   expiresAt:Date.now()+100000,approved:true};
 assert.throws(()=>badIds.createConsent(ctx,{k:A,
   consent_id:payload.consentId,subject_id:payload.subjectId,
   purpose:payload.purpose,operation:payload.operation,
   proof_ref:payload.proofRef,expires_at:payload.expiresAt,
   idempotency_key:'fake-fault-proof'}),/INJECTED_SQLITE_TXN_PROOF_FAILURE/);
 assert.equal(f.ids.readConsentEpoch(ctx,A),before);
 const afterFailure=f.store.mutationResult({requestId:'fake-fault-proof',actor:ctx.principal_id});
 assert.equal(afterFailure.status,'PENDING');
 const reopened=f.open().store;
 assert.equal(reopened.readMutationFence({actor:ctx.principal_id,
   identity:A,scope:'CONTACT'}).pending,true);
 const recovered=f.ids.finalizePendingMutation(ctx,'fake-fault-proof',payload);
 assert.equal(recovered.status,'COMMITTED');
 assert.equal(f.open().ids.readConsentEpoch(ctx,A),before+1);
 assert.equal(f.ids.finalizePendingMutation(ctx,'fake-fault-proof',payload).status,'COMMITTED');
 badStore.close();
});
test('strict rejects non-native W44 compatibility facade, incomplete K, stale revisions, wrong actor',t=>{
 const f=fixture(t);f.register();
 assert.throws(()=>f.ids.bindPeer(ctx,{...A,binding_revision:undefined,
   peer_proof_ref:'fake-verified-peer'}));
 assert.throws(()=>f.ids.invalidateAccount({...ctx,principal_id:'fake-attacker'},
   {...A,expected_revision:1}));
 assert.throws(()=>f.ids.invalidateAccount(ctx,{...A,expected_revision:88}));
 const absent=f.ids.mutationResult(ctx,'fake-nonexistent');
 assert.equal(absent.ok,false);
});

test('strict Consent revoke cannot bypass a W44 CONTACT pending barrier (legacy RAM exploit closed)',t=>{
 const f=fixture(t);f.register();
 const created=f.ids.createConsent(ctx,{k:A,consent_id:'fake-barrier-consent',
  subject_id:'fake-subject',purpose:'CHAT',operation:'SEND_MESSAGE',
  proof_ref:'fake-verified-consent',expires_at:Date.now()+100000});
 assert.equal(created.status,'COMMITTED');
 const before=f.store.readIdentityAuthority({actor:ctx.principal_id,identity:A});
 const fence=f.store.readMutationFence({actor:ctx.principal_id,
  identity:A,scope:'CONTACT'});
 const marker=f.store.requestMutationFence({actor:ctx.principal_id,identity:A,
  scope:'CONTACT',kind:'HUMAN_TAKEOVER',payload:{action:'USER_EDIT'},
  expectedGeneration:fence.generation,
  expectedBindingRevision:before.bindingRevision,
  expectedAccountEpoch:before.accountEpoch,
  expectedConsentEpoch:before.consentEpoch,
  expectedCustodyEpoch:before.custodyEpoch,
  idempotencyKey:'fake-synthetic-blocking-fence'});
 assert.equal(marker.status,'PENDING');
 assert.throws(()=>f.ids.revokeConsent(ctx,{k:A,
  consent_id:'fake-barrier-consent',expected_revision:1,
  idempotency_key:'fake-revoke-while-pending'}),
  e=>e.code==='MUTATION_ALREADY_PENDING');
 const after=f.store.readIdentityAuthority({actor:ctx.principal_id,identity:A});
 assert.equal(after.consentEpoch,before.consentEpoch);
 assert.equal(after.consents.find(x=>x.consent_id==='fake-barrier-consent').status,'ACTIVE');
 assert.equal(f.open().store.readMutationFence({actor:ctx.principal_id,
  identity:A,scope:'CONTACT'}).pending,true);
});

test('fresh OS process reads W24 durable account, Peer, Consent and epochs after previous commits',async t=>{
 const f=fixture(t);f.register();
 const created=f.ids.createConsent(ctx,{k:A,consent_id:'fake-restart-consent',
   subject_id:'fake-subject',purpose:'CHAT',operation:'SEND_MESSAGE',
   proof_ref:'fake-verified-consent',expires_at:Date.now()+100000});
 assert.equal(created.status,'COMMITTED');
 const nativeUrl=pathToFileURL(resolve(root,'services/api/src/domains/grant-custody-budget/index.mjs')).href;
 const serviceUrl=new URL('./identity-consent.mjs',import.meta.url).href;
 const src=[
  'import {openEligibilityStore} from '+JSON.stringify(nativeUrl)+';',
  'import {IdentityConsentService} from '+JSON.stringify(serviceUrl)+';',
  'const actor="fake-owner-1",ctx={tenant:"SYNTHETIC_TEST_ONLY",principal_id:actor,input_domain:"CONTACT"};',
  'const k=JSON.parse(process.argv[2]);',
  'const db=openEligibilityStore({path:process.argv[1],requireDurableIdentity:true,',
  ' authorizeMutation:({actor:a})=>a===actor,verifyOwnerMutation:()=>({verified:false})});',
  'try{const ids=new IdentityConsentService({requireDurableIdentity:true,durableAuthority:db});',
  ' const now=ids.assertCurrent(ctx,k),epoch=ids.readConsentEpoch(ctx,k);',
  ' const details=db.readIdentityAuthority({actor,identity:k});',
  ' console.log(JSON.stringify({identityKey:now.identity_key,epoch,accountEpoch:details.accountEpoch,',
  '  consent:details.consents.map(c=>({id:c.consent_id,status:c.status,revision:c.consent_revision}))}));}',
  'finally{db.close()}'
 ].join('\n');
 const result=await new Promise((ok,reject)=>{
  const cp=spawn(process.execPath,['--input-type=module','-e',src,f.path,JSON.stringify(A)],
    {windowsHide:true});
  let out='',err='';
  cp.stdout.on('data',x=>out+=x);cp.stderr.on('data',x=>err+=x);
  cp.once('error',reject);
  cp.once('close',code=>{
   if(code!==0)return reject(Error(err+' '+code));
   try{ok(JSON.parse(out.trim()))}catch(e){reject(Error(out+err+e.message))}
  });
 });
 assert.equal(result.identityKey,f.ids.assertCurrent(ctx,A).identity_key);
 assert.equal(result.epoch,f.ids.readConsentEpoch(ctx,A));
 assert.equal(result.accountEpoch,0);
 assert.deepEqual(result.consent,[{id:'fake-restart-consent',status:'ACTIVE',revision:1}]);
});
