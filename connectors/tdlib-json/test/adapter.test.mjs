import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSyntheticTdlibJsonAdapter, exactTdlibInt53,
  syntheticCanonicalK, syntheticKKey,
} from '../src/adapter.mjs';

const A = Object.freeze({
  tenant: 'SYNTHETIC_TEST_ONLY', account: 'fake-tg-a',
  channel: 'TELEGRAM_PERSONAL', peer_id: 'fake-peer-alice',
  binding_revision: 3, tdlib_client_id: 101, chat_id: '-100100001',
});
const B = Object.freeze({ ...A, peer_id: 'fake-peer-bob', chat_id: '-100100002' });
const C = Object.freeze({ ...A, account: 'fake-tg-c', peer_id: 'fake-peer-clara',
  binding_revision: 1, tdlib_client_id: 103, chat_id: '-100100001' });

function harness(bindings = [A, B, C]) {
  const current = new Map(bindings.map(b => [b.tdlib_client_id + '|' + b.chat_id, { ...b, active: true }]));
  const emitted = [];
  const adapter = createSyntheticTdlibJsonAdapter({
    bindings, currentBinding: (b) => current.get(b.tdlib_client_id + '|' + b.chat_id),
    onEvent: event => emitted.push(event),
  });
  return { adapter, emitted, current };
}
const m = (client = 101, chat = A.chat_id, mid = 17, text = '[SYNTHETIC] hi') => ({
  '@type': 'updateNewMessage', '@client_id': client,
  message: { id: mid, chat_id: chat, is_outgoing: false,
    content: { '@type': 'messageText',
      text: { '@type': 'formattedText', text },
    },
  },
});
const fakeAttempt = (adapter, b = A, opt = {}) =>
  adapter.bindSyntheticAttempt({ k: b, tdlib_client_id: b.tdlib_client_id,
    chat_id: b.chat_id, attempt_id: 'fake-attempt-'+(opt.suffix ?? '1'),
    td_extra: 'fake-extra-'+(opt.suffix ?? '1'), ...opt });
const response = (extra = 'fake-extra-1', tempId = 51, client = 101, chat = A.chat_id) =>
  ({ '@type': 'message', '@client_id': client, '@extra': extra,
    id: tempId, chat_id: chat });
const quickAck = (tempId = 51, client = 101, chat = A.chat_id) =>
  ({ '@type': 'updateMessageSendAcknowledged', '@client_id': client,
    chat_id: chat, message_id: tempId });
const success = (tempId = 51, finalId = 900, client = 101, chat = A.chat_id) =>
  ({ '@type': 'updateMessageSendSucceeded', '@client_id': client,
    old_message_id: tempId, message: { id: finalId, chat_id: chat } });
const failed = (tempId = 51, client = 101, chat = A.chat_id) =>
  ({ '@type': 'updateMessageSendFailed', '@client_id': client,
    old_message_id: tempId, message: { id: tempId, chat_id: chat },
    error: { '@type': 'error', code: 403, message: 'redacted' } });

test('canonical K matches M0 fields and is synthetic only', () => {
  assert.equal(syntheticKKey(A), 'SYNTHETIC_TEST_ONLY|fake-tg-a|TELEGRAM_PERSONAL|fake-peer-alice|3');
  assert.deepEqual(syntheticCanonicalK(A), {
    tenant: A.tenant, account: A.account, channel: A.channel,
    peer_id: A.peer_id, binding_revision: A.binding_revision,
  });
  for (const bad of [
    { ...A, tenant: 'real' }, { ...A, channel: 'BOT_API' },
    { ...A, account: 'someone' }, { ...A, binding_revision: 0 },
  ]) assert.throws(() => syntheticKKey(bad));
});
test('int53 preserves legal IDs and rejects overflow, decimals and float', () => {
  assert.equal(exactTdlibInt53('-100100001', 'CHAT_ID'), '-100100001');
  assert.equal(exactTdlibInt53(Number.MAX_SAFE_INTEGER, 'CHAT_ID'), String(Number.MAX_SAFE_INTEGER));
  for (const bad of ['9007199254740993', Number.MAX_SAFE_INTEGER+1, 1.7, '1.7', '01', true, 1n]) {
    assert.throws(() => exactTdlibInt53(bad, 'CHAT_ID'));
  }
});
test('rejects missing K current-binding authority, invalid routes and duplicate binding', () => {
  assert.throws(() => createSyntheticTdlibJsonAdapter({ bindings: [A] }));
  assert.throws(() => createSyntheticTdlibJsonAdapter({
    bindings: [A, A], currentBinding: () => ({ ...A, active: true }),
  }));
  assert.throws(() => createSyntheticTdlibJsonAdapter({
    bindings: [A, { ...A, chat_id: '42', account: 'fake-wrong' }],
    currentBinding: () => ({ ...A, active: true }),
  }));
});
test('one TDLib client supports multiple chats, different accounts may use same chat_id', () => {
  const { adapter } = harness();
  assert.equal(adapter.handleEnvelope(m()).status, 'SYNTHETIC_INBOUND');
  assert.equal(adapter.handleEnvelope(m(101, B.chat_id, 18)).status, 'SYNTHETIC_INBOUND');
  assert.equal(adapter.handleEnvelope(m(103, C.chat_id, 17)).status, 'SYNTHETIC_INBOUND');
  const all = adapter.events();
  assert.equal(all.length, 3);
  assert.deepEqual(all.map(x => x.k.peer_id), [A.peer_id, B.peer_id, C.peer_id]);
});
test('inbound text/MID provenance is real event projection but simulated, never translation', () => {
  const { adapter, emitted } = harness();
  const x = adapter.handleEnvelope(JSON.stringify(m()));
  assert.equal(x.status, 'SYNTHETIC_INBOUND');
  assert.equal(x.event.provider_message_id, '17');
  assert.equal(x.event.original, '[SYNTHETIC] hi');
  assert.equal(x.event.provenance.real_provider, false);
  assert.equal(x.event.translation, null);
  assert.equal(x.event.translated, false);
  assert.equal(x.event.simulated, true);
  assert.equal(emitted.length, 1);
});
test('same MID duplicate suppressed by full account+peer K', () => {
  const { adapter } = harness();
  assert.equal(adapter.handleEnvelope(m()).status, 'SYNTHETIC_INBOUND');
  assert.equal(adapter.handleEnvelope(m()).status, 'DUPLICATE_INBOUND');
  assert.equal(adapter.events().length, 1);
});
test('stale/revoked binding rejects new inbound without side effect', () => {
  const { adapter, current } = harness();
  current.set('101|'+A.chat_id, { ...A, active: false });
  assert.equal(adapter.handleEnvelope(m()).status, 'QUARANTINED_UNBOUND_OR_STALE_CHAT');
  current.set('101|'+A.chat_id, { ...A, binding_revision: 4, active: true });
  assert.equal(adapter.handleEnvelope(m()).status, 'QUARANTINED_UNBOUND_OR_STALE_CHAT');
  assert.equal(adapter.events().length, 0);
});
test('unknown client, wrong chat, non-synthetic payload and outbound ignored', () => {
  const { adapter } = harness();
  assert.equal(adapter.handleEnvelope(m(999)).status, 'QUARANTINED_UNBOUND_OR_STALE_CHAT');
  assert.equal(adapter.handleEnvelope(m(101, '888')).status, 'QUARANTINED_UNBOUND_OR_STALE_CHAT');
  assert.equal(adapter.handleEnvelope(m(101, A.chat_id, 17, 'real conversation')).status, 'QUARANTINED_NON_SYNTHETIC_CONTENT');
  const out = m(); out.message.is_outgoing = true;
  assert.equal(adapter.handleEnvelope(out).status, 'IGNORED_NOT_INBOUND');
  assert.equal(adapter.events().length, 0);
});
test('unknown/untrusted TDLib types are explicitly unsupported, no fake green state', () => {
  const { adapter } = harness();
  assert.equal(adapter.handleEnvelope({ '@type': 'updateAuthorizationState',
    '@client_id': 101, authorization_state: { '@type': 'authorizationStateReady' } }).status,
  'AUTH_STATE_OBSERVED_NOT_ACCOUNT_AUTHORIZED');
  assert.equal(adapter.handleEnvelope({ '@type': 'createCall', '@client_id': 101 }).status,
    'UNSUPPORTED_EVENT_NOT_CAPABILITY');
});
test('malformed JSON/no @client_id/unsafe message id fails closed', () => {
  const { adapter } = harness();
  assert.throws(() => adapter.handleEnvelope('not-json'));
  assert.throws(() => adapter.handleEnvelope({ '@type': 'updateNewMessage', message: {} }));
  assert.throws(() => adapter.handleEnvelope(m(101, A.chat_id, 9007199254740992)));
  assert.equal(adapter.events().length, 0);
});
test('attempt correlation only, not a send API; no event emitted at bind', () => {
  const { adapter } = harness();
  assert.equal(fakeAttempt(adapter).status, 'CORRELATION_REGISTERED_NO_SEND');
  assert.equal(adapter.events().length, 0);
  assert.equal(fakeAttempt(adapter).status, 'DUPLICATE_ATTEMPT_CORRELATION');
});
test('response @extra registers temporary ID but is not successful Telegram send/ACK', () => {
  const { adapter } = harness();
  fakeAttempt(adapter);
  const r = adapter.handleEnvelope(response());
  assert.equal(r.status, 'SEND_RESPONSE_PENDING_NOT_ACK');
  assert.equal(r.event.temporary_message_id, '51');
  assert.equal(r.event.delivered, false);
  assert.equal(r.event.read, false);
});
test('unmatched @extra and cross-account mismatch are quarantined', () => {
  const { adapter } = harness();
  fakeAttempt(adapter);
  assert.equal(adapter.handleEnvelope(response('fake-unknown')).status, 'QUARANTINED_UNMATCHED_OR_STALE_EXTRA');
  assert.equal(adapter.handleEnvelope(response('fake-extra-1', 51, 103)).status, 'QUARANTINED_UNMATCHED_OR_STALE_EXTRA');
  assert.equal(adapter.handleEnvelope(response('fake-extra-1', 51, 101, B.chat_id)).status, 'QUARANTINED_WRONG_RESPONSE');
});
test('quick ACK is upstream server reached only; duplicate does not create new events', () => {
  const { adapter } = harness(); fakeAttempt(adapter);
  adapter.handleEnvelope(response());
  assert.equal(adapter.handleEnvelope(quickAck()).status, 'SERVER_QUICK_ACK_NOT_SENT');
  assert.equal(adapter.handleEnvelope(quickAck()).status, 'DUPLICATE_QUICK_ACK');
  assert.equal(adapter.events().length, 2);
});
test('successful update reconciles temporary to final MID; not a read receipt', () => {
  const { adapter } = harness(); fakeAttempt(adapter);
  adapter.handleEnvelope(response()); adapter.handleEnvelope(quickAck());
  const x = adapter.handleEnvelope(success());
  assert.equal(x.status, 'PROVIDER_SEND_CONFIRMED_NOT_READ');
  assert.equal(x.event.temporary_message_id, '51');
  assert.equal(x.event.provider_message_id, '900');
  assert.equal(x.event.delivered, false); assert.equal(x.event.read, false);
  assert.equal(adapter.handleEnvelope(success()).status, 'DUPLICATE_OR_CONTRADICTORY_TERMINAL');
  assert.equal(adapter.events().length, 3);
});
test('failed update carries only code, redacts native error message', () => {
  const { adapter } = harness();
  fakeAttempt(adapter, A, { temporary_message_id: 51 });
  const x = adapter.handleEnvelope(failed());
  assert.equal(x.status, 'PROVIDER_SEND_FAILED');
  assert.equal(x.event.error_code, 403);
  assert.equal(JSON.stringify(x).includes('redacted'), false);
  assert.equal(adapter.handleEnvelope(success()).status, 'DUPLICATE_OR_CONTRADICTORY_TERMINAL');
});
test('crash marks UNKNOWN and suppresses quick ACK, late success reconciles without retry', () => {
  const { adapter } = harness(); fakeAttempt(adapter);
  adapter.handleEnvelope(response());
  assert.equal(adapter.markUnknown({ td_extra: 'fake-extra-1' }).status, 'DELIVERY_UNKNOWN_NO_RETRY');
  assert.equal(adapter.markUnknown({ td_extra: 'fake-extra-1' }).status, 'DUPLICATE_UNKNOWN_NO_RETRY');
  assert.equal(adapter.handleEnvelope(quickAck()).status, 'DELIVERY_UNKNOWN_UNRESOLVED');
  assert.equal(adapter.handleEnvelope(response()).status, 'DELIVERY_UNKNOWN_UNRESOLVED');
  assert.equal(adapter.handleEnvelope(success()).status, 'PROVIDER_SEND_CONFIRMED_NOT_READ');
  assert.equal(adapter.events().length, 3);
});
test('TDLib error response treated as UNKNOWN not implicit safe retry', () => {
  const { adapter } = harness(); fakeAttempt(adapter);
  const x = adapter.handleEnvelope({ '@type': 'error', '@client_id': 101, '@extra': 'fake-extra-1',
    code: 500, message: 'synthetic' });
  assert.equal(x.status, 'DELIVERY_UNKNOWN_NO_RETRY');
  assert.equal(adapter.events().length, 1);
  assert.equal(adapter.markUnknown({ td_extra: 'fake-extra-1' }).status, 'DUPLICATE_UNKNOWN_NO_RETRY');
});
test('late ACK after binding revocation is quarantined, cannot mark current owner', () => {
  const { adapter, current } = harness(); fakeAttempt(adapter);
  adapter.handleEnvelope(response());
  current.set('101|'+A.chat_id, { ...A, active: false });
  assert.equal(adapter.handleEnvelope(success()).status, 'QUARANTINED_UNMATCHED_OR_STALE_UPDATE');
  assert.equal(adapter.markUnknown({ td_extra: 'fake-extra-1' }).status, 'QUARANTINED_UNMATCHED_OR_STALE_EXTRA');
  assert.equal(adapter.events().length, 1);
});
test('fake attempt K cannot be cross-peer, reused or correlated with second attempt', () => {
  const { adapter } = harness();
  assert.equal(fakeAttempt(adapter, { ...A, peer_id: B.peer_id }).status, 'QUARANTINED_STALE_BINDING');
  assert.equal(fakeAttempt(adapter).status, 'CORRELATION_REGISTERED_NO_SEND');
  assert.equal(fakeAttempt(adapter, B, { suffix: '1' }).status, 'DUPLICATE_ATTEMPT_CORRELATION');
  assert.equal(fakeAttempt(adapter, B, { suffix: '2', attempt_id: 'fake-attempt-1' }).status, 'DUPLICATE_ATTEMPT_CORRELATION');
});
test('temporary IDs cannot be reused for different attempts on one TDLib chat', () => {
  const { adapter } = harness();
  fakeAttempt(adapter, A, { suffix: '1', temporary_message_id: 51 });
  assert.equal(fakeAttempt(adapter, A, { suffix: '2', temporary_message_id: 51 }).status, 'DUPLICATE_TEMP_MESSAGE_ID');
});
test('pending response mismatch does not corrupt existing MID, no duplicate double-credit', () => {
  const { adapter } = harness(); fakeAttempt(adapter);
  adapter.handleEnvelope(response());
  assert.equal(adapter.handleEnvelope(response('fake-extra-1', 52)).status, 'QUARANTINED_TEMP_MISMATCH');
  assert.equal(adapter.handleEnvelope(response()).status, 'DUPLICATE_SEND_RESPONSE');
  assert.equal(adapter.events().length, 1);
});
test('receipt-before-response can correlate pre-registered temp id with successful event', () => {
  const { adapter } = harness();
  fakeAttempt(adapter, A, { temporary_message_id: 51 });
  assert.equal(adapter.handleEnvelope(success()).status, 'PROVIDER_SEND_CONFIRMED_NOT_READ');
  assert.equal(adapter.handleEnvelope(response()).status, 'DUPLICATE_TERMINAL_EVENT');
});
test('one synthetic consumer sink failure leaves inbound retry possible', () => {
  let reject = true;
  const ad = createSyntheticTdlibJsonAdapter({
    bindings: [A], currentBinding: () => ({ ...A, active: true }),
    onEvent: () => { if (reject) throw Error('sink failed'); },
  });
  assert.throws(() => ad.handleEnvelope(m()), /sink failed/);
  reject = false;
  assert.equal(ad.handleEnvelope(m()).status, 'SYNTHETIC_INBOUND');
  assert.equal(ad.events().length, 1);
});
test('never imports native TDLib or sends: only event contract methods exposed', () => {
  const { adapter } = harness();
  assert.deepEqual(Object.keys(adapter).sort(),
    ['bindSyntheticAttempt', 'events', 'handleEnvelope', 'markUnknown'].sort());
  assert.equal('sendMessage' in adapter, false);
  assert.equal('td_send' in adapter, false);
});

test('consumer failure cannot poison send receipt terminal state before retry', () => {
  let failSink = true;
  const adapter = createSyntheticTdlibJsonAdapter({
    bindings: [A], currentBinding: () => ({ ...A, active: true }),
    onEvent: (event) => {
      if (failSink && event.kind === 'PROVIDER_SEND_CONFIRMED_NOT_READ') throw Error('sink unavailable');
    },
  });
  fakeAttempt(adapter, A, { temporary_message_id: 51 });
  assert.throws(() => adapter.handleEnvelope(success()), /sink unavailable/);
  assert.equal(adapter.events().length, 0);
  failSink = false;
  assert.equal(adapter.handleEnvelope(success()).status, 'PROVIDER_SEND_CONFIRMED_NOT_READ');
  assert.equal(adapter.events().length, 1);
});
test('consumer failure cannot consume @extra temporary response correlation', () => {
  let failSink = true;
  const adapter = createSyntheticTdlibJsonAdapter({
    bindings: [A], currentBinding: () => ({ ...A, active: true }),
    onEvent: (event) => {
      if (failSink && event.kind === 'SEND_RESPONSE_PENDING_NOT_ACK') throw Error('sink unavailable');
    },
  });
  fakeAttempt(adapter);
  assert.throws(() => adapter.handleEnvelope(response()), /sink unavailable/);
  assert.equal(adapter.events().length, 0);
  failSink = false;
  assert.equal(adapter.handleEnvelope(response()).status, 'SEND_RESPONSE_PENDING_NOT_ACK');
  assert.equal(adapter.events().length, 1);
});
