import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {createNativeTakeoverHttpHandler} from './takeover-http.mjs';
import {TAKEOVER_GET,TAKEOVER_POST} from './takeover.mjs';
import {IdentityConsentService} from './identity-consent.mjs';
import {createW24DurableProofVerifier} from './durable-identity.mjs';
import {createNativeTakeoverService} from './takeover.mjs';
const base=process.env.YANCE_W44_ROOT||process.env.YANCE_PR32_ROOT;
const w25Root=process.env.YANCE_W25_ROOT||process.env.YANCE_PR32_ROOT;
if(!base||!w25Root)throw Error('EXPLICIT_EXISTING_W44_AND_W25_SOURCE_REQUIRED');
const w44=resolve(base,'services/api/src/domains/grant-custody-budget');
const {openEligibilityStore}=await import(pathToFileURL(join(w44,'index.mjs')).href);
const {createW24GrantAuthority,createW25EligibilityPort,
  createW25PersistedArmVerifier,createW25SettlementVerifier}=await import(
    pathToFileURL(join(w44,'native-bridges.mjs')).href);
const {MessageDelivery,SyntheticConnectorSink}=await import(pathToFileURL(resolve(
  w25Root,'services/api/src/domains/message-delivery/index.mjs')).href);
const ctx={tenant:'SYNTHETIC_TEST_ONLY',principal_id:'fake-owner-1',input_domain:'CONTACT'};
const k={tenant:ctx.tenant,account:'fixture-w24-strict',channel:'FB_PERSONAL',
 peer_id:'fake-A',binding_revision:1};
const K25={tenantId:k.tenant,accountId:k.account,channel:k.channel,
 peerId:k.peer_id,bindingRevision:'1'};
const proofAuthority={evaluate:({proof_ref})=>({approved:
 typeof proof_ref==='string'&&proof_ref.startsWith('fake-verified-')})};
async function create(t,{sinkFactory=()=>new SyntheticConnectorSink()}={}){
 const dir=mkdtempSync(join(tmpdir(),'w24-w44-w25-durable-'));
 const agent=()=>({active:true,revision:'fake-agent-v1'});
 let store,delivery;
 const grantAuthority=createW24GrantAuthority({getStore:()=>store,readAgentState:agent});
 store=openEligibilityStore({path:join(dir,'same-w44-authority.sqlite'),
   requireDurableIdentity:true,
   authorizeMutation:({actor})=>actor===ctx.principal_id,
   verifyIdentity:()=>{throw Error('W24_RAM_MUST_NEVER_AUTHORIZE');},
   verifyOwnerMutation:createW24DurableProofVerifier({
     proofAuthority,authorizeOperator:({actor})=>actor===ctx.principal_id}),
   verifySettlement:createW25SettlementVerifier({getDelivery:()=>delivery}),
   verifyDeliveryArm:createW25PersistedArmVerifier({getDelivery:()=>delivery})
 });
 const ids=new IdentityConsentService({requireDurableIdentity:true,durableAuthority:store,
   proofAuthority,grantAuthority});
 const register=ids.registerAccount(ctx,{...k,principal_id:ctx.principal_id,
   binding_proof_ref:'fake-verified-channel'});
 assert.equal(register.status,'COMMITTED');
 assert.equal(ids.bindPeer(ctx,{...k,peer_proof_ref:'fake-verified-peer'}).status,'COMMITTED');
 assert.equal(ids.createConsent(ctx,{k,consent_id:'fake-send-consent',
   subject_id:'fake-peer-subject',purpose:'CHAT',operation:'SEND_MESSAGE',
   proof_ref:'fake-verified-send',expires_at:Date.now()+300000}).status,'COMMITTED');
 store.grant({identity:k,scope:'GLOBAL',actor:ctx.principal_id,budgetUnits:5,
   expiresAt:Date.now()+300000});
 const eligibility=createW25EligibilityPort({store,identityService:ids,trustedContext:ctx,
   readAgentState:agent,readRouteState:()=>({ready:true,revision:'fake-route'}),
   getDelivery:()=>delivery});
 const sink=sinkFactory({store,ids,getDelivery:()=>delivery});
 delivery=new MessageDelivery({databasePath:join(dir,'sole-w25-outbox.sqlite'),
   eligibility,sink,receiptVerifier:async e=>({
     verified:e.signature==='fake-signed',source:'SYNTHETIC_TEST_ONLY'})});
 t.after(()=>{delivery.close();store.close();rmSync(dir,{recursive:true,force:true})});
 const submit=async name=>delivery.submitIntent({k:K25,businessMessageId:name,
   payload:{text:'SYNTHETIC ONLY'},mode:'AUTO',actorId:ctx.principal_id,
   sessionId:'fake-session-1'});
 return {store,ids,delivery,sink,submit};
}
test('strict W24 Consent required and W25 real Outbox PRE_NETWORK: before ARM account revoke denies',async t=>{
 const f=await create(t);
 const row=await f.submit('fake-pre-arm');
 assert.equal(row.state,'QUEUED');
 const rev=f.ids.invalidateAccount(ctx,{...k,expected_revision:1});
 assert.equal(rev.status,'COMMITTED');
 const result=await f.delivery.dispatchOne(row.id);
 assert.equal(result.state,'DENIED');
 assert.equal(f.sink.calls.length,0);
 assert.equal(f.store.qualify(k).ok,false);
});
test('strict W24 ARMED UNKNOWN: revoke PENDING, no retry/budget release; original W25 late ACK settles first',async t=>{
 let pending;
 const f=await create(t,{sinkFactory:({ids})=>new SyntheticConnectorSink(async()=>{
   pending=ids.invalidateAccount(ctx,{...k,expected_revision:1,
     idempotency_key:'fake-armed-revoke'});
   assert.equal(pending.status,'PENDING');
   return {kind:'UNKNOWN'};
 })});
 const b={...k,peer_id:'fake-B'},c={...k,peer_id:'fake-C'};
 for(const peer of [b,c])f.ids.bindPeer(ctx,{...peer,peer_proof_ref:'fake-verified-peer'});
 const row=await f.submit('fake-armed-unknown');
 assert.equal(row.state,'QUEUED');
 const result=await f.delivery.dispatchOne(row.id);
 assert.equal(result.state,'UNKNOWN');
 assert.equal(pending.status,'PENDING');
 assert.equal(f.sink.calls.length,1);
 assert.equal(f.ids.assertCurrent(ctx,k).binding_revision,1,
   'PENDING is not effective account revoke');
 assert.equal(f.store.leaseStatus(k).active,true);
 assert.equal(f.store.leaseStatus(k).mutationPending,true);
 for(const peer of [b,c])assert.equal(f.store.qualify(peer).reason,
   'AUTHORITY_MUTATION_PENDING','GLOBAL account fence must cover every peer');
 assert.equal((await f.delivery.dispatchOne(row.id)).state,'UNKNOWN');
 assert.equal(f.sink.calls.length,1);
 assert.equal(f.store.settleBoundary({identity:k,intentId:'fake-armed-unknown',
   evidence:{w25IntentId:row.id}}).reason,'W25_RECEIPT_UNVERIFIED');
 const q=f.delivery.getIntent(row.id),attempt=f.delivery.getAttempt(row.id);
 const late=await f.delivery.recordVerifiedReceipt({sourceEventId:'fake-late-1',
  intentId:row.id,attemptId:attempt.id,providerMid:'synthetic:late',
  kind:'ACK',bindingRevision:q.k.bindingRevision,channel:q.k.channel,
  accountId:q.k.accountId,peerId:q.k.peerId,
  pageOwnerEpoch:q.authority.pageOwnerEpoch,signature:'fake-signed'});
 assert.equal(late.state,'ACKED_SYNTHETIC');
 assert.equal(f.store.settleBoundary({identity:k,intentId:'fake-armed-unknown',
   evidence:{w25IntentId:row.id}}).state,'COMMITTED');
 assert.equal(f.ids.finalizePendingMutation(ctx,pending.requestId,{}).status,'COMMITTED');
 assert.throws(()=>f.ids.assertCurrent(ctx,k));
});
test('strict W24 manual A takeover has no synthetic W25 send and leaves B/C AUTO',async t=>{
 const f=await create(t);
 const b={...k,peer_id:'fake-B'},c={...k,peer_id:'fake-C'};
 for(const other of [b,c])assert.equal(f.ids.bindPeer(ctx,
   {...other,peer_proof_ref:'fake-verified-peer'}).status,'COMMITTED');
 const api=createNativeTakeoverService({identityConsent:f.ids,custodyStore:f.store,
   authorizeTakeover:()=>true});
 const before=api.get({trustedContext:ctx,identity:k});
 const next=api.post({trustedContext:ctx,identity:k,
   expectedIdentityKey:before.identityKey,expectedEpoch:before.epoch,
   expectedAccountRevocationEpoch:before.accountRevocationEpoch,
   expectedConsentEpoch:before.consentEpoch,action:'PASTE',
   intent:'TAKEOVER_HUMAN_COMPOSER'});
 assert.equal(next.accepted,true);
 assert.equal(api.get({trustedContext:ctx,identity:k}).mode,'HUMAN');
 for(const other of [b,c])assert.equal(api.get({trustedContext:ctx,identity:other}).mode,'AUTO');
 assert.equal(f.sink.calls.length,0);
});

test('strict HTTP plus exact W46 native Composer: GET→POST→GET HUMAN, 409/422 negatives and B/C AUTO',async t=>{
 const w46=process.env.YANCE_W46_ROOT;
 if(!w46)throw Error('EXPLICIT_W46_OWNER_SOURCE_REQUIRED');
 const src=resolve(w46,'apps/web/src');
 const {createLoopbackTakeoverPort}=await import(pathToFileURL(join(src,'native-takeover-port.mjs')).href);
 const {createComposerBridge}=await import(pathToFileURL(join(src,'composer-bridge.mjs')).href);
 const f=await create(t);
 const b={...k,peer_id:'fake-B'},c={...k,peer_id:'fake-C'};
 for(const peer of [b,c])f.ids.bindPeer(ctx,{...peer,peer_proof_ref:'fake-verified-peer'});
 const srv=createServer(createNativeTakeoverHttpHandler({
   service:createNativeTakeoverService({identityConsent:f.ids,custodyStore:f.store,
     authorizeTakeover:()=>true}),
   resolveTrustedContext:()=>ctx
 }));
 await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));
 t.after(async()=>new Promise(ok=>srv.close(ok)));
 const port=createLoopbackTakeoverPort({baseUrl:'http://127.0.0.1:'+srv.address().port,
   enabled:true,endpoints:{get:TAKEOVER_GET,post:TAKEOVER_POST}});
 const bridge=createComposerBridge({takeoverPort:port});
 bridge.choose(k);
 const before=await port.get(k);
 assert.equal(before.mode,'AUTO');
 assert.equal((await bridge.inspect(k)).status,'READ_ONLY_AUTO');
 assert.equal((await port.get(k)).epoch,before.epoch);
 const bad={expectedIdentityKey:before.identityKey,expectedEpoch:before.epoch,
   expectedAccountRevocationEpoch:before.accountRevocationEpoch,
   expectedConsentEpoch:before.consentEpoch,action:'PASTE',
   intent:'TAKEOVER_HUMAN_COMPOSER'};
 await assert.rejects(port.post(k,{...bad,expectedEpoch:99}),/NATIVE_HTTP_409/);
 await assert.rejects(port.post(k,{...bad,expectedConsentEpoch:undefined}),/NATIVE_HTTP_422/);
 const result=await bridge.userAction(k,'PASTE',{text:'SYNTHETIC'});
 assert.equal(result.status,'READY_HUMAN');
 assert.equal(result.verifiedEpoch,before.epoch+1);
 const after=await port.get(k);
 assert.equal(after.mode,'HUMAN');
 assert.equal(after.epoch,before.epoch+1);
 for(const peer of [b,c])assert.equal((await port.get(peer)).mode,'AUTO');
 assert.equal(f.sink.calls.length,0);
});

test('strict HUMAN TAKEOVER requested after W25 ARM returns genuine PENDING, not fake HUMAN',async t=>{
 let pending;
 const f=await create(t,{sinkFactory:({store,ids})=>new SyntheticConnectorSink(async()=>{
   const api=createNativeTakeoverService({identityConsent:ids,custodyStore:store,
     authorizeTakeover:()=>true});
   const before=api.get({trustedContext:ctx,identity:k});
   pending=api.post({trustedContext:ctx,identity:k,
     expectedIdentityKey:before.identityKey,expectedEpoch:before.epoch,
     expectedAccountRevocationEpoch:before.accountRevocationEpoch,
     expectedConsentEpoch:before.consentEpoch,action:'PASTE',
     intent:'TAKEOVER_HUMAN_COMPOSER'});
   assert.equal(pending.status,'PENDING');
   assert.equal(pending.accepted,false);
   assert.equal(api.get({trustedContext:ctx,identity:k}).mode,'AUTO');
   return {kind:'UNKNOWN'};
 })});
 const row=await f.submit('fake-human-armed');
 assert.equal((await f.delivery.dispatchOne(row.id)).state,'UNKNOWN');
 assert.equal(pending.status,'PENDING');
 assert.equal(f.store.leaseStatus(k).mutationPending,true);
 assert.equal(f.store.leaseStatus(k).active,true);
 assert.equal(f.store.inspection(k).mode,'AUTO');
 assert.equal(f.sink.calls.length,1);
 assert.equal((await f.delivery.dispatchOne(row.id)).state,'UNKNOWN');
 assert.equal(f.sink.calls.length,1);
});
