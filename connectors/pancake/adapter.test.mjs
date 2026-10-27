import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHANNEL, ORIGIN, OWNER, fullK, requirePageBinding,
  createSyntheticPancakeInboundAdapter,
  prepareSyntheticProviderAttempt, classifySyntheticPancakeResponse,
  assessSyntheticChatwootStandby, reconcileSyntheticMetaReceipt
} from './adapter.mjs';

const identity = Object.freeze({
  tenant: 'SYNTHETIC_TEST_ONLY', account: 'fake-account-a',
  channel: CHANNEL, peer_id: 'fake-peer-a', binding_revision: 7
});
const binding = Object.freeze({
  synthetic: true, account: 'fake-account-a', peer_id: 'fake-peer-a',
  binding_revision: 7, meta_page_id: 'fake-meta-page-a',
  pancake_page_id: 'fake-pancake-page-a', source_peer_id: 'fake-psid-a'
});
const proof = Object.freeze({
  source: 'W25_SYNTHETIC_FENCE', canonical_k: fullK(identity),
  meta_page_id: binding.meta_page_id, binding_revision: 7,
  active_owner: OWNER.PANCAKE, owner_epoch: 12,
  send_intent_id: 'fake-intent-1', canonical_business_message_id: 'fake-business-msg-1',
  eligible: true, pending_unknown: false, preirreversible_revalidated: true
});
const incoming = (patch = {}) => ({
  page_id: binding.pancake_page_id, event_type: 'messaging',
  data: {
    conversation: { id: 'fake-conversation-a' },
    message: { id: 'fake-provider-mid-a', conversation_id: 'fake-conversation-a',
      page_id: binding.pancake_page_id, from: { id: binding.source_peer_id },
      message: 'SYNTHETIC hello, do not translate automatically' }
  },
  ...patch
});
const emit = (adapter, data, opts = {}) => adapter.ingest({
  identity, binding, origin: ORIGIN,
  rawBody: JSON.stringify(data), ...opts
});
const prepared = () => prepareSyntheticProviderAttempt({
  identity, binding, w25Proof: proof, provider: OWNER.PANCAKE
});
const routing = () => ({
  synthetic: true, meta_page_id: binding.meta_page_id, binding_revision: 7,
  active_owner: OWNER.PANCAKE, owner_epoch: 12,
  both_apps_authorized: true, meta_routing_verified: true,
  facebook_messenger_inbox_verified: true
});
const existing = () => ({
  synthetic: true, peer_id: identity.peer_id, exists: true,
  chatwoot_conversation_id: 'fake-chatwoot-conversation-a',
  same_meta_peer: true
});
const standby = (extra = {}) => assessSyntheticChatwootStandby({
  identity, binding, routing: routing(), pendingUnknown: false,
  explicitApproval: true, conversation: existing(), ...extra
});
const err = (fn, code) => assert.throws(fn, { code });

test('canonical full K matches M0 shape and preserves binding revision', () => {
  assert.equal(fullK(identity), 'SYNTHETIC_TEST_ONLY|fake-account-a|FB_PAGE|fake-peer-a|7');
  assert.equal(requirePageBinding(identity, binding).k, fullK(identity));
});
test('reject real tenant and wrong channel, preventing production use', () => {
  err(() => fullK({ ...identity, tenant: 'customer' }), 'REAL_TENANT_FORBIDDEN');
  err(() => fullK({ ...identity, channel: 'FB_PERSONAL' }), 'WRONG_CHANNEL');
});
test('reject real-looking account, peer, page, and invalid epochs', () => {
  err(() => fullK({ ...identity, account: '12345' }), 'REAL_OR_INVALID_ACCOUNT_FORBIDDEN');
  err(() => fullK({ ...identity, peer_id: 'real-psid' }), 'REAL_OR_INVALID_PEER_FORBIDDEN');
  err(() => fullK({ ...identity, binding_revision: 0 }), 'INVALID_BINDING_REVISION');
  err(() => requirePageBinding(identity, { ...binding, meta_page_id: '12345' }), 'REAL_OR_INVALID_META_PAGE_FORBIDDEN');
});
test('reject cross-account same peer and stale binding revision', () => {
  err(() => requirePageBinding({ ...identity, account: 'fake-account-b' }, binding), 'PAGE_BINDING_MISMATCH');
  err(() => requirePageBinding({ ...identity, binding_revision: 8 }, binding), 'PAGE_BINDING_MISMATCH');
});
test('messaging fixture normalizes K, raw original, fake provider MID, never real Meta MID', () => {
  const adapter = createSyntheticPancakeInboundAdapter();
  const out = emit(adapter, incoming());
  assert.equal(out.duplicate, false);
  assert.equal(out.kind, 'FB_PAGE_SYNTHETIC_INBOUND');
  assert.equal(out.canonical_k, fullK(identity));
  assert.equal(out.provider_message_id, 'fake-provider-mid-a');
  assert.equal(out.verified_meta_mid, null);
  assert.equal(out.translated, null);
  assert.equal(out.translation_state, 'NOT_RUN');
  assert.equal(out.receipt_state, 'UNVERIFIED_PROVIDER');
  assert.match(out.event_id, /^sha256:/);
});
test('duplicate webhook with missing request_id is idempotently ignored', () => {
  const adapter = createSyntheticPancakeInboundAdapter();
  const event = incoming();
  assert.equal(emit(adapter, event).duplicate, false);
  assert.deepEqual(emit(adapter, event), { duplicate: true, disposition: 'IGNORE_DUPLICATE' });
  assert.equal(adapter.syntheticStats().seen_events, 1);
});
test('explicit synthetic request ID prevents same event being applied twice', () => {
  const a = createSyntheticPancakeInboundAdapter();
  assert.equal(emit(a, incoming({ request_id: 'fake-webhook-1' })).duplicate, false);
  assert.equal(emit(a, incoming({ request_id: 'fake-webhook-1' })).duplicate, true);
});
test('reject unverified webhook origin, invalid JSON and oversized payload', () => {
  const a = createSyntheticPancakeInboundAdapter();
  err(() => emit(a, incoming(), { origin: 'PANCAKE_PRODUCTION' }), 'UNVERIFIED_PANCAKE_ORIGIN');
  err(() => emit(a, incoming(), { rawBody: '{' }), 'INVALID_WEBHOOK_JSON');
  err(() => emit(a, incoming(), { rawBody: ' '.repeat(65537) }), 'INVALID_WEBHOOK_BODY');
});
test('cross-page webhook is rejected before any event is applied', () => {
  const a = createSyntheticPancakeInboundAdapter();
  err(() => emit(a, incoming({ page_id: 'fake-pancake-page-b' })), 'CROSS_PAGE_WEBHOOK');
  assert.equal(a.syntheticStats().seen_events, 0);
});
test('source-peer mismatch, provider page spoof and conversation mismatch rejected', () => {
  const a = createSyntheticPancakeInboundAdapter();
  const x = incoming();
  x.data.message.from.id = 'fake-psid-other';
  err(() => emit(a, x), 'SOURCE_PEER_BINDING_MISMATCH');
  const y = incoming();
  y.data.message.page_id = 'fake-pancake-page-b';
  err(() => emit(a, y), 'MESSAGE_PAGE_OR_CONVERSATION_MISMATCH');
  const z = incoming();
  z.data.message.conversation_id = 'fake-conversation-b';
  err(() => emit(a, z), 'MESSAGE_PAGE_OR_CONVERSATION_MISMATCH');
});
test('a supplier message id remains supplier namespace, no unauthorized real MID', () => {
  const a = createSyntheticPancakeInboundAdapter();
  const x = incoming(); x.data.message.id = 'm_123456';
  err(() => emit(a, x), 'REAL_OR_INVALID_PROVIDER_MESSAGE_ID_FORBIDDEN');
});
test('conversation version ignores out-of-order updates without inventing Meta read', () => {
  const a = createSyntheticPancakeInboundAdapter();
  const v = ver => ({ page_id: binding.pancake_page_id, event_type: 'conversation',
    data: { conversation: { id: 'fake-conversation-a', version: ver,
      read_watermarks: [{ message_id: 'fake-msg-id', watermark: 100 }] } } });
  assert.equal(emit(a, v(10)).verified_meta_read, false);
  assert.equal(emit(a, v(9)).disposition, 'STALE_CONVERSATION_VERSION');
  assert.equal(emit(a, v(10)).duplicate, true);
  assert.equal(emit(a, v(11)).version, 11);
  assert.equal(a.syntheticStats().tracked_conversations, 1);
});
test('missing conversation version fails closed', () => {
  const a = createSyntheticPancakeInboundAdapter();
  err(() => emit(a, { page_id: binding.pancake_page_id, event_type: 'conversation',
    data: { conversation: { id: 'fake-conversation-a' } } }), 'INVALID_CONVERSATION_VERSION');
});
test('connection status cannot authorize failover or send', () => {
  const a = createSyntheticPancakeInboundAdapter();
  const event = { page_id: binding.pancake_page_id, event_type: 'connect_status',
    data: { connect_status: 'disconnected' } };
  const out = emit(a, event);
  assert.equal(out.authorizes_failover, false);
  assert.equal(out.authorizes_send, false);
});
test('unknown webhook event is never treated as supported Messenger message', () => {
  const a = createSyntheticPancakeInboundAdapter();
  err(() => emit(a, incoming({ event_type: 'subscription' })), 'UNSUPPORTED_WEBHOOK_EVENT');
});
test('W25 synthetic current-owner proof prepares DTO but does not send', () => {
  const out = prepared();
  assert.equal(out.status, 'PREPARED_NOT_SUBMITTED');
  assert.equal(out.requires, 'W25_ONLY');
  assert.equal(out.provider_attempt_executed, false);
  assert.equal(out.owner_epoch, 12);
  assert.equal(out.verified_meta_mid, null);
});
test('W25 proof missing or old send owner blocked before attempted send', () => {
  err(() => prepareSyntheticProviderAttempt({ identity, binding, provider: OWNER.PANCAKE }), 'W25_FENCE_PROOF_REQUIRED');
  err(() => prepareSyntheticProviderAttempt({ identity, binding, provider: OWNER.PANCAKE,
    w25Proof: { ...proof, active_owner: OWNER.CHATWOOT } }), 'W25_FENCE_PROOF_REQUIRED');
});
test('W25 unknown, grant denied, stale binding, and pre-send check missing fail closed', () => {
  for (const delta of [{ pending_unknown: true }, { eligible: false },
    { binding_revision: 8 }, { preirreversible_revalidated: false }]) {
    err(() => prepareSyntheticProviderAttempt({ identity, binding, provider: OWNER.PANCAKE,
      w25Proof: { ...proof, ...delta } }), 'W25_FENCE_PROOF_REQUIRED');
  }
});
test('W25 owner epoch must be a positive integer', () => {
  err(() => prepareSyntheticProviderAttempt({ identity, binding, provider: OWNER.PANCAKE,
    w25Proof: { ...proof, owner_epoch: 0 } }), 'INVALID_OWNER_EPOCH');
});
test('Pancake HTTP 200 success false is never ACK, preserves machine error', () => {
  const x = classifySyntheticPancakeResponse({ prepared: prepared(), httpStatus: 200,
    body: { success: false, message_code: 'invalid_upload_fb_attachments_result' } });
  assert.equal(x.state, 'PROVIDER_REJECTED');
  assert.equal(x.message_code, 'invalid_upload_fb_attachments_result');
  assert.equal(x.verified_meta_mid, null);
});
test('Pancake HTTP200 success true remains provider-only, never Meta delivered', () => {
  const x = classifySyntheticPancakeResponse({ prepared: prepared(), httpStatus: 200,
    body: { success: true, id: 'fake-pancake-provider-msg-7' } });
  assert.equal(x.state, 'PROVIDER_ACCEPTED_META_UNVERIFIED');
  assert.equal(x.delivered, false);
  assert.equal(x.read, false);
  assert.equal(x.verified_meta_mid, null);
});
test('Pancake timeout and 429 are UNKNOWN, cannot retry via Chatwoot', () => {
  for (const args of [
    { prepared: prepared(), timeout: true },
    { prepared: prepared(), httpStatus: 429, body: { success: false } },
    { prepared: prepared(), httpStatus: 200, body: {} }
  ]) {
    const x = classifySyntheticPancakeResponse(args);
    assert.equal(x.state, 'DELIVERY_UNKNOWN');
    assert.equal(x.may_retry_via_chatwoot, false);
  }
});
test('Chatwoot existing conversation healthy proof only proposes W25 CAS', () => {
  const x = standby();
  assert.equal(x.ready_for_w25_cas_only, true);
  assert.equal(x.proposed_owner, OWNER.CHATWOOT);
  assert.equal(x.prior_owner_epoch, 12);
  assert.equal(x.switched, false);
  assert.equal(x.sent, false);
});
test('Chatwoot existing conversation cannot be inferred from wrong peer', () => {
  const x = standby({ conversation: { ...existing(), peer_id: 'fake-peer-b' } });
  assert.equal(x.ready_for_w25_cas_only, false);
  assert.ok(x.reasons.includes('CONVERSATION_BINDING_UNVERIFIED'));
});
test('Chatwoot missing conversation fail closed without explicit Messenger cold-start proof', () => {
  const x = standby({ conversation: { synthetic: true, peer_id: identity.peer_id, exists: false } });
  assert.equal(x.ready_for_w25_cas_only, false);
  assert.ok(x.reasons.includes('MISSING_CONVERSATION_CANNOT_ASSUME_API_CHANNEL'));
});
test('Chatwoot missing conversation documented synthetic proof is still no switch', () => {
  const x = standby({ conversation: { synthetic: true, peer_id: identity.peer_id, exists: false,
    messenger_cold_start_permitted: true, platform_window_verified: true } });
  assert.equal(x.ready_for_w25_cas_only, true);
  assert.equal(x.switched, false);
});
test('automatic failover without approval or valid routing/2 apps remains blocked', () => {
  const x = standby({ explicitApproval: false, routing: { ...routing(), both_apps_authorized: false } });
  assert.ok(x.reasons.includes('EXPLICIT_APPROVAL_REQUIRED'));
  assert.ok(x.reasons.includes('META_APP_AND_INBOX_PROOF_MISSING'));
});
test('pending UNKNOWN blocks all cross-service switching even with approval', () => {
  const x = standby({ pendingUnknown: true });
  assert.equal(x.ready_for_w25_cas_only, false);
  assert.ok(x.reasons.includes('UNKNOWN_OUTBOX_PENDING_NO_CROSS_PROVIDER_RETRY'));
});
test('stale routing/binding versions and current owner NONE fail closed', () => {
  const x = standby({ routing: { ...routing(), binding_revision: 6, active_owner: OWNER.NONE } });
  assert.ok(x.reasons.includes('ROUTING_BINDING_NOT_VERIFIED'));
  assert.ok(x.reasons.includes('PANCAKE_MUST_OWN_BEFORE_TAKEOVER'));
});
test('synthetic Meta receipt cannot be mistaken for authenticated production ACK', () => {
  const x = reconcileSyntheticMetaReceipt({ prepared: prepared(), receipt: {
    origin: 'SYNTHETIC_META_FIXTURE_ONLY', canonical_k: fullK(identity),
    meta_page_id: binding.meta_page_id, binding_revision: 7,
    owner_epoch: 12, send_intent_id: 'fake-intent-1',
    synthetic_meta_mid: 'fake-meta-mid-1', kind: 'DELIVERED'
  } });
  assert.equal(x.state, 'ACK_SYNTHETIC_FIXTURE_NOT_REAL_META');
  assert.equal(x.verified_real_meta_ack, false);
});
test('late synthetic ACK after epoch or Page rebinding is rejected', () => {
  const base = { origin: 'SYNTHETIC_META_FIXTURE_ONLY', canonical_k: fullK(identity),
    meta_page_id: binding.meta_page_id, binding_revision: 7,
    owner_epoch: 12, send_intent_id: 'fake-intent-1',
    synthetic_meta_mid: 'fake-meta-mid-1', kind: 'READ' };
  for (const delta of [{ owner_epoch: 13 }, { binding_revision: 8 },
    { meta_page_id: 'fake-meta-page-b' }, { canonical_k: 'fake-other-k' }]) {
    err(() => reconcileSyntheticMetaReceipt({ prepared: prepared(),
      receipt: { ...base, ...delta } }), 'RECEIPT_SCOPE_OR_PROVENANCE_INVALID');
  }
});
test('real-looking Meta MID and forged receipt provenance blocked', () => {
  const base = { origin: 'SYNTHETIC_META_FIXTURE_ONLY', canonical_k: fullK(identity),
    meta_page_id: binding.meta_page_id, binding_revision: 7,
    owner_epoch: 12, send_intent_id: 'fake-intent-1',
    synthetic_meta_mid: 'fake-meta-mid-1', kind: 'READ' };
  err(() => reconcileSyntheticMetaReceipt({ prepared: prepared(),
    receipt: { ...base, origin: 'REAL_META_WEBHOOK' } }), 'RECEIPT_SCOPE_OR_PROVENANCE_INVALID');
  err(() => reconcileSyntheticMetaReceipt({ prepared: prepared(),
    receipt: { ...base, synthetic_meta_mid: 'm_12345' } }), 'REAL_OR_INVALID_SYNTHETIC_META_MID_FORBIDDEN');
});
