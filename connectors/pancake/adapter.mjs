// W27: synthetic Facebook Page adapter contract. No HTTP, tokens, sockets, SDK or sender.
import { createHash } from 'node:crypto';

export const CHANNEL = 'FB_PAGE';
export const OWNER = Object.freeze({ PANCAKE: 'PANCAKE', CHATWOOT: 'CHATWOOT', NONE: 'NONE' });
export const ORIGIN = 'SYNTHETIC_FIXTURE_ONLY';

function reject(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}
function str(value, code) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) reject(code);
  return value;
}
function fake(value, field) {
  const s = str(value, 'MISSING_' + field);
  if (!/^fake-[a-z0-9][a-z0-9._-]*$/.test(s)) reject('REAL_OR_INVALID_' + field + '_FORBIDDEN');
  return s;
}
function positiveInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 1) reject('INVALID_' + field);
  return value;
}
function hash(raw) {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/** Canonical K must arrive from W24; this adapter NEVER creates identities or grants. */
export function fullK(identity) {
  if (!identity || typeof identity !== 'object') reject('MISSING_K');
  if (identity.tenant !== 'SYNTHETIC_TEST_ONLY') reject('REAL_TENANT_FORBIDDEN');
  if (identity.channel !== CHANNEL) reject('WRONG_CHANNEL');
  return [
    identity.tenant,
    fake(identity.account, 'ACCOUNT'),
    CHANNEL,
    fake(identity.peer_id, 'PEER'),
    positiveInteger(identity.binding_revision, 'BINDING_REVISION')
  ].join('|');
}

/** Synthetic Page/peer binding supplied by identity owner W24, not minted here. */
export function requirePageBinding(identity, binding) {
  const k = fullK(identity);
  if (!binding || binding.synthetic !== true) reject('BINDING_NOT_SYNTHETIC');
  if (binding.account !== identity.account ||
      binding.binding_revision !== identity.binding_revision ||
      binding.peer_id !== identity.peer_id) reject('PAGE_BINDING_MISMATCH');
  fake(binding.meta_page_id, 'META_PAGE');
  fake(binding.pancake_page_id, 'PANCAKE_PAGE');
  fake(binding.source_peer_id, 'SOURCE_PEER');
  return Object.freeze({ k, meta_page_id: binding.meta_page_id,
    pancake_page_id: binding.pancake_page_id, source_peer_id: binding.source_peer_id,
    binding_revision: identity.binding_revision });
}

const EVENTS = new Set(['messaging', 'conversation', 'connect_status']);
const MAX_BODY_BYTES = 64 * 1024;

/**
 * Only processes explicit test-fixture envelopes; NOT a Pancake webhook verifier.
 * The official public webhook YAML does not define adequate cryptographic
 * origin verification. It must be supplied by a future verified ingress gate.
 */
export function createSyntheticPancakeInboundAdapter() {
  const seen = new Set();
  const lastConversationVersion = new Map();
  return {
    ingest({ identity, binding, origin, rawBody }) {
      const scoped = requirePageBinding(identity, binding);
      if (origin !== ORIGIN) reject('UNVERIFIED_PANCAKE_ORIGIN');
      if (typeof rawBody !== 'string' ||
          Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) reject('INVALID_WEBHOOK_BODY');
      let body;
      try { body = JSON.parse(rawBody); } catch { reject('INVALID_WEBHOOK_JSON'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) reject('INVALID_WEBHOOK_OBJECT');
      if (body.page_id !== scoped.pancake_page_id) reject('CROSS_PAGE_WEBHOOK');
      if (!EVENTS.has(body.event_type)) reject('UNSUPPORTED_WEBHOOK_EVENT');
      const eventType = body.event_type;
      const payload = body.data;
      if (!payload || typeof payload !== 'object') reject('INVALID_EVENT_DATA');
      const digest = hash(rawBody);
      const eventId = typeof body.request_id === 'string' && /^fake-/.test(body.request_id)
        ? body.request_id : 'sha256:' + digest;
      const idempotencyScope = scoped.k + '|' + scoped.meta_page_id + '|' + eventType + '|' + eventId;
      if (seen.has(idempotencyScope)) return { duplicate: true, disposition: 'IGNORE_DUPLICATE' };
      let normalized;
      if (eventType === 'messaging') {
        const m = payload.message, conv = payload.conversation;
        if (!m || !conv) reject('MISSING_MESSAGING_FIELDS');
        fake(m.id, 'PROVIDER_MESSAGE_ID');
        fake(conv.id, 'CONVERSATION_ID');
        if (m.conversation_id !== conv.id || m.page_id !== body.page_id) reject('MESSAGE_PAGE_OR_CONVERSATION_MISMATCH');
        if (m.from?.id !== scoped.source_peer_id) reject('SOURCE_PEER_BINDING_MISMATCH');
        if (typeof m.message !== 'string' || !m.message.length) reject('INVALID_ORIGINAL_MESSAGE');
        normalized = {
          kind: 'FB_PAGE_SYNTHETIC_INBOUND', canonical_k: scoped.k,
          meta_page_id: scoped.meta_page_id, binding_revision: scoped.binding_revision,
          source: 'PANCAKE', conversation_id: conv.id,
          provider_message_id: m.id, verified_meta_mid: null,
          original: m.message, translated: null,
          translation_state: 'NOT_RUN', receipt_state: 'UNVERIFIED_PROVIDER',
          synthetic: true
        };
      } else if (eventType === 'conversation') {
        const conv = payload.conversation;
        if (!conv) reject('MISSING_CONVERSATION');
        fake(conv.id, 'CONVERSATION_ID');
        const version = positiveInteger(conv.version, 'CONVERSATION_VERSION');
        const versionKey = scoped.k + '|' + conv.id;
        const previous = lastConversationVersion.get(versionKey) || 0;
        if (version <= previous) return { duplicate: true, disposition: 'STALE_CONVERSATION_VERSION' };
        normalized = {
          kind: 'FB_PAGE_SYNTHETIC_CONVERSATION', canonical_k: scoped.k,
          meta_page_id: scoped.meta_page_id, binding_revision: scoped.binding_revision,
          source: 'PANCAKE', conversation_id: conv.id, version,
          provider_watermarks: Array.isArray(conv.read_watermarks) ? conv.read_watermarks : [],
          verified_meta_read: false, synthetic: true
        };
        lastConversationVersion.set(versionKey, version);
      } else {
        const status = payload.connect_status;
        if (!['connected', 'disconnected'].includes(status)) reject('INVALID_CONNECT_STATUS');
        normalized = {
          kind: 'FB_PAGE_SYNTHETIC_CONNECTION_STATUS', canonical_k: scoped.k,
          meta_page_id: scoped.meta_page_id, binding_revision: scoped.binding_revision,
          status, authorizes_send: false, authorizes_failover: false, synthetic: true
        };
      }
      seen.add(idempotencyScope);
      return { duplicate: false, event_id: eventId, payload_sha256: digest,
        origin: 'NONCRYPTOGRAPHIC_SYNTHETIC_FIXTURE', ...normalized };
    },
    /** Test-only observability, no durable queue and no provider credentials. */
    syntheticStats() {
      return { seen_events: seen.size, tracked_conversations: lastConversationVersion.size };
    }
  };
}

function requireOwnerProof(identity, binding, proof, provider) {
  const scoped = requirePageBinding(identity, binding);
  if (!Object.values(OWNER).includes(provider) || provider === OWNER.NONE) reject('INVALID_REQUESTED_OWNER');
  if (!proof || proof.source !== 'W25_SYNTHETIC_FENCE' ||
      proof.canonical_k !== scoped.k ||
      proof.meta_page_id !== scoped.meta_page_id ||
      proof.binding_revision !== scoped.binding_revision ||
      proof.active_owner !== provider ||
      proof.preirreversible_revalidated !== true ||
      proof.eligible !== true ||
      proof.pending_unknown !== false) reject('W25_FENCE_PROOF_REQUIRED');
  positiveInteger(proof.owner_epoch, 'OWNER_EPOCH');
  fake(proof.send_intent_id, 'SEND_INTENT');
  fake(proof.canonical_business_message_id, 'BUSINESS_MESSAGE');
  return scoped;
}

/** Prepares a data-only DTO for W25; does not send or own the Outbox. */
export function prepareSyntheticProviderAttempt({ identity, binding, w25Proof, provider }) {
  const scoped = requireOwnerProof(identity, binding, w25Proof, provider);
  return Object.freeze({
    status: 'PREPARED_NOT_SUBMITTED', synthetic: true, requires: 'W25_ONLY',
    provider, canonical_k: scoped.k, meta_page_id: scoped.meta_page_id,
    binding_revision: scoped.binding_revision,
    send_intent_id: w25Proof.send_intent_id,
    canonical_business_message_id: w25Proof.canonical_business_message_id,
    owner_epoch: w25Proof.owner_epoch, provider_attempt_executed: false,
    verified_meta_mid: null
  });
}

/**
 * Translate synthetic provider HTTP results to honest states, never final
 * Meta Delivered/Read. No outbound HTTP or retry exists anywhere in this module.
 */
export function classifySyntheticPancakeResponse({ prepared, httpStatus, body, timeout = false }) {
  if (!prepared || prepared.status !== 'PREPARED_NOT_SUBMITTED' ||
      prepared.synthetic !== true || prepared.provider !== OWNER.PANCAKE) reject('W25_PREPARED_ATTEMPT_REQUIRED');
  if (timeout) return Object.freeze({ state: 'DELIVERY_UNKNOWN', synthetic: true,
    provider_message_id: null, verified_meta_mid: null, may_retry_via_chatwoot: false });
  if (!Number.isInteger(httpStatus)) reject('INVALID_HTTP_STATUS');
  if (httpStatus === 200 && body?.success === false) return Object.freeze({
    state: 'PROVIDER_REJECTED', synthetic: true,
    message_code: typeof body.message_code === 'string' ? body.message_code : 'UNSPECIFIED',
    provider_message_id: null, verified_meta_mid: null, may_retry_via_chatwoot: false
  });
  if (httpStatus === 200 && body?.success === true && typeof body.id === 'string') {
    fake(body.id, 'PROVIDER_MESSAGE_ID');
    return Object.freeze({
      state: 'PROVIDER_ACCEPTED_META_UNVERIFIED', synthetic: true,
      provider_message_id: body.id, verified_meta_mid: null,
      delivered: false, read: false, may_retry_via_chatwoot: false
    });
  }
  return Object.freeze({ state: 'DELIVERY_UNKNOWN', synthetic: true,
    provider_message_id: null, verified_meta_mid: null, may_retry_via_chatwoot: false });
}

/** Pure readiness assessment: only W25 may perform an atomic owner-epoch CAS. */
export function assessSyntheticChatwootStandby({ identity, binding, routing, pendingUnknown = false,
  explicitApproval = false, conversation }) {
  const scoped = requirePageBinding(identity, binding);
  const reasons = [];
  if (!routing || routing.synthetic !== true ||
      routing.meta_page_id !== scoped.meta_page_id ||
      routing.binding_revision !== scoped.binding_revision) reasons.push('ROUTING_BINDING_NOT_VERIFIED');
  if (routing?.active_owner !== OWNER.PANCAKE) reasons.push('PANCAKE_MUST_OWN_BEFORE_TAKEOVER');
  if (!Number.isSafeInteger(routing?.owner_epoch) || routing.owner_epoch < 1) reasons.push('INVALID_OWNER_EPOCH');
  if (routing?.meta_routing_verified !== true ||
      routing?.both_apps_authorized !== true ||
      routing?.facebook_messenger_inbox_verified !== true) reasons.push('META_APP_AND_INBOX_PROOF_MISSING');
  if (pendingUnknown) reasons.push('UNKNOWN_OUTBOX_PENDING_NO_CROSS_PROVIDER_RETRY');
  if (!explicitApproval) reasons.push('EXPLICIT_APPROVAL_REQUIRED');
  if (!conversation || conversation.synthetic !== true ||
      conversation.peer_id !== identity.peer_id) reasons.push('CONVERSATION_BINDING_UNVERIFIED');
  else if (conversation.exists === true) {
    if (!/^fake-/.test(conversation.chatwoot_conversation_id || '') ||
        conversation.same_meta_peer !== true) reasons.push('EXISTING_CONVERSATION_MAPPING_UNVERIFIED');
  } else if (conversation.exists === false) {
    if (conversation.messenger_cold_start_permitted !== true ||
        conversation.platform_window_verified !== true)
      reasons.push('MISSING_CONVERSATION_CANNOT_ASSUME_API_CHANNEL');
  } else reasons.push('CONVERSATION_EXISTENCE_UNKNOWN');
  return Object.freeze({
    ready_for_w25_cas_only: reasons.length === 0, reasons,
    synthetic: true, proposed_owner: OWNER.CHATWOOT,
    prior_owner_epoch: Number.isSafeInteger(routing?.owner_epoch) ? routing.owner_epoch : null,
    switched: false, sent: false, verified_meta_mid: null
  });
}

/** Synthetic fixture receipt, *never* a verified real Meta delivery. */
export function reconcileSyntheticMetaReceipt({ prepared, receipt }) {
  if (!prepared || prepared.synthetic !== true || prepared.status !== 'PREPARED_NOT_SUBMITTED')
    reject('W25_PREPARED_ATTEMPT_REQUIRED');
  if (!receipt || receipt.origin !== 'SYNTHETIC_META_FIXTURE_ONLY' ||
      receipt.canonical_k !== prepared.canonical_k ||
      receipt.meta_page_id !== prepared.meta_page_id ||
      receipt.binding_revision !== prepared.binding_revision ||
      receipt.owner_epoch !== prepared.owner_epoch ||
      receipt.send_intent_id !== prepared.send_intent_id) reject('RECEIPT_SCOPE_OR_PROVENANCE_INVALID');
  const id = fake(receipt.synthetic_meta_mid, 'SYNTHETIC_META_MID');
  if (!['DELIVERED', 'READ'].includes(receipt.kind)) reject('UNSUPPORTED_RECEIPT_KIND');
  return Object.freeze({ state: 'ACK_SYNTHETIC_FIXTURE_NOT_REAL_META',
    kind: receipt.kind, synthetic_meta_mid: id, verified_real_meta_ack: false,
    synthetic: true, canonical_k: prepared.canonical_k });
}
