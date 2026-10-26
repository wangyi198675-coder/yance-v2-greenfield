import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyntheticInboundAdapter, canonicalK, classifySyntheticReceipt } from '../src/synthetic-inbound.mjs';

const k0 = { tenant: 'SYNTHETIC_TEST_ONLY', account: 'fixture-account-1',
  channel: 'FB_PERSONAL', peer_id: 'fake-peer-001', binding_revision: 1 };
const k1 = { ...k0, peer_id: 'fake-peer-002' };
const other = { ...k0, account: 'fixture-account-2', peer_id: 'fake-peer-003' };
const first = { ...k0, simulated: true, bridge_instance_id: 'fake-bridge-1',
  remote_account_id: 'fake-facebook-account-1', remote_thread_id: 'fake-thread-a' };
const second = { ...k1, simulated: true, bridge_instance_id: 'fake-bridge-1',
  remote_account_id: 'fake-facebook-account-1', remote_thread_id: 'fake-thread-b' };
const third = { ...other, simulated: true, bridge_instance_id: 'fake-bridge-2',
  remote_account_id: 'fake-facebook-account-2', remote_thread_id: 'fake-thread-c' };
function event(overrides={}) {
  return { simulated: true, source: 'mautrix-meta', channel: 'FB_PERSONAL',
    bridge_instance_id: first.bridge_instance_id, remote_account_id: first.remote_account_id,
    remote_thread_id: first.remote_thread_id, connection_epoch: 1,
    matrix_event_id: 'fake-matrix-event-001', provider_mid: 'fake-meta-mid-001',
    kind: 'MESSAGE', original: 'Cześć', ...overrides };
}
function observe(binding, state='ONLINE', connection_epoch=1) {
  return { simulated: true, bridge_instance_id: binding.bridge_instance_id,
    remote_account_id: binding.remote_account_id,
    binding_revision: binding.binding_revision, state, connection_epoch };
}
function setup(opts={}) {
  const deliveries = [];
  const adapter = createSyntheticInboundAdapter({
    bindings: opts.bindings ?? [first, second, third],
    onInbound: opts.onInbound ?? (async x => deliveries.push(x))
  });
  adapter.observeConnection(observe(first));
  adapter.observeConnection(observe(third));
  return { adapter, deliveries };
}

test('Issue #10 uses canonical IdentityConsent K for FB_PERSONAL, not a Matrix room ID', () => {
  assert.equal(canonicalK(k0), 'SYNTHETIC_TEST_ONLY|fixture-account-1|FB_PERSONAL|fake-peer-001|1');
  assert.throws(() => canonicalK({ ...k0, tenant: 'PRODUCTION' }), /REAL_TENANT_FORBIDDEN/);
  assert.throws(() => canonicalK({ ...k0, channel: 'FB_PAGE' }), /WRONG_CHANNEL/);
  assert.throws(() => canonicalK({ ...k0, peer_id: 'fake|unsafe' }), /BAD_K_peer_id/);
  assert.throws(() => canonicalK({ ...k0, binding_revision: 0 }), /BAD_BINDING_REVISION/);
});
test('synthetic inbound maps remote FB thread to authoritative K and preserves source MID/original', async () => {
  const { adapter, deliveries } = setup();
  const result = await adapter.receive(event());
  assert.equal(result.accepted, true);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].id, canonicalK(k0));
  assert.equal(deliveries[0].mid, 'fake-meta-mid-001');
  assert.equal(deliveries[0].source_mid_namespace, 'META_MID_SYNTHETIC');
  assert.equal(deliveries[0].source_matrix_event_id, 'fake-matrix-event-001');
  assert.equal(deliveries[0].original, 'Cześć');
  assert.equal(deliveries[0].receipt_status, 'NOT_REQUESTED');
  assert.equal(deliveries[0].evidence, 'SYNTHETIC_BRIDGE_EVENT_NOT_META_ACK');
});
test('M0 inbound port compatibility: id/mid/original supplied; no translation or Agno invented', async () => {
  const results = [];
  const { adapter } = setup({ onInbound: async ({ id, mid, original }) => results.push({ id, mid, original }) });
  await adapter.receive(event());
  assert.deepEqual(results, [{ id: canonicalK(k0), mid: 'fake-meta-mid-001', original: 'Cześć' }]);
});
test('Matrix event ID fallback explicitly uses a different MID namespace', async () => {
  const { adapter, deliveries } = setup();
  await adapter.receive(event({ provider_mid: null }));
  assert.equal(deliveries[0].mid, 'fake-matrix-event-001');
  assert.equal(deliveries[0].source_mid_namespace, 'MATRIX_EVENT_SYNTHETIC');
  assert.equal(deliveries[0].source_provider_mid, null);
});
test('duplicate same source MID per K is swallowed even after successful reconnect', async () => {
  const { adapter, deliveries } = setup();
  await adapter.receive(event());
  adapter.observeConnection(observe(first, 'OFFLINE', 2));
  adapter.observeConnection(observe(first, 'ONLINE', 3));
  const repeated = await adapter.receive(event({ connection_epoch: 3, matrix_event_id: 'fake-matrix-new-event' }));
  assert.equal(repeated.duplicate, true);
  assert.equal(deliveries.length, 1);
});
test('same fake Meta MID on another physical peer maps independently', async () => {
  const { adapter, deliveries } = setup();
  await adapter.receive(event());
  const e = event({ remote_thread_id: 'fake-thread-b', matrix_event_id: 'fake-matrix-other', original: 'Hej' });
  await adapter.receive(e);
  assert.deepEqual(deliveries.map(x=>x.k.peer_id), ['fake-peer-001', 'fake-peer-002']);
});
test('no provider MID collision may silently overwrite original', async () => {
  const { adapter } = setup();
  await adapter.receive(event());
  await assert.rejects(adapter.receive(event({original:'altered'})),/SOURCE_MID_PAYLOAD_CONFLICT/);
});
test('offline events never make a hidden queue or emit inbound', async () => {
  const { adapter, deliveries } = setup();
  adapter.observeConnection(observe(first,'OFFLINE',2));
  const response = await adapter.receive(event({connection_epoch:2}));
  assert.deepEqual(response, {accepted:false,reason:'OFFLINE_NO_SHADOW_QUEUE',simulated:true});
  assert.equal(deliveries.length,0);
});
test('stale connection epochs and stale observation cannot reconnect', async () => {
  const { adapter } = setup();
  adapter.observeConnection(observe(first,'OFFLINE',2));
  await assert.rejects(adapter.receive(event({connection_epoch:1})),/STALE_OR_WRONG_CONNECTION_EPOCH/);
  assert.throws(()=>adapter.observeConnection(observe(first,'ONLINE',1)),/STALE_CONNECTION_EPOCH/);
  assert.throws(()=>adapter.observeConnection(observe(first,'ONLINE',2)),/CONFLICTING_CONNECTION_STATE/);
});
test('revoked account remains revoked even with newer online observation', async () => {
  const { adapter } = setup();
  adapter.observeConnection(observe(first,'REVOKED',3));
  assert.throws(()=>adapter.observeConnection(observe(first,'ONLINE',4)),/ACCOUNT_REVOKED/);
  await assert.rejects(adapter.receive(event({connection_epoch:3})),/ACCOUNT_REVOKED/);
  assert.equal(adapter.status(k0).state,'REVOKED');
  assert.equal(adapter.status(k1).state,'REVOKED');
  assert.equal(adapter.status(other).state,'ONLINE');
});
test('backfill and echo do not turn into fresh auto-reply work', async () => {
  const { adapter, deliveries } = setup();
  const backfill = await adapter.receive(event({kind:'BACKFILL'}));
  const echo = await adapter.receive(event({kind:'ECHO'}));
  assert.equal(backfill.reason,'BACKFILL_NOT_NEW_INBOUND');
  assert.equal(echo.reason,'ECHO_NOT_NEW_INBOUND');
  assert.equal(deliveries.length,0);
});
test('unregistered account/thread, FB Page and potential real identifiers are refused', async () => {
  const { adapter } = setup();
  await assert.rejects(adapter.receive(event({remote_thread_id:'fake-unbound'})),/UNKNOWN_REMOTE_IDENTITY/);
  await assert.rejects(adapter.receive(event({channel:'FB_PAGE'})),/WRONG_TRANSPORT_SOURCE/);
  await assert.rejects(adapter.receive(event({provider_mid:'real-meta-id'})),/SYNTHETIC_ONLY_provider_mid/);
  await assert.rejects(adapter.receive(event({simulated:false})),/SYNTHETIC_FLAG_REQUIRED/);
  await assert.rejects(adapter.receive(event({cookie:'sensitive'})),/CREDENTIAL_FIELD_FORBIDDEN/);
});
test('binding collision and non-fixture/account cross-channel bindings fail closed', () => {
  assert.throws(()=>createSyntheticInboundAdapter({bindings:[first,first],onInbound:()=>{}}),/DUPLICATE_CANONICAL_K/);
  assert.throws(()=>createSyntheticInboundAdapter({bindings:[first,{...first,peer_id:'fake-peer-other'}],onInbound:()=>{}}),/AMBIGUOUS_REMOTE_IDENTITY/);
  assert.throws(()=>createSyntheticInboundAdapter({bindings:[{...first,tenant:'LIVE'}],onInbound:()=>{}}),/REAL_TENANT_FORBIDDEN/);
  assert.throws(()=>createSyntheticInboundAdapter({bindings:[{...first,channel:'FB_PAGE'}],onInbound:()=>{}}),/WRONG_CHANNEL/);
});
test('failed downstream native intake can retry; no fake ACK or early dedupe', async () => {
  let calls=0;
  const { adapter } = setup({onInbound:async()=>{ calls++;if(calls===1)throw Error('SYNTHETIC_SINK_ERROR'); }});
  await assert.rejects(adapter.receive(event()),/SYNTHETIC_SINK_ERROR/);
  const next = await adapter.receive(event());
  assert.equal(next.accepted,true);
  assert.equal(calls,2);
});
test('in-flight concurrent duplicate is a single downstream invocation', async () => {
  let calls=0;
  const {adapter}=setup({onInbound:async()=>{calls++; await new Promise(r=>setTimeout(r,15));}});
  const [a,b]=await Promise.all([adapter.receive(event()),adapter.receive(event())]);
  assert.equal(a.accepted,true);assert.equal(b.accepted,true);
  assert.equal(calls,1);
});
test('concurrent duplicate MID with altered payload is rejected before intake completes', async () => {
  const {adapter}=setup({onInbound:async()=>await new Promise(r=>setTimeout(r,15))});
  const firstRun=adapter.receive(event());
  await assert.rejects(adapter.receive(event({original:'forged concurrent text'})), /SOURCE_MID_PAYLOAD_CONFLICT/);
  assert.equal((await firstRun).accepted,true);
});
test('mock receipt only classifies evidence, never Meta delivery or a send attempt', () => {
  for (const [kind,observation] of [
    ['BRIDGE_ACCEPTED','BRIDGE_ACCEPTED_UNVERIFIED'],
    ['MOCK_ACK','MOCK_ACK_ONLY'],
    ['TIMEOUT_UNKNOWN','DELIVERY_UNKNOWN'],
  ]) {
    const classified=classifySyntheticReceipt({simulated:true,source:'mautrix-meta',matrix_event_id:'fake-matrix-1',kind});
    assert.equal(classified.transport_observation,observation);
    assert.equal(classified.meta_mid,null);
    assert.equal(classified.provider_delivery,'UNVERIFIED');
    assert.equal(classified.sends_performed,0);
  }
});
test('receipt never accepts real receipt identifiers, credentials or non-fake proof', () => {
  assert.throws(()=>classifySyntheticReceipt({source:'mautrix-meta',matrix_event_id:'fake-id',kind:'MOCK_ACK'}),/SYNTHETIC_FLAG_REQUIRED/);
  assert.throws(()=>classifySyntheticReceipt({simulated:true,source:'mautrix-meta',matrix_event_id:'actual-$id',kind:'MOCK_ACK'}),/SYNTHETIC_ONLY/);
  assert.throws(()=>classifySyntheticReceipt({simulated:true,source:'mautrix-meta',matrix_event_id:'fake-id',kind:'DELIVERED'}),/BAD_MOCK_RECEIPT_KIND/);
});
test('no sending, login or credentials API surface is exposed',()=>{
  const {adapter}=setup();
  assert.deepEqual(Object.keys(adapter).sort(),['observeConnection','receive','status']);
  assert.equal(adapter.send,undefined);
  assert.equal(adapter.login,undefined);
  assert.equal(adapter.credentials,undefined);
});
