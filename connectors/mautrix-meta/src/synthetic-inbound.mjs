/**
 * YANCE V2 W26: OFFLINE SYNTHETIC Messenger Personal -> canonical K bridge.
 * No mautrix SDK is launched; no credentials, login, network, send queue or sender.
 * Transport/protocol contract ONLY. Parent authority: W24 IdentityConsent.
 * Outbound authority: W25 MessageDelivery, which is deliberately absent here.
 */
const REQUIRED_K = ['tenant', 'account', 'channel', 'peer_id', 'binding_revision'];
const CONNECTION_STATES = new Set(['ONLINE', 'OFFLINE', 'REVOKED']);
const EXTERNAL_KEY_FIELDS = ['bridge_instance_id', 'remote_account_id', 'remote_thread_id'];
const VALID_KINDS = new Set(['MESSAGE', 'ECHO', 'BACKFILL']);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function fixtureString(value, label) {
  assert(typeof value === 'string' && /^fake-[a-zA-Z0-9_.-]+$/.test(value), 'SYNTHETIC_ONLY_' + label);
  return value;
}
function keyPart(value, field) {
  assert(typeof value === 'string' || typeof value === 'number', 'MISSING_K_' + field);
  const x = String(value);
  assert(x && !x.includes('|'), 'BAD_K_' + field);
  return x;
}
function exactSynthetic(payload) {
  assert(payload && typeof payload === 'object' && payload.simulated === true, 'SYNTHETIC_FLAG_REQUIRED');
  assert(!('credentials' in payload) && !('cookie' in payload) && !('access_token' in payload), 'CREDENTIAL_FIELD_FORBIDDEN');
}
function remoteKey(x) {
  return EXTERNAL_KEY_FIELDS.map(field => fixtureString(x[field], field)).join('|');
}
function accountKey(x) {
  return [fixtureString(x.bridge_instance_id, 'bridge_instance_id'),
    fixtureString(x.remote_account_id, 'remote_account_id'),
    keyPart(x.binding_revision, 'binding_revision')].join('|');
}
export function canonicalK(identity) {
  for (const field of REQUIRED_K) assert(identity?.[field] !== undefined && identity?.[field] !== null, 'MISSING_K_' + field);
  assert(identity.tenant === 'SYNTHETIC_TEST_ONLY', 'REAL_TENANT_FORBIDDEN');
  assert(identity.channel === 'FB_PERSONAL', 'WRONG_CHANNEL');
  assert(Number.isSafeInteger(identity.binding_revision) && identity.binding_revision >= 1, 'BAD_BINDING_REVISION');
  return REQUIRED_K.map(field => keyPart(identity[field], field)).join('|');
}
function evidenceId(event) {
  // A Meta-origin ID and a Matrix event ID are separate evidence namespaces.
  return event.provider_mid ? ['META_MID_SYNTHETIC', fixtureString(event.provider_mid, 'provider_mid')]
    : ['MATRIX_EVENT_SYNTHETIC', fixtureString(event.matrix_event_id, 'matrix_event_id')];
}

/**
 * Bindings originate from a future authoritative W24 identity service, never
 * from an inbound event. Here each binding must be explicitly synthetic.
 * onInbound receives an M0-compatible {id,mid,original} plus provenance.
 */
export function createSyntheticInboundAdapter({ bindings, onInbound }) {
  assert(Array.isArray(bindings) && bindings.length > 0, 'BINDINGS_REQUIRED');
  assert(typeof onInbound === 'function', 'INBOUND_PORT_REQUIRED');
  const routes = new Map(), accounts = new Map(), peerKeys = new Set();
  for (const binding of bindings) {
    exactSynthetic(binding);
    const id = canonicalK(binding);
    assert(!peerKeys.has(id), 'DUPLICATE_CANONICAL_K');
    peerKeys.add(id);
    const remote = remoteKey(binding);
    assert(!routes.has(remote), 'AMBIGUOUS_REMOTE_IDENTITY');
    const akey = accountKey(binding);
    const previous = accounts.get(akey);
    if (!previous) accounts.set(akey, { status: 'OFFLINE', epoch: 0, revoked: false });
    // Never use the remote event itself to infer a new canonical contact.
    routes.set(remote, Object.freeze({
      id,
      k: Object.freeze(Object.fromEntries(REQUIRED_K.map(k => [k, binding[k]]))),
      bridge_instance_id: binding.bridge_instance_id,
      remote_account_id: binding.remote_account_id,
      remote_thread_id: binding.remote_thread_id,
      account_state_key: akey,
    }));
  }
  const seen = new Map();
  const pending = new Map();
  return Object.freeze({
    observeConnection(observation) {
      exactSynthetic(observation);
      fixtureString(observation.bridge_instance_id, 'bridge_instance_id');
      fixtureString(observation.remote_account_id, 'remote_account_id');
      assert(Number.isSafeInteger(observation.binding_revision) && observation.binding_revision > 0, 'BAD_BINDING_REVISION');
      assert(Number.isSafeInteger(observation.connection_epoch) && observation.connection_epoch > 0, 'BAD_CONNECTION_EPOCH');
      assert(CONNECTION_STATES.has(observation.state), 'BAD_CONNECTION_STATE');
      const akey = accountKey(observation);
      const state = accounts.get(akey);
      assert(state, 'UNKNOWN_ACCOUNT_BINDING');
      assert(!state.revoked, 'ACCOUNT_REVOKED');
      assert(observation.connection_epoch >= state.epoch, 'STALE_CONNECTION_EPOCH');
      assert(observation.connection_epoch !== state.epoch || observation.state === state.status, 'CONFLICTING_CONNECTION_STATE');
      state.epoch = observation.connection_epoch;
      state.status = observation.state;
      if (observation.state === 'REVOKED') state.revoked = true;
      return Object.freeze({ status: state.status, connection_epoch: state.epoch, simulated: true });
    },
    status(binding) {
      const id = canonicalK(binding);
      assert(peerKeys.has(id), 'UNKNOWN_CANONICAL_K');
      const route = [...routes.values()].find(r => r.id === id);
      const state = accounts.get(route.account_state_key);
      return Object.freeze({ state: state.status, connection_epoch: state.epoch, simulated: true });
    },
    async receive(event) {
      exactSynthetic(event);
      assert(event.source === 'mautrix-meta' && event.channel === 'FB_PERSONAL', 'WRONG_TRANSPORT_SOURCE');
      const route = routes.get(remoteKey(event));
      assert(route, 'UNKNOWN_REMOTE_IDENTITY');
      const state = accounts.get(route.account_state_key);
      assert(state && !state.revoked, 'ACCOUNT_REVOKED');
      assert(Number.isSafeInteger(event.connection_epoch) && event.connection_epoch === state.epoch, 'STALE_OR_WRONG_CONNECTION_EPOCH');
      assert(VALID_KINDS.has(event.kind), 'UNSUPPORTED_EVENT_KIND');
      fixtureString(event.matrix_event_id, 'matrix_event_id');
      if (event.provider_mid !== null && event.provider_mid !== undefined) fixtureString(event.provider_mid, 'provider_mid');
      assert(typeof event.original === 'string' && event.original.length <= 8192, 'BAD_ORIGINAL_TEXT');
      if (state.status !== 'ONLINE') return { accepted: false, reason: 'OFFLINE_NO_SHADOW_QUEUE', simulated: true };
      if (event.kind !== 'MESSAGE') return { accepted: false, reason: event.kind + '_NOT_NEW_INBOUND', simulated: true };
      const [namespace, mid] = evidenceId(event);
      const idempotency = [route.id, namespace, mid].join('|');
      const previous = seen.get(idempotency);
      if (previous) {
        assert(previous.original === event.original, 'SOURCE_MID_PAYLOAD_CONFLICT');
        return { accepted: false, duplicate: true, reason: 'DUPLICATE_SOURCE_MID', simulated: true };
      }
      const outstanding = pending.get(idempotency);
      if (outstanding) {
        assert(outstanding.original === event.original, 'SOURCE_MID_PAYLOAD_CONFLICT');
        return outstanding.operation;
      }
      const normalized = Object.freeze({
        id: route.id, k: route.k, mid, original: event.original,
        source_mid_namespace: namespace,
        source_matrix_event_id: event.matrix_event_id,
        source_provider_mid: event.provider_mid ?? null,
        bridge_instance_id: route.bridge_instance_id,
        evidence: 'SYNTHETIC_BRIDGE_EVENT_NOT_META_ACK',
        receipt_status: 'NOT_REQUESTED',
        simulated: true,
      });
      const operation = (async () => {
        // In-memory dedup is a local test aid, not durable W25 idempotency.
        await onInbound(normalized);
        seen.set(idempotency, { original: event.original });
        return { accepted: true, duplicate: false, normalized, simulated: true };
      })();
      pending.set(idempotency, { original: event.original, operation });
      try { return await operation; }
      finally { pending.delete(idempotency); }
    },
  });
}

/**
 * Read-only classification for externally supplied FAKE receipt evidence.
 * No send attempt, Meta ACK verification or state mutation occurs here.
 */
export function classifySyntheticReceipt(receipt) {
  exactSynthetic(receipt);
  assert(receipt.source === 'mautrix-meta', 'WRONG_TRANSPORT_SOURCE');
  fixtureString(receipt.matrix_event_id, 'matrix_event_id');
  assert(['BRIDGE_ACCEPTED', 'MOCK_ACK', 'TIMEOUT_UNKNOWN'].includes(receipt.kind), 'BAD_MOCK_RECEIPT_KIND');
  return Object.freeze({
    simulated: true,
    provider_delivery: 'UNVERIFIED',
    matrix_event_id: receipt.matrix_event_id,
    transport_observation: receipt.kind === 'TIMEOUT_UNKNOWN'
      ? 'DELIVERY_UNKNOWN' : receipt.kind === 'MOCK_ACK' ? 'MOCK_ACK_ONLY' : 'BRIDGE_ACCEPTED_UNVERIFIED',
    meta_mid: null,
    sends_performed: 0,
  });
}
