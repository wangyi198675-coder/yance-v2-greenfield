import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MessageDelivery,SyntheticConnectorSink} from './index.mjs';

const k={tenantId:'tenant-boundary',accountId:'account-boundary',channel:'FB_PERSONAL',
  peerId:'peer-A',bindingRevision:'1'};
function baseProof(mode){
  return {allowed:true,k,accountActive:true,accountEpoch:'1',custodyEpoch:'1',
    custodyMode:mode,routeRevision:'route-1',agentActive:true,agentRevision:'1',
    grantActive:true,grantRevision:'1',
    budget:{reserved:true,reservationId:'budget-1'},expiresAt:Date.now()+60000};
}
async function runFixture(fn) {
  const dir=mkdtempSync(join(tmpdir(),'w25-new-boundary-'));
  let delivery;
  try {
    const phases=[];
    let mutate=()=>{};
    const sink=new SyntheticConnectorSink();
    const eligibility={async check({mode,phase}) {
      phases.push(phase);
      mutate(phases.length);
      return baseProof(mode);
    }};
    delivery=new MessageDelivery({databasePath:join(dir,'outbox.sqlite'),eligibility,sink,
      receiptVerifier:async()=>({verified:true,source:'signed-fixture'})});
    await fn({delivery,phases,sink,setMutation:(fn)=>{mutate=fn;}});
  } finally {
    delivery?.close();
    rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:50});
  }
}

test('final POST-ARM fence detects revocation and records definitely-not-sent attempt',async()=>{
  await runFixture(async({delivery,phases,sink,setMutation})=>{
    const i=await delivery.submitIntent({k,businessMessageId:'fake-after-arm',
      payload:{text:'synthetic'},mode:'AUTO',actorId:'actor-A',sessionId:'session-A'});
    let count=0;
    setMutation((phaseCall)=>{ if(phaseCall===3){count++;}});
    // Emulate W44 revocation after the first PRE_NETWORK read, before final boundary.
    const original=delivery.eligibility.check;
    delivery.eligibility.check=async (args)=>{
      const proof=await original(args);
      if(args.phase==='PRE_NETWORK' && phases.length===3)
        return {...proof,grantActive:false};
      return proof;
    };
    const result=await delivery.dispatchOne(i.id);
    assert.equal(result.state,'DENIED');
    assert.equal(result.denialCode,'AUTO_GRANT_INVALID');
    assert.equal(count,1);
    assert.equal(sink.calls.length,0,'no synthetic send after late revoke');
    assert.equal(delivery.getIntent(i.id).state,'DENIED');
    assert.equal(delivery.getAttempt(i.id).state,'NOT_SENT_AUTHORITY_DENIED');
    assert.equal(delivery.getAttempt(i.id).error_code,'AUTO_GRANT_INVALID');
    assert.deepEqual(phases,['ADMISSION','PRE_NETWORK','PRE_NETWORK']);
    assert.equal(delivery.getAudit(i.id).at(-1).event_type,'FINAL_BOUNDARY_DENIED_NO_SEND');
    assert.equal((await delivery.dispatchOne(i.id)).dispatched,false);
  });
});

test('late recheck allows unchanged valid proof once, returns synthetic ACK',async()=>{
  await runFixture(async({delivery,phases,sink})=>{
    const i=await delivery.submitIntent({k,businessMessageId:'fake-no-change',
      payload:{text:'synthetic'},mode:'AUTO',actorId:'actor-B',sessionId:'session-B'});
    assert.equal((await delivery.dispatchOne(i.id)).state,'ACKED_SYNTHETIC');
    assert.deepEqual(phases,['ADMISSION','PRE_NETWORK','PRE_NETWORK']);
    assert.equal(sink.calls.length,1);
  });
});

test('receipt sourceEventId replays reject changed event type even for same intent/attempt',async()=>{
  await runFixture(async({delivery})=>{
    const i=await delivery.submitIntent({k,businessMessageId:'fake-receipt-swap',
      payload:{text:'synthetic'},mode:'AUTO',actorId:'actor-C',sessionId:'session-C'});
    const ack=await delivery.dispatchOne(i.id);
    const event={intentId:i.id,attemptId:ack.attemptId,sourceEventId:'evt-A',
      kind:'ACK',providerMid:ack.providerMid,bindingRevision:'1',
      channel:k.channel,accountId:k.accountId,peerId:k.peerId};
    assert.equal((await delivery.recordVerifiedReceipt(event)).duplicate,false);
    await assert.rejects(delivery.recordVerifiedReceipt({...event,kind:'READ'}),
      err=>err.code==='RECEIPT_REPLAY_CONFLICT');
    assert.equal(delivery.listReceipts(i.id).length,1);
  });
});
