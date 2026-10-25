import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const [w24File,w25File]=process.argv.slice(2);
if(!w24File||!w25File)throw Error('EXPLICIT_W24_AND_W25_NATIVE_FILES_REQUIRED');
const {IdentityConsentService}=await import(pathToFileURL(w24File).href);
const {MessageDelivery,SyntheticConnectorSink}=await import(pathToFileURL(w25File).href);
import {openEligibilityStore} from './index.mjs';
import {createW24GrantAuthority,createW24IdentityPorts,createW25EligibilityPort,createW25PersistedArmVerifier,createW25SettlementVerifier} from './native-bridges.mjs';
const dir=mkdtempSync(join(tmpdir(),'w44-native-interop-'));
const k={tenant:'SYNTHETIC_TEST_ONLY',account:'fixture-1',channel:'FB_PERSONAL',peer_id:'fake-peer-A',binding_revision:1};
const k25={tenantId:k.tenant,accountId:k.account,channel:k.channel,peerId:k.peer_id,bindingRevision:'1'};
const ctx={tenant:k.tenant,principal_id:'fake-owner-1',input_domain:'CONTACT'};
let store,delivery;
const agent=()=>({active:true,revision:'fake-agent-v1'});
const grantAuthority=createW24GrantAuthority({getStore:()=>store,readAgentState:agent});
const ids=new IdentityConsentService({grantAuthority});
try{
 ids.registerAccount(ctx,{tenant:k.tenant,account:k.account,channel:k.channel,
    principal_id:ctx.principal_id,binding_revision:1});
 ids.bindPeer(ctx,k);
 const ports=createW24IdentityPorts({identityService:ids,trustedContext:ctx,
    readConsentEpoch:({k})=>ids.readConsentEpoch(ctx,k),authorizeOperator:({actor})=>actor==='fake-owner-1'});
 store=openEligibilityStore({path:join(dir,'grant.sqlite'),...ports,
  verifySettlement:createW25SettlementVerifier({getDelivery:()=>delivery}),
  verifyDeliveryArm:createW25PersistedArmVerifier({getDelivery:()=>delivery})});
 store.grant({identity:k,scope:'GLOBAL',actor:'fake-owner-1',budgetUnits:3,
    expiresAt:Date.now()+300000});
 const elig=createW25EligibilityPort({store,identityService:ids,trustedContext:ctx,
    readAgentState:agent,readRouteState:()=>({ready:true,revision:'fake-route-v1'}),
    getDelivery:()=>delivery});
 delivery=new MessageDelivery({databasePath:join(dir,'outbox.sqlite'),eligibility:elig,
    sink:new SyntheticConnectorSink(),
    receiptVerifier:async()=>({verified:true,source:'SYNTHETIC_TEST_ONLY'})});
 const sent=await delivery.submitIntent({k:k25,businessMessageId:'fake-business-1',
    payload:{text:'synthetic hey'},mode:'AUTO',actorId:'fake-owner-1',sessionId:'fake-session-1'});
 assert.equal(sent.state,'QUEUED');
 const result=await delivery.dispatchOne(sent.id);
 if(result.state!=='ACKED_SYNTHETIC')console.log('SYNTHETIC_INTEROP_FAILURE',result,delivery.getAudit(sent.id));
 assert.equal(result.state,'ACKED_SYNTHETIC');
 assert.equal(store.leaseStatus(k).active,true); // W25 final PRE_NETWORK consumed W44 arm gate
 assert.equal(store.settleBoundary({identity:k,intentId:'fake-business-1',
    evidence:{w25IntentId:sent.id}}).state,'COMMITTED');
 assert.equal(store.leaseStatus(k).active,false);
 const receipt=delivery.getIntent(sent.id);
 assert.equal(receipt.state,'ACKED_SYNTHETIC');
 console.log('REAL_W24_W44_W25_SYNTHETIC_PASS',JSON.stringify({
   intentId:sent.id,outboxState:result.state,budgetSpent:store.inspection(k).effectiveGrant.spent,
   auditEvents:delivery.getAudit(sent.id).length}));
 const g=store.revoke({identity:k,scope:'GLOBAL',expectedEpoch:1,actor:'fake-owner-1'});
 assert.equal(g.enabled,false);
 await assert.rejects(delivery.submitIntent({k:k25,businessMessageId:'fake-business-2',
    payload:{text:'must deny'},mode:'AUTO',actorId:'fake-owner-1',sessionId:'fake-session-1'}));
 console.log('REVOKE_FENCE_NATIVE_PASS',delivery.sink.calls.length);
 // Race: revoke AFTER first W25 PRE_NETWORK but BEFORE its final in-flight
 // PRE_NETWORK. The only permitted consequence is a durable DENIED_NO_SEND.
 const refreshed=store.grant({identity:k,scope:'GLOBAL',actor:'fake-owner-1',
   expectedEpoch:g.epoch,budgetUnits:3,expiresAt:Date.now()+300000});
 let preChecks=0, lastRevoked;
 const guard={
   async check(input){
     const proof=await elig.check(input);
     if(input.phase==='PRE_NETWORK'&&++preChecks===1){
       lastRevoked=store.revoke({identity:k,scope:'GLOBAL',expectedEpoch:refreshed.epoch,
         actor:'fake-owner-1'});
     }
     return proof;
   }
 };
 delivery.close();
 const raceSink=new SyntheticConnectorSink();
 delivery=new MessageDelivery({databasePath:join(dir,'race-outbox.sqlite'),
   eligibility:guard,sink:raceSink,
   receiptVerifier:async()=>({verified:true,source:'SYNTHETIC_TEST_ONLY'})});
 const racing=await delivery.submitIntent({k:k25,businessMessageId:'fake-boundary-race',
   payload:{text:'must never leave fixture sink'},mode:'AUTO',
   actorId:'fake-owner-1',sessionId:'fake-session-2'});
 const raced=await delivery.dispatchOne(racing.id);
 assert.equal(raced.state,'DENIED');
 assert.equal(raceSink.calls.length,0);
 assert.equal(store.settleBoundary({identity:k,intentId:'fake-boundary-race',
   evidence:{w25IntentId:racing.id}}).state,'RELEASED');
 console.log('W24_W44_W25_REVOKE_BETWEEN_TWO_FENCES_PASS',
   JSON.stringify({state:raced.state,sinkCalls:raceSink.calls.length,
      budgetHeldAfterProvenNoSend:0,preNetworkChecks:preChecks}));
 // After the final W25 check, request a GLOBAL account revoke while its
 // synthetic sink is resolving UNKNOWN. That mutation must remain PENDING,
 // W25 may not automatically retry, and budget must remain reserved until
 // the original W25 attempt receives one verified fictional late ACK.
 store.grant({identity:k,scope:'GLOBAL',actor:'fake-owner-1',
   expectedEpoch:lastRevoked.epoch,budgetUnits:3,expiresAt:Date.now()+300000});
 let pending;
 delivery.close();
 const unknownSink=new SyntheticConnectorSink(async ()=>{
   pending=store.requestMutationFence({identity:k,scope:'GLOBAL',actor:'fake-owner-1'});
   assert.equal(pending.ok,true);
   assert.equal(store.finalizeMutationFence({identity:k,scope:'GLOBAL',
     actor:'fake-owner-1',generation:pending.generation,kind:'REVOKE_ACCOUNT',
     applyW24:()=>{throw Error('W24_CANNOT_COMMIT_WHILE_LEASED')}}).reason,
     'ACTIVE_SEND_MUST_SETTLE_FIRST');
   return {kind:'UNKNOWN'};
 });
 delivery=new MessageDelivery({databasePath:join(dir,'unknown-outbox.sqlite'),
   eligibility:elig,sink:unknownSink,
   receiptVerifier:async e=>({verified:e.signature==='fixture-signed',source:'SYNTHETIC_TEST_ONLY'})});
 const unknown=await delivery.submitIntent({k:k25,businessMessageId:'fake-unknown-final',
   payload:{text:'synthetic network uncertainty'},mode:'AUTO',
   actorId:'fake-owner-1',sessionId:'fake-session-unknown'});
 const ambiguous=await delivery.dispatchOne(unknown.id);
 assert.equal(ambiguous.state,'UNKNOWN');
 assert.equal(unknownSink.calls.length,1);
 assert.equal(store.leaseStatus(k).active,true);
 assert.equal(store.settleBoundary({identity:k,intentId:'fake-unknown-final',
   evidence:{w25IntentId:unknown.id}}).reason,'W25_RECEIPT_UNVERIFIED');
 assert.equal((await delivery.dispatchOne(unknown.id)).state,'UNKNOWN');
 assert.equal(unknownSink.calls.length,1);
 const u=delivery.getIntent(unknown.id),a=delivery.getAttempt(unknown.id);
 const late=await delivery.recordVerifiedReceipt({
   sourceEventId:'fake-late-source-1',intentId:unknown.id,attemptId:a.id,
   providerMid:'synthetic:late-ack',kind:'ACK',bindingRevision:u.k.bindingRevision,
   channel:u.k.channel,accountId:u.k.accountId,peerId:u.k.peerId,
   pageOwnerEpoch:u.authority.pageOwnerEpoch,signature:'fixture-signed'
 });
 assert.equal(late.state,'ACKED_SYNTHETIC');
 assert.equal(store.settleBoundary({identity:k,intentId:'fake-unknown-final',
   evidence:{w25IntentId:unknown.id}}).state,'COMMITTED');
 assert.equal(store.leaseStatus(k).active,false);
 assert.equal(store.inspection(k).effectiveGrant.spent,2);
 let w24Applied=false;
 const complete=store.finalizeMutationFence({identity:k,scope:'GLOBAL',
   actor:'fake-owner-1',generation:pending.generation,kind:'REVOKE_ACCOUNT',
   applyW24:()=>{
     const rec=ids.invalidateAccount(ctx,{tenant:k.tenant,account:k.account,
       channel:k.channel,expected_revision:k.binding_revision});
     w24Applied=rec.active===false;return {committed:w24Applied};
   }});
 assert.equal(complete.ok,true);
 assert.equal(w24Applied,true);
 assert.throws(()=>store.qualify(k),/ACCOUNT_OR_PEER_UNBOUND/);
 console.log('FINAL_CHECK_TO_REVOKE_UNKNOWN_LATE_ACK_NATIVE_PASS',
   JSON.stringify({w25Status:late.state,duplicateSinkCalls:unknownSink.calls.length,
     w44Spent:2,mutationDeferredThenCommitted:true,w24ReboundInvalid:true}));
} finally{
 delivery?.close();store?.close();rmSync(dir,{recursive:true,force:true});
}
