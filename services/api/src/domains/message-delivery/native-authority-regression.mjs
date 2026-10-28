// W25 only: exercise actual already-committed W24 and W44 native source via their own absolute file paths.
// Usage: node native-authority-regression.mjs PATH_TO_W24_IDENTITY_CONSENT.mjs PATH_TO_W44_NATIVE_BRIDGES.mjs
// Must not copy or edit another owner's source; only synthetic account + in-memory/SQLite fixture.
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {MessageDelivery,SyntheticConnectorSink} from './index.mjs';

const [w24Path,w44BridgesPath]=process.argv.slice(2);
if(!w24Path||!w44BridgesPath)throw Error('EXPLICIT_PR32_W24_W44_NATIVE_SOURCE_PATHS_REQUIRED');
const [{IdentityConsentService},{createW24GrantAuthority,createW24IdentityPorts,createW25EligibilityPort},
       {openEligibilityStore}]=await Promise.all([
  import(pathToFileURL(w24Path).href), import(pathToFileURL(w44BridgesPath).href),
  import(new URL('./index.mjs',pathToFileURL(w44BridgesPath)).href) // resolved below by explicit derived sibling path
]);
const dir=mkdtempSync(join(tmpdir(),'w25-actual-native-fence-'));
const key={tenant:'SYNTHETIC_TEST_ONLY',account:'fixture-W25',channel:'FB_PERSONAL',
  peer_id:'fake-peer-A',binding_revision:1};
const k25={tenantId:key.tenant,accountId:key.account,channel:key.channel,
  peerId:key.peer_id,bindingRevision:'1'};
const ctx={tenant:key.tenant,principal_id:'fake-owner-W25',input_domain:'CONTACT'};
let store,delivery;
let checks=0;
let revokeOnFinal=true;
let route={ready:true,revision:'fake-route-v1'};
const agent=()=>({active:true,revision:'fake-agent-v1'});
const grantAuthority=createW24GrantAuthority({getStore:()=>store,readAgentState:agent});
const identity=new IdentityConsentService({grantAuthority});
const sink=new SyntheticConnectorSink();
try{
  identity.registerAccount(ctx,{tenant:key.tenant,account:key.account,channel:key.channel,
    principal_id:ctx.principal_id,binding_revision:1});
  identity.bindPeer(ctx,key);
  const ports=createW24IdentityPorts({identityService:identity,trustedContext:ctx,
    readConsentEpoch:()=>1,authorizeOperator:({actor})=>actor===ctx.principal_id});
  store=openEligibilityStore({path:join(dir,'grant.sqlite'),...ports});
  store.grant({identity:key,scope:'GLOBAL',actor:ctx.principal_id,budgetUnits:1,
    expiresAt:Date.now()+300000});
  const realPort=createW25EligibilityPort({store,identityService:identity,trustedContext:ctx,
    readAgentState:agent,readRouteState:()=>route});
  const wrappedPort={async check(request){
    checks++;
    if(revokeOnFinal&&request.phase==='PRE_NETWORK'&&checks===3){
      store.revoke({identity:key,scope:'GLOBAL',expectedEpoch:1,actor:ctx.principal_id});
    }
    return realPort.check(request);
  }};
  delivery=new MessageDelivery({databasePath:join(dir,'outbox.sqlite'),eligibility:wrappedPort,
    sink,receiptVerifier:async()=>({verified:false})});
  const i=await delivery.submitIntent({k:k25,businessMessageId:'fake-w25-revoke-between-checks',
    payload:{text:'should-not-leave'},mode:'AUTO',actorId:ctx.principal_id,sessionId:'fake-W25'});
  assert.equal(i.state,'QUEUED');
  const noSend=await delivery.dispatchOne(i.id);
  assert.equal(noSend.state,'DENIED');
  assert.equal(sink.calls.length,0,'W25 final fence must see real W44 grant revoke');
  assert.equal(delivery.getAttempt(i.id).state,'NOT_SENT_AUTHORITY_DENIED');
  assert.equal(delivery.getAudit(i.id).at(-1).event_type,'FINAL_BOUNDARY_DENIED_NO_SEND');
  assert.equal(checks,3);
  console.log('W24_W44_W25_LATE_REVOKE_FENCE_PASS',JSON.stringify({checks,denial:noSend.denialCode,
    syntheticSinkCalls:sink.calls.length,attempt:delivery.getAttempt(i.id).state}));

  // Prove W44's existing global budget store rejects the next admission, with no second sender.
  revokeOnFinal=false;
  await assert.rejects(delivery.submitIntent({k:k25,businessMessageId:'fake-w25-revoked-new',
    payload:{text:'still-denied'},mode:'AUTO',actorId:ctx.principal_id,sessionId:'fake-W25'}));
  assert.equal(sink.calls.length,0);
  console.log('W44_REVOKED_BUDGET_GATE_STILL_ENFORCED_PASS');
}finally{
  delivery?.close();store?.close();
  rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
