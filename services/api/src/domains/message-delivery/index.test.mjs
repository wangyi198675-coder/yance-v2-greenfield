import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageDelivery, SyntheticConnectorSink, DeliveryError } from './index.mjs';

const baseK = Object.freeze({
  tenantId: 'tenant-S', accountId: 'account-S', channel: 'FB_PERSONAL',
  peerId: 'peer-A', bindingRevision: 'binding-1'
});
function intent(id = 'business-1', k = baseK, text = 'Cześć') {
  return { k, businessMessageId: id, payload: { text },
    mode: 'AUTO', actorId: 'agent-A', sessionId: 'session-A', requestId: 'request-1' };
}
function authority({ k, mode }, state) {
  return {
    allowed: state.allowed, reason: state.reason, k: structuredClone(state.overrideK || k),
    custodyEpoch: state.custodyEpoch, accountEpoch: state.accountEpoch,
    routeRevision: state.routeRevision, custodyMode: mode,
    accountActive: state.accountActive, agentActive: state.agentActive,
    grantRevision: state.grantRevision, grantActive: state.grantActive,
    humanAuthorized: state.humanAuthorized, agentRevision: state.agentRevision,
    budget: { reserved: state.budgetReserved, reservationId: state.budgetReservationId },
    expiresAt: state.expiresAt,
    pageOwnerEpoch: state.pageOwnerEpoch, pageSendOwner: state.pageSendOwner,
    pageRouteReady: state.pageRouteReady
  };
}
function fixture(options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'yance-w25-'));
  const databasePath = join(directory, 'delivery.sqlite');
  const state = {
    allowed: true, custodyEpoch: 'custody-1', accountEpoch: 'account-1',
    routeRevision: 'route-1', accountActive: true, agentActive: true,
    grantRevision: 'grant-1', agentRevision: 'agent-1', grantActive: true,
    humanAuthorized: true, budgetReserved: true, budgetReservationId: 'budget-1',
    expiresAt: Date.now() + 50000, pageOwnerEpoch: 'page-owner-1',
    pageSendOwner: 'PANCAKE', pageRouteReady: true, ...options
  };
  const phases = [];
  const eligibility = { async check(input) {
    phases.push(input.phase);
    return authority(input, state);
  }};
  const sink = new SyntheticConnectorSink(options.handler);
  const receiptVerifier = async (event) =>
    event.signature === 'fixture-signed' ? { verified: true, source: 'fixture-signed-source' } :
      { verified: false };
  const instances = [];
  const create = (overrides = {}) => {
    const svc = new MessageDelivery({
      databasePath, eligibility, sink, receiptVerifier, ...overrides
    });
    instances.push(svc);
    return svc;
  };
  return {
    create, state, sink, phases, databasePath,
    close() { for (const instance of instances) instance.close(); rmSync(directory, { recursive: true, force: true }); }
  };
}
async function withFixture(action, options = {}) {
  const f = fixture(options);
  try { await action(f); } finally { f.close(); }
}
function eventFor(svc, id, overrides = {}) {
  const i = svc.getIntent(id), a = svc.getAttempt(id);
  return {
    sourceEventId: 'event-1', intentId: id, attemptId: a.id,
    providerMid: a.provider_mid || 'synthetic:late', kind: 'ACK',
    bindingRevision: i.k.bindingRevision, channel: i.k.channel,
    accountId: i.k.accountId, peerId: i.k.peerId,
    pageOwnerEpoch: i.authority.pageOwnerEpoch,
    signature: 'fixture-signed', ...overrides
  };
}

test('refuses missing authority, real transport and unverified receipts', async () => {
  assert.throws(() => new MessageDelivery({databasePath:'x',sink:new SyntheticConnectorSink()}),
    (e) => e.code === 'AUTHORITY_PORT_REQUIRED');
  const f = fixture();
  try {
    assert.throws(() => new MessageDelivery({
      databasePath:f.databasePath,eligibility:{check:async()=>({})},
      sink:{send:async()=>({kind:'ACK'})},receiptVerifier:async()=>true
    }), (e) => e.code === 'SYNTHETIC_SINK_ONLY');
    const svc=f.create();
    const row=await svc.submitIntent(intent());
    const result=await svc.dispatchOne(row.id);
    assert.equal(result.state,'ACKED_SYNTHETIC');
    await assert.rejects(svc.recordVerifiedReceipt(eventFor(svc,row.id,{signature:'untrusted'})),
      (e) => e.code === 'RECEIPT_UNVERIFIED');
  } finally { f.close(); }
});

test('durable across distinct connections; actor/session/request-id cannot double-send', async () => {
  await withFixture(async (f) => {
    const a=f.create(), b=f.create();
    const [i,j] = await Promise.all([
      a.submitIntent(intent()),
      b.submitIntent({...intent(),actorId:'other-actor',sessionId:'other-session',requestId:'request-999'})
    ]);
    assert.equal(i.id,j.id);
    assert.equal(Number(i.reused)+Number(j.reused),1);
    const results=await Promise.all([a.dispatchOne(i.id),b.dispatchOne(j.id)]);
    assert.equal(results.filter((r)=>r.dispatched).length,1);
    assert.equal(f.sink.calls.length,1);
    assert.equal(b.getIntent(i.id).state,'ACKED_SYNTHETIC');
    assert.equal(a.getAttempt(i.id).id,b.getAttempt(i.id).id);
    assert.ok(a.getAudit(i.id).some((e)=>e.event_type==='DEDUPLICATED'));
  });
});

test('same business id with different payload or rebind is rejected, distinct business id allowed', async () => {
  await withFixture(async(f)=>{
    const s=f.create();
    await s.submitIntent(intent());
    await assert.rejects(s.submitIntent(intent('business-1',baseK,'changed')), (e)=>e.code==='BUSINESS_ID_CONFLICT');
    const rebound={...baseK,bindingRevision:'binding-2'};
    await assert.rejects(s.submitIntent(intent('business-1',rebound)), (e)=>e.code==='BUSINESS_ID_CONFLICT');
    const j=await s.submitIntent(intent('business-2'));
    assert.notEqual(j.id,(await s.submitIntent(intent())).id);
  });
});

test('full canonical K enforces tenant and account isolation, rejects malformed K', async () => {
  await withFixture(async(f)=>{
    const s=f.create();
    const i=await s.submitIntent(intent('same-id'));
    const j=await s.submitIntent(intent('same-id',{...baseK,accountId:'account-B'}));
    const k=await s.submitIntent(intent('same-id',{...baseK,tenantId:'tenant-B'}));
    assert.equal(new Set([i.id,j.id,k.id]).size,3);
    await assert.rejects(s.submitIntent(intent('bad',{...baseK,channel:'WHATSAPP_BOT'})),
      (e)=>e.code==='INVALID_CANONICAL_K');
  });
});

test('both admission and pre-network revalidation; revoke refuses attempt', async () => {
  await withFixture(async(f)=>{
    const s=f.create();
    const i=await s.submitIntent(intent());
    f.state.grantActive=false;
    const r=await s.dispatchOne(i.id);
    assert.equal(r.state,'DENIED');
    assert.equal(r.denialCode,'AUTO_GRANT_INVALID');
    assert.equal(s.getAttempt(i.id),null);
    assert.equal(f.sink.calls.length,0);
    assert.deepEqual(f.phases,['ADMISSION','PRE_NETWORK']); // first fence denies, so no attempt or second fence
  });
});

for (const [condition,mutation,reason] of [
  ['budget exhausted',(s)=>{s.budgetReserved=false;},'BUDGET_NOT_RESERVED'],
  ['agent disabled',(s)=>{s.agentActive=false;},'AUTO_GRANT_INVALID'],
  ['grant revision revoked',(s)=>{s.grantRevision='grant-2';},'AUTHORITY_REVISION_STALE'],
  ['custody takeover',(s)=>{s.custodyEpoch='human-2';},'AUTHORITY_REVISION_STALE'],
  ['account rebound',(s)=>{s.overrideK={...baseK,bindingRevision:'new-binding'};},'BINDING_STALE'],
  ['account disabled',(s)=>{s.accountActive=false;},'ACCOUNT_INACTIVE'],
  ['expires just before send',(s)=>{s.expiresAt=Date.now()-1;},'AUTHORITY_EXPIRED']
]) {
  test('pre-network fence: '+condition, async()=>{
    await withFixture(async(f)=>{
      const s=f.create(), i=await s.submitIntent(intent());
      mutation(f.state);
      const r=await s.dispatchOne(i.id);
      assert.equal(r.state,'DENIED');
      assert.equal(r.denialCode,reason);
      assert.equal(f.sink.calls.length,0);
    });
  });
}

test('A slow send does not block B/C; same peer cannot dispatch twice in parallel', async()=>{
  let resolveA, enteredA;
  const aStarted = new Promise((resolve)=>{enteredA=resolve;});
  const waitA = new Promise((resolve)=>{resolveA=resolve;});
  await withFixture(async(f)=>{
    const s=f.create(),worker=f.create();
    f.sink.handler=async ({k,attemptId})=>{
      if(k.peerId==='peer-A'){enteredA();await waitA;}
      return {kind:'ACK',providerMid:'synthetic:'+attemptId};
    };
    const a=await s.submitIntent(intent('a'));
    const a2=await s.submitIntent(intent('a2'));
    const b=await s.submitIntent(intent('b',{...baseK,peerId:'peer-B'}));
    const c=await s.submitIntent(intent('c',{...baseK,peerId:'peer-C'}));
    const slow=s.dispatchOne(a.id);
    await aStarted;
    const busy=await worker.dispatchOne(a2.id);
    assert.equal(busy.state,'RECIPIENT_BUSY');
    const [rb,rc]=await Promise.all([worker.dispatchOne(b.id),s.dispatchOne(c.id)]);
    assert.equal(rb.state,'ACKED_SYNTHETIC');
    assert.equal(rc.state,'ACKED_SYNTHETIC');
    assert.equal(s.getIntent(a.id).state,'IN_FLIGHT');
    resolveA();
    assert.equal((await slow).state,'ACKED_SYNTHETIC');
    assert.equal((await worker.dispatchOne(a2.id)).state,'ACKED_SYNTHETIC');
    assert.equal(f.sink.calls.length,4);
  });
});

test('UNKNOWN freezes peer while unrelated B can proceed; late verified ACK recovers',async()=>{
  await withFixture(async(f)=>{
    const s=f.create();
    f.sink.handler=async ({k,attemptId})=>
      k.peerId==='peer-A' ? {kind:'UNKNOWN'} : {kind:'ACK',providerMid:'synthetic:'+attemptId};
    const a=await s.submitIntent(intent('a'));
    const a2=await s.submitIntent(intent('a2'));
    const b=await s.submitIntent(intent('b',{...baseK,peerId:'peer-B'}));
    assert.equal((await s.dispatchOne(a.id)).state,'UNKNOWN');
    assert.equal((await s.dispatchOne(a2.id)).state,'RECIPIENT_UNKNOWN_HOLD');
    assert.equal((await s.dispatchOne(b.id)).state,'ACKED_SYNTHETIC');
    const event=eventFor(s,a.id);
    await assert.rejects(s.recordVerifiedReceipt({...event,peerId:'other-peer'}),(e)=>e.code==='RECEIPT_IDENTITY_MISMATCH');
    const recovered=await s.recordVerifiedReceipt(event);
    assert.equal(recovered.state,'ACKED_SYNTHETIC');
    assert.equal((await s.recordVerifiedReceipt(event)).duplicate,true);
    assert.equal((await s.dispatchOne(a2.id)).state,'UNKNOWN'); // distinct new message, sink still unknown
    assert.equal(f.sink.calls.length,3);
  });
});

test('Page sender fence and route qualification fail closed at pre-network',async()=>{
  await withFixture(async(f)=>{
    const s=f.create(),pageK={...baseK,channel:'FB_PAGE'};
    const i=await s.submitIntent(intent('page-one',pageK));
    f.state.pageOwnerEpoch='page-owner-2';
    const result=await s.dispatchOne(i.id);
    assert.equal(result.state,'DENIED');
    assert.equal(result.denialCode,'AUTHORITY_REVISION_STALE');
    assert.equal(f.sink.calls.length,0);
  });
});

test('crash recovery refuses ambiguous re-send after network boundary',async()=>{
  await withFixture(async(f)=>{
    const s=f.create(),i=await s.submitIntent(intent('crash-one'));
    const t=Date.now()-120000, attemptId='synth-crash-attempt';
    s.db.prepare('INSERT INTO outbox_attempts(id,intent_id,peer_key,recipient_fence,binding_revision,page_owner_epoch,state,network_boundary_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(attemptId,i.id,'fixture-peer',1,i.k.bindingRevision,null,'IN_FLIGHT',t,t,t);
    s.db.prepare("UPDATE send_intents SET state='IN_FLIGHT' WHERE id=?").run(i.id);
    assert.deepEqual(f.create().recoverInterrupted({olderThanMs:180000}),{unknown:0,safeRequeued:0}); // not stale enough to reclaim
    const recovered=f.create().recoverInterrupted({olderThanMs:60000});
    assert.deepEqual(recovered,{unknown:1,safeRequeued:0});
    assert.equal(s.getIntent(i.id).state,'UNKNOWN');
    assert.equal((await s.dispatchOne(i.id)).dispatched,false);
    assert.equal(f.sink.calls.length,0);
  });
});

test('replayed event IDs must not migrate across intents',async()=>{
  await withFixture(async(f)=>{
    const s=f.create();
    const a=await s.submitIntent(intent('message-a'));
    const b=await s.submitIntent(intent('message-b'));
    await s.dispatchOne(a.id);await s.dispatchOne(b.id);
    await s.recordVerifiedReceipt(eventFor(s,a.id));
    await assert.rejects(s.recordVerifiedReceipt(eventFor(s,b.id)),
      (e)=>e.code==='RECEIPT_REPLAY_CONFLICT');
  });
});

test('human explicit send remains valid while AUTO grant or agent is disabled', async()=>{
  await withFixture(async(f)=>{
    f.state.grantActive=false;f.state.agentActive=false;
    const s=f.create();
    const human={...intent('explicit-human'),mode:'HUMAN'};
    const entry=await s.submitIntent(human);
    assert.equal((await s.dispatchOne(entry.id)).state,'ACKED_SYNTHETIC');
    assert.equal(f.sink.calls.length,1);
    f.state.humanAuthorized=false;
    await assert.rejects(s.submitIntent({...human,businessMessageId:'human-unapproved'}),
      (e)=>e.code==='HUMAN_AUTH_REQUIRED');
  });
});

test('Page ACK with superseded sender owner epoch cannot enter current receipt projection', async()=>{
  await withFixture(async(f)=>{
    const s=f.create();
    const row=await s.submitIntent(intent('page-epoch-ack',{...baseK,channel:'FB_PAGE'}));
    await s.dispatchOne(row.id);
    await assert.rejects(s.recordVerifiedReceipt(eventFor(s,row.id,{
      pageOwnerEpoch:'superseded-owner-epoch'
    })),(e)=>e.code==='RECEIPT_IDENTITY_MISMATCH');
    assert.equal(s.listReceipts(row.id).length,0);
  });
});
