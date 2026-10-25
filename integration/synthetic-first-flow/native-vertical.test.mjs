import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {IdentityConsentService} from '../../services/api/src/domains/identity-consent/identity-consent.mjs';
import {createW24GrantAuthority,createW24IdentityPorts,createW25EligibilityPort,createW25PersistedArmVerifier,createW25SettlementVerifier} from '../../services/api/src/domains/grant-custody-budget/native-bridges.mjs';
import {openEligibilityStore} from '../../services/api/src/domains/grant-custody-budget/index.mjs';
import {MessageDelivery,SyntheticConnectorSink} from '../../services/api/src/domains/message-delivery/index.mjs';
import {createPeopleTranslationReplyService} from '../../services/api/src/domains/people-translation-reply/index.mjs';
import {createSyntheticInboundAdapter} from '../../connectors/mautrix-meta/src/synthetic-inbound.mjs';

// CROSS-DOMAIN ACTUAL NATIVE CODE: W26 -> W24 -> W45 -> W44 -> W25 SQLite.
// Only synthetic input/output, deterministic fixture translator, NOT authentic AI, Meta or Agno.
test('W26 inbound -> W24 K -> W45 translated fixture -> W44 durable grant -> W25 single synthetic Outbox & ACK -> revoke fence',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'yance-v2-actual-synthetic-vertical-'));
 const identity={tenant:'SYNTHETIC_TEST_ONLY',account:'fixture-account-1',
   channel:'FB_PERSONAL',peer_id:'fake-peer-001',binding_revision:1};
 const k25={tenantId:identity.tenant,accountId:identity.account,channel:identity.channel,
   peerId:identity.peer_id,bindingRevision:'1'};
 const ctx={tenant:identity.tenant,principal_id:'fake-owner-1',input_domain:'CONTACT'};
 let store,delivery;
 const agent=()=>({active:true,revision:'fake-agent-v1'});
 const auth=createW24GrantAuthority({getStore:()=>store,readAgentState:agent});
 const ids=new IdentityConsentService({grantAuthority:auth});
 const translated=createPeopleTranslationReplyService({
   translator:{async translate({mid,original,inputSha256,attempt,targetLanguage}){
     return {status:'OK',translatedText:'模拟中文译文：'+original,sourceLanguage:'de',targetLanguage,
       provenance:{kind:'SYNTHETIC_FIXTURE',provider:'OFFLINE_FIXTURE_NOT_REAL_TRANSLATION',
         requestId:'fake-translation-'+attempt,sourceMid:mid,inputSha256}};
   }}
 });
 const seen=[];
 try {
   ids.registerAccount(ctx,{tenant:identity.tenant,account:identity.account,channel:identity.channel,
     principal_id:ctx.principal_id,binding_revision:1});
   ids.bindPeer(ctx,identity);
   const bindings=[{...identity,simulated:true,bridge_instance_id:'fake-bridge-1',
     remote_account_id:'fake-remote-1',remote_thread_id:'fake-thread-1'}];
   const adapter=createSyntheticInboundAdapter({bindings,async onInbound(message){
     ids.assertCurrent(ctx,message.k);
     const result=await translated.ingestInbound({identity:message.k,mid:message.mid,
       original:message.original,source:{kind:'SYNTHETIC_FIXTURE',fixture_id:'fake-vertical-w09'},
       targetLanguage:'zh-CN'});
     seen.push(result);
   }});
   adapter.observeConnection({simulated:true,bridge_instance_id:'fake-bridge-1',
     remote_account_id:'fake-remote-1',binding_revision:1,connection_epoch:1,state:'ONLINE'});
   const event={...bindings[0],source:'mautrix-meta',kind:'MESSAGE',
     provider_mid:'fake-meta-mid-001',matrix_event_id:'fake-matrix-event-001',
     original:'Guten Tag',connection_epoch:1};
   const first=await adapter.receive(event);
   assert.equal(first.accepted,true);
   assert.equal(first.normalized.simulated,true);
   assert.equal(seen.length,1);
   assert.equal(seen[0].original.text,'Guten Tag');
   assert.equal(seen[0].translation.status,'FIXTURE_ONLY');
   assert.equal(seen[0].translation.provenance.synthetic,true);
   assert.deepEqual(seen[0].candidates,[],'No fake Agno candidate may be fabricated');
   assert.equal((await adapter.receive(event)).duplicate,true);
   assert.equal(seen.length,1,'Provider MID duplicate must not retranslate');

   const ports=createW24IdentityPorts({identityService:ids,trustedContext:ctx,
     readConsentEpoch:({k})=>ids.readConsentEpoch(ctx,k),
     authorizeOperator:({actor})=>actor==='fake-owner-1'});
   store=openEligibilityStore({path:join(dir,'grant.sqlite'),...ports,
     verifyDeliveryArm:createW25PersistedArmVerifier({getDelivery:()=>delivery}),
     verifySettlement:createW25SettlementVerifier({getDelivery:()=>delivery})});
   store.grant({identity,scope:'GLOBAL',actor:'fake-owner-1',budgetUnits:3,
     expiresAt:Date.now()+300000});
   const elig=createW25EligibilityPort({store,identityService:ids,trustedContext:ctx,
     readAgentState:agent,readRouteState:()=>({ready:true,revision:'fake-route-v1'}),
     getDelivery:()=>delivery});
   const sink=new SyntheticConnectorSink();
   delivery=new MessageDelivery({databasePath:join(dir,'outbox.sqlite'),eligibility:elig,sink,
     receiptVerifier:async()=>({verified:true,source:'SYNTHETIC_TEST_ONLY'})});
   // This is an isolated synthetic send intent, not a model-generated text or an outbound contact message.
   const intent=await delivery.submitIntent({k:k25,businessMessageId:'fake-business-w09-1',
     payload:{text:'synthetic-only-send-boundary-test'},mode:'AUTO',
     actorId:'fake-owner-1',sessionId:'fake-session-1'});
   assert.equal(intent.state,'QUEUED');
   const ack=await delivery.dispatchOne(intent.id);
   assert.equal(ack.state,'ACKED_SYNTHETIC');
   assert.equal(sink.calls.length,1);
   assert.equal(store.settleBoundary({identity,intentId:'fake-business-w09-1',
     evidence:{w25IntentId:intent.id}}).state,'COMMITTED');
   // W24's actual peer-scoped consent epoch must fence a queued W25 attempt.
   // This regression must fail if the W44 integration silently restores epoch=1.
   const queued=await delivery.submitIntent({k:k25,businessMessageId:'fake-business-w09-consent',
     payload:{text:'synthetic queued before consent revision'},mode:'AUTO',
     actorId:'fake-owner-1',sessionId:'fake-session-1'});
   assert.equal(queued.state,'QUEUED');
   ids.createConsent(ctx,{k:identity,consent_id:'fake-w09-consent-1',subject_id:'fake-user',
     proof_ref:'fake-proof',operation:'VOICE_SYNTHESIS',purpose:'SYNTHETIC_BOUNDARY',
     expires_at:Date.now()+300000});
   assert.equal(ids.readConsentEpoch(ctx,identity),2);
   const blocked=await delivery.dispatchOne(queued.id);
   assert.equal(blocked.state,'DENIED','Queued old-epoch attempt must not reach send sink');
   assert.equal(sink.calls.length,1,'Consent epoch change must cause zero additional sends');
   const revoked=store.revoke({identity,scope:'GLOBAL',expectedEpoch:1,actor:'fake-owner-1'});
   assert.equal(revoked.enabled,false);
   await assert.rejects(delivery.submitIntent({k:k25,businessMessageId:'fake-business-w09-2',
     payload:{text:'must-never-send-after-revoke'},mode:'AUTO',
     actorId:'fake-owner-1',sessionId:'fake-session-1'}));
   assert.equal(sink.calls.length,1,'Revoked intent must not reach sink');
   assert.ok(delivery.getAudit(intent.id).some(x=>x.event_type==='SYNTHETIC_RESULT'));
   assert.equal(delivery.getIntent(intent.id).state,'ACKED_SYNTHETIC');
   console.log('W09_NATIVE_5_DOMAIN_END_TO_END_SYNTHETIC_PASS',JSON.stringify({
     domains:['W26','W24','W45','W44','W25'],model:'NOT_INTEGRATED',translator:'FIXTURE_ONLY',
     socket:'NONE',sink:'SYNTHETIC_CONNECTOR_ONLY',outbox:'SQLITE',
     acceptedInbound:seen.length,duplicateBlocked:true,revokeBlocked:true,syntheticSinkCalls:sink.calls.length}));
 } finally {
   delivery?.close();store?.close();rmSync(dir,{recursive:true,force:true});
 }
});
