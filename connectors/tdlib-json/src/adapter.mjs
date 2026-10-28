/**
 * W29 / Issue #13 — deterministic, strictly synthetic TDLib JSON event projection.
 *
 * NO TDLib binary loading, td_send, Telegram login, Bot API, network, real credentials,
 * outbound queue or retries. W25 alone owns SendIntent/Outbox; W24 alone owns binding K.
 * Every emitted event is explicitly simulated. No ACK implies peer delivery/read.
 */
const CHANNEL = 'TELEGRAM_PERSONAL';
const SYNTHETIC_TENANT = 'SYNTHETIC_TEST_ONLY';
const SYNTHETIC_PREFIX = 'fake-';

export class TdlibSyntheticContractError extends Error {
  constructor(code) {
    super(code);
    this.name = 'TdlibSyntheticContractError';
    this.code = code;
  }
}
const fail = (code) => { throw new TdlibSyntheticContractError(code); };
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function requireFake(value, field) {
  if (typeof value !== 'string' || !value.startsWith(SYNTHETIC_PREFIX) || value.length > 120) {
    fail('ONLY_FAKE_' + field);
  }
  return value;
}

/** TDLib int53 values are safe JS integer Numbers; allow exact integer strings at the boundary. */
export function exactTdlibInt53(value, field) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) fail('LOSSY_TDLIB_INT53_' + field);
    return String(value);
  }
  if (typeof value === 'string' && /^-?(0|[1-9][0-9]*)$/.test(value)) {
    const n = BigInt(value);
    if (n > BigInt(Number.MAX_SAFE_INTEGER) || n < BigInt(Number.MIN_SAFE_INTEGER)) {
      fail('LOSSY_TDLIB_INT53_' + field);
    }
    return n.toString();
  }
  return fail('INVALID_TDLIB_INT53_' + field);
}

export function syntheticCanonicalK(input) {
  if (!input || typeof input !== 'object' || input.tenant !== SYNTHETIC_TENANT
    || input.channel !== CHANNEL) fail('INVALID_SYNTHETIC_K');
  const account = requireFake(input.account, 'ACCOUNT');
  const peer = requireFake(input.peer_id, 'PEER');
  const rev = input.binding_revision;
  if (!Number.isSafeInteger(rev) || rev < 1) fail('INVALID_BINDING_REVISION');
  return {
    tenant: SYNTHETIC_TENANT, account, channel: CHANNEL,
    peer_id: peer, binding_revision: rev,
  };
}
export function syntheticKKey(k) {
  const v = syntheticCanonicalK(k);
  return [v.tenant, v.account, v.channel, v.peer_id, v.binding_revision].join('|');
}
const routeKey = (client, chat) => client + '|' + chat;
const attemptIndexKey = (route, mid) => route + '|' + mid;
const result = (status, extra = {}) => ({ status, simulated: true, ...extra });

/**
 * bindings: preauthorized, synthetic fixture mappings from W24; never inferred from Telegram username.
 * currentBinding(binding): injected W24-authoritative GET. Must return matching K/route and active:true.
 * onEvent(event): optional W25/W45 owned contract sink; no provider or private network access.
 */
export function createSyntheticTdlibJsonAdapter({ bindings, currentBinding, onEvent = () => {} }) {
  if (!Array.isArray(bindings) || typeof currentBinding !== 'function'
    || typeof onEvent !== 'function') fail('AUTHORITY_PORTS_REQUIRED');
  const routes = new Map();
  const attemptsByExtra = new Map();
  const attemptIds = new Set();
  const tempToExtra = new Map();
  const seenInbound = new Set();
  const records = [];

  for (const input of bindings) {
    const k = syntheticCanonicalK(input);
    const client = input.tdlib_client_id;
    if (!Number.isSafeInteger(client) || client < 1) fail('INVALID_CLIENT_ID');
    const chatId = exactTdlibInt53(input.chat_id, 'CHAT_ID');
    const route = routeKey(client, chatId);
    const binding = { ...k, tdlib_client_id: client, chat_id: chatId };
    if (routes.has(route)) fail('DUPLICATE_SYNTHETIC_ROUTE');
    // One TDLib client represents one user account but may have many peer chats.
    for (const other of routes.values()) {
      if (other.tdlib_client_id === client && other.account !== binding.account) {
        fail('TDLIB_CLIENT_ACCOUNT_REUSE');
      }
    }
    routes.set(route, binding);
  }

  function authoritative(binding) {
    const current = currentBinding({ ...binding });
    if (!current || current.active !== true) return false;
    try {
      const present = syntheticCanonicalK(current);
      return syntheticKKey(present) === syntheticKKey(binding)
        && current.tdlib_client_id === binding.tdlib_client_id
        && exactTdlibInt53(current.chat_id, 'CHAT_ID') === binding.chat_id;
    } catch {
      return false;
    }
  }

  function emit(binding, kind, fields = {}) {
    const event = Object.freeze({
      kind, source: 'TDLIB_JSON_SYNTHETIC', simulated: true,
      k: syntheticCanonicalK(binding), chat_id: binding.chat_id,
      ...fields,
    });
    // Mark local receipt only after the consumer successfully accepts the event.
    onEvent(event);
    records.push(event);
    return result(kind, { event });
  }

  function bindSyntheticAttempt({ k: supplied, tdlib_client_id, chat_id, attempt_id, td_extra,
    temporary_message_id = null }) {
    requireFake(attempt_id, 'ATTEMPT_ID');
    requireFake(td_extra, 'TD_EXTRA');
    const chat = exactTdlibInt53(chat_id, 'CHAT_ID');
    const binding = routes.get(routeKey(tdlib_client_id, chat));
    if (!binding || syntheticKKey(binding) !== syntheticKKey(supplied) || !authoritative(binding)) {
      return result('QUARANTINED_STALE_BINDING');
    }
    if (attemptsByExtra.has(td_extra) || attemptIds.has(attempt_id)) {
      return result('DUPLICATE_ATTEMPT_CORRELATION');
    }
    const state = { binding, attempt_id, td_extra, temp_id: null, final_id: null,
      status: 'REGISTERED', terminal: false };
    if (temporary_message_id !== null) {
      state.temp_id = exactTdlibInt53(temporary_message_id, 'TEMP_MESSAGE_ID');
      const key = attemptIndexKey(routeKey(tdlib_client_id, chat), state.temp_id);
      if (tempToExtra.has(key)) return result('DUPLICATE_TEMP_MESSAGE_ID');
      tempToExtra.set(key, td_extra);
    }
    attemptsByExtra.set(td_extra, state);
    attemptIds.add(attempt_id);
    return result('CORRELATION_REGISTERED_NO_SEND', { attempt_id });
  }

  function parseEnvelope(envelope) {
    let value = envelope;
    if (typeof envelope === 'string') {
      if (envelope.length > 65536) fail('TDLIB_ENVELOPE_TOO_LARGE');
      try { value = JSON.parse(envelope); } catch { fail('INVALID_JSON'); }
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || typeof value['@type'] !== 'string'
      || !Number.isSafeInteger(value['@client_id']) || value['@client_id'] < 1) {
      fail('INVALID_TDLIB_ENVELOPE');
    }
    return value;
  }

  function findRoute(env, rawChat) {
    const chat = exactTdlibInt53(rawChat, 'CHAT_ID');
    const binding = routes.get(routeKey(env['@client_id'], chat));
    return binding && authoritative(binding) ? binding : null;
  }

  function attemptForUpdate(env, rawChat, rawTemp) {
    const binding = findRoute(env, rawChat);
    if (!binding) return null;
    const temp = exactTdlibInt53(rawTemp, 'TEMP_MESSAGE_ID');
    const extra = tempToExtra.get(attemptIndexKey(routeKey(env['@client_id'], binding.chat_id), temp));
    if (!extra) return null;
    const attempt = attemptsByExtra.get(extra);
    if (!attempt || syntheticKKey(binding) !== syntheticKKey(attempt.binding)) return null;
    return attempt;
  }

  function projectInbound(env) {
    const m = env.message;
    if (!m || typeof m !== 'object') fail('INVALID_TDLIB_MESSAGE');
    const binding = findRoute(env, m.chat_id);
    if (!binding) return result('QUARANTINED_UNBOUND_OR_STALE_CHAT');
    if (m.is_outgoing !== false) return result('IGNORED_NOT_INBOUND');
    const content = m.content;
    if (content?.['@type'] !== 'messageText'
      || content.text?.['@type'] !== 'formattedText'
      || typeof content.text.text !== 'string'
      || !content.text.text.startsWith('[SYNTHETIC] ')
      || content.text.text.length > 4096) return result('QUARANTINED_NON_SYNTHETIC_CONTENT');
    const mid = exactTdlibInt53(m.id, 'MESSAGE_ID');
    const dedupe = syntheticKKey(binding) + '|' + binding.chat_id + '|' + mid;
    if (seenInbound.has(dedupe)) return result('DUPLICATE_INBOUND');
    const emitted = emit(binding, 'SYNTHETIC_INBOUND', {
      provider_message_id: mid, original: content.text.text,
      translation: null, translated: false,
      provenance: { provider: 'TDLIB_JSON', event: 'updateNewMessage', real_provider: false },
    });
    seenInbound.add(dedupe);
    return emitted;
  }

  function projectSendResponse(env) {
    if (typeof env['@extra'] !== 'string') return result('QUARANTINED_UNMATCHED_EXTRA');
    const attempt = attemptsByExtra.get(env['@extra']);
    if (!attempt || !authoritative(attempt.binding)
      || env['@client_id'] !== attempt.binding.tdlib_client_id) {
      return result('QUARANTINED_UNMATCHED_OR_STALE_EXTRA');
    }
    if (env['@type'] === 'error') {
      if (attempt.terminal) return result('DUPLICATE_TERMINAL_EVENT');
      if (attempt.status === 'DELIVERY_UNKNOWN') return result('DUPLICATE_UNKNOWN_NO_RETRY');
      // A failed response does not prove there were no provider side effects.
      const emitted = emit(attempt.binding, 'DELIVERY_UNKNOWN_NO_RETRY', {
        attempt_id: attempt.attempt_id, reason: 'TDLIB_RESPONSE_ERROR_UNRECONCILED',
      });
      attempt.status = 'DELIVERY_UNKNOWN';
      return emitted;
    }
    if (env['@type'] !== 'message'
      || exactTdlibInt53(env.chat_id, 'CHAT_ID') !== attempt.binding.chat_id) {
      return result('QUARANTINED_WRONG_RESPONSE');
    }
    const temp = exactTdlibInt53(env.id, 'TEMP_MESSAGE_ID');
    const key = attemptIndexKey(routeKey(env['@client_id'], attempt.binding.chat_id), temp);
    if (attempt.temp_id && attempt.temp_id !== temp) return result('QUARANTINED_TEMP_MISMATCH');
    if (tempToExtra.has(key) && tempToExtra.get(key) !== attempt.td_extra) {
      return result('QUARANTINED_TEMP_COLLISION');
    }
    if (attempt.terminal) return result('DUPLICATE_TERMINAL_EVENT');
    if (attempt.status === 'DELIVERY_UNKNOWN') return result('DELIVERY_UNKNOWN_UNRESOLVED');
    if (attempt.status !== 'REGISTERED') return result('DUPLICATE_SEND_RESPONSE');
    const emitted = emit(attempt.binding, 'SEND_RESPONSE_PENDING_NOT_ACK', {
      attempt_id: attempt.attempt_id, temporary_message_id: temp,
      delivered: false, read: false,
    });
    attempt.temp_id = temp;
    tempToExtra.set(key, attempt.td_extra);
    attempt.status = 'PENDING';
    return emitted;
  }

  function projectSendUpdate(env) {
    const kind = env['@type'];
    const body = kind === 'updateMessageSendAcknowledged' ? env : env.message;
    if (!body || typeof body !== 'object') return result('QUARANTINED_MISSING_SEND_MESSAGE');
    const attempt = attemptForUpdate(env, body.chat_id,
      kind === 'updateMessageSendAcknowledged' ? env.message_id : env.old_message_id);
    if (!attempt) return result('QUARANTINED_UNMATCHED_OR_STALE_UPDATE');
    if (attempt.terminal) return result('DUPLICATE_OR_CONTRADICTORY_TERMINAL');
    if (kind === 'updateMessageSendAcknowledged') {
      if (attempt.status === 'QUICK_ACK') return result('DUPLICATE_QUICK_ACK');
      if (attempt.status === 'DELIVERY_UNKNOWN') return result('DELIVERY_UNKNOWN_UNRESOLVED');
      const emitted = emit(attempt.binding, 'SERVER_QUICK_ACK_NOT_SENT', {
        attempt_id: attempt.attempt_id, temporary_message_id: attempt.temp_id,
        delivered: false, read: false,
      });
      attempt.status = 'QUICK_ACK';
      return emitted;
    }
    if (kind === 'updateMessageSendSucceeded') {
      const finalId = exactTdlibInt53(body.id, 'FINAL_MESSAGE_ID');
      const emitted = emit(attempt.binding, 'PROVIDER_SEND_CONFIRMED_NOT_READ', {
        attempt_id: attempt.attempt_id, temporary_message_id: attempt.temp_id,
        provider_message_id: finalId, delivered: false, read: false,
      });
      attempt.final_id = finalId;
      attempt.status = 'SENT';
      attempt.terminal = true;
      return emitted;
    }
    const emitted = emit(attempt.binding, 'PROVIDER_SEND_FAILED', {
      attempt_id: attempt.attempt_id, temporary_message_id: attempt.temp_id,
      error_code: Number.isSafeInteger(env.error?.code) ? env.error.code : null,
      delivered: false, read: false,
    });
    attempt.status = 'FAILED';
    attempt.terminal = true;
    return emitted;
  }

  function handleEnvelope(input) {
    const env = parseEnvelope(input);
    const kind = env['@type'];
    if (kind === 'updateNewMessage') return projectInbound(env);
    if (kind === 'message' || (kind === 'error' && own(env, '@extra'))) {
      return projectSendResponse(env);
    }
    if (kind === 'updateMessageSendAcknowledged'
      || kind === 'updateMessageSendSucceeded'
      || kind === 'updateMessageSendFailed') return projectSendUpdate(env);
    if (kind === 'updateAuthorizationState') {
      // TDLib ready is not W24 account consent and not platform approval.
      return result('AUTH_STATE_OBSERVED_NOT_ACCOUNT_AUTHORIZED');
    }
    return result('UNSUPPORTED_EVENT_NOT_CAPABILITY');
  }

  function markUnknown({ td_extra, reason = 'WORKER_INTERRUPTED' }) {
    const attempt = attemptsByExtra.get(td_extra);
    if (!attempt || !authoritative(attempt.binding)) {
      return result('QUARANTINED_UNMATCHED_OR_STALE_EXTRA');
    }
    if (attempt.terminal) return result('ALREADY_TERMINAL_NO_RETRY');
    if (attempt.status === 'DELIVERY_UNKNOWN') return result('DUPLICATE_UNKNOWN_NO_RETRY');
    const emitted = emit(attempt.binding, 'DELIVERY_UNKNOWN_NO_RETRY', {
      attempt_id: attempt.attempt_id,
      reason: String(reason).slice(0,80), delivered: false, read: false,
    });
    attempt.status = 'DELIVERY_UNKNOWN';
    return emitted;
  }

  return Object.freeze({
    handleEnvelope, bindSyntheticAttempt, markUnknown,
    // Only simulated event projections; never returns session secrets or native handles.
    events: () => records.map(event => structuredClone(event)),
  });
}
