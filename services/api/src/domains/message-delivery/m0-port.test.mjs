import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageDelivery, SyntheticConnectorSink } from './index.mjs';
import { canonicalKFromM0SyntheticContact, createM0SyntheticSendPort } from './m0-port.mjs';

const contact={tenant:'SYNTHETIC_TEST_ONLY',account:'acc-A',channel:'FB_PERSONAL',
  peer_id:'fake-person-A',binding_revision:'rev-1'};
const id=[contact.tenant,contact.account,contact.channel,contact.peer_id,contact.binding_revision].join('|');
async function scenario(handler,cb) {
  const root=mkdtempSync(join(tmpdir(),'yance-w25-m0-'));
  const sink=new SyntheticConnectorSink(handler);
  const eligibility={async check({k,mode}) {
    return {allowed:true,k,accountActive:true,accountEpoch:'account-1',
      custodyEpoch:'custody-1',routeRevision:'route-1',custodyMode:mode,
      grantActive:true,agentActive:true,agentRevision:'agent-1',grantRevision:'grant-1',
      budget:{reserved:true,reservationId:'reserve-1'},expiresAt:Date.now()+60000};
  }};
  const delivery=new MessageDelivery({databasePath:join(root,'w25.sqlite'),eligibility,sink,
    receiptVerifier:()=>({verified:false})});
  try {await cb({sink,delivery,send:createM0SyntheticSendPort({delivery,contacts:[contact]})});}
  finally{delivery.close();try{rmSync(root,{recursive:true,force:true})}catch(err){
    if(!['EPERM','EBUSY'].includes(err.code))throw err;
  }}
}
test('W09 M0 fake send Port maps raw 5-part K to single native durable W25 intent',async()=>{
  await scenario(undefined,async({sink,delivery,send})=>{
    const response=await send({id,rid:'fake-M0-42',simulated:true});
    assert.equal(response.status,'ACK');
    assert.equal(response.simulated,true);
    const intent=delivery.getIntent(response.intentId);
    assert.equal(intent.k.tenantId,'SYNTHETIC_TEST_ONLY');
    assert.equal(intent.k.peerId,contact.peer_id);
    assert.equal(intent.businessMessageId,'fake-M0-42');
    assert.equal(intent.state,'ACKED_SYNTHETIC');
    assert.equal(sink.calls.length,1);
    assert.equal((await send({id,rid:'fake-M0-42',simulated:true})).status,'ACK');
    assert.equal(sink.calls.length,1,'second M0 callback cannot duplicate transport attempt');
    await assert.rejects(send({id,rid:'real-mid',simulated:true}),e=>e.code==='M0_SYNTHETIC_ONLY');
    await assert.rejects(send({id,rid:'fake-M0',simulated:false}),e=>e.code==='M0_SYNTHETIC_ONLY');
  });
});
test('M0 source maps UNKNOWN to UNKNOWN without a second send',async()=>{
  await scenario(async()=>({kind:'UNKNOWN'}),async({sink,send})=>{
    const result=await send({id,rid:'fake-unknown',simulated:true});
    assert.equal(result.status,'UNKNOWN');
    const duplicate=await send({id,rid:'fake-unknown',simulated:true});
    assert.equal(duplicate.status,'UNKNOWN');
    assert.equal(sink.calls.length,1);
  });
});
test('M0 mapping rejects real contacts, malformed K, unknown contact',async()=>{
  assert.throws(()=>canonicalKFromM0SyntheticContact({...contact,tenant:'LIVE'}),
    e=>e.code==='M0_SYNTHETIC_CONTACT_REQUIRED');
  assert.throws(()=>canonicalKFromM0SyntheticContact({...contact,peer_id:'injected|peer'}),
    e=>e.code==='M0_SYNTHETIC_CONTACT_REQUIRED');
  await scenario(undefined,async({send})=>{
    await assert.rejects(send({id:id.replace('fake-person-A','fake-other'),rid:'fake-M0',simulated:true}),
      e=>e.code==='UNKNOWN_M0_K');
  });
});
