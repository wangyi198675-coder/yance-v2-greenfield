// W28 / Issue #12. Synthetic Baileys-shaped events only, NOT a Baileys socket.
// No account login, QR, real secrets, network, provider sends or second Outbox.
export const BAILEYS_UPSTREAM = Object.freeze({
  repo: 'https://github.com/WhiskeySockets/Baileys',
  tag: 'v7.0.0-rc14',
  dereferencedCommit: '7e7b0757e3f9f3c7789fb1cfd2f241d5002a199a',
  licenseCandidate: 'MIT',
  runtimeImported: false,
  platformPermission: 'HOLD',
});
const fields = ['tenant', 'account', 'channel', 'peer_id', 'binding_revision'];
const bad = (reason) => { throw new Error(reason); };
const nonempty = (x) => typeof x === 'string' && x.length > 0;
const fake = (s) => nonempty(s) && /^fake-[A-Za-z0-9_-]+$/.test(s);
const exactKeys = (value, allowed) => Object.keys(value).every((k) => allowed.includes(k));
const plain = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const safeRevision = (x) => (Number.isSafeInteger(x) && x > 0) || (typeof x === 'string' && /^fake-[\w-]+$/.test(x));
const frozenK = (identity) => Object.freeze(Object.fromEntries(fields.map((f) => [f, identity[f]])));

export function canonicalK(identity) {
  if (!plain(identity)) bad('MISSING_IDENTITY');
  for (const field of fields) if (identity[field] === undefined || identity[field] === null || String(identity[field]) === '') bad('MISSING_K_' + field);
  if (identity.channel !== 'WHATSAPP_PERSONAL') bad('CHANNEL_SCOPE');
  if (identity.tenant !== 'SYNTHETIC_TEST_ONLY' || !fake(identity.account) || !fake(identity.peer_id) || !safeRevision(identity.binding_revision)) bad('NOT_SYNTHETIC_K');
  return JSON.stringify(fields.map((name) => String(identity[name])));
}

export function validateEncryptedSessionDTO(dto) {
  // Never accepts actual auth bytes, creds, keypairs, cookies or plaintext.
  const allowed = ['format', 'synthetic', 'account', 'binding_revision', 'key_version', 'ciphertext_ref', 'revoked'];
  if (!plain(dto) || !exactKeys(dto, allowed) || dto.format !== 'ENCRYPTED_SESSION_REF_V1' || dto.synthetic !== true || !fake(dto.account) ||
      !safeRevision(dto.binding_revision) || !fake(dto.key_version) || !nonempty(dto.ciphertext_ref) ||
      !/^synthetic:\/\/vault\/fake-[\w/-]+$/.test(dto.ciphertext_ref) || typeof dto.revoked !== 'boolean') {
    bad('ENCRYPTED_SESSION_DTO_ONLY');
  }
  if (dto.revoked) bad('REVOKED_SESSION');
  // Deliberately return only metadata; never a secret-bearing Baileys auth state.
  return Object.freeze({format:dto.format, synthetic:true, account:dto.account, binding_revision:dto.binding_revision, key_version:dto.key_version});
}

const jidRe = /^fake-[A-Za-z0-9_-]+@s\.whatsapp\.net$/;
const lidRe = /^fake-[A-Za-z0-9_-]+@lid$/;
function assertFakeJid(jid, lid = false) {
  if (typeof jid !== 'string' || !(lid ? lidRe : jidRe).test(jid)) bad('REAL_OR_INVALID_JID_FORBIDDEN');
}
function requireMeta(input, account, epoch) {
  if (!plain(input) || input.synthetic !== true || input.channel_account !== account.account ||
      input.binding_revision !== account.binding_revision || input.worker_epoch !== epoch ||
      !fake(input.event_id)) bad('STALE_OR_NON_SYNTHETIC_EVENT');
}
function inboundBody(m) {
  // Data only, never evaluate instructions or HTML.
  const msg = m.message;
  if (!plain(msg) || !nonempty(msg.conversation) || msg.conversation.length > 8192) bad('SYNTHETIC_TEXT_REQUIRED');
  return msg.conversation;
}
function keyOf(key) {
  if (!plain(key) || !fake(key.id) || !nonempty(key.remoteJid) || typeof key.fromMe !== 'boolean') bad('INVALID_SYNTHETIC_MESSAGE_KEY');
  return key;
}

/**
 * @param {object} config
 * @param {object} config.account synthetic account identity (tenant/account/binding_revision)
 * @param {Array<{peer_id:string,jid:string,lid?:string}>} config.peers immutable verified test fixture
 * @param {object} config.deliveryPort injected sole W25 owner; acceptInbound/recordReceipt only
 * @param {object} [config.replayPort] W25-owned claim event id for restart dedupe (no local Outbox)
 */
export function createSyntheticBaileysAdapter({account, peers, deliveryPort, replayPort} = {}) {
  if (!plain(account) || account.tenant !== 'SYNTHETIC_TEST_ONLY' || !fake(account.account) ||
      !safeRevision(account.binding_revision) || account.channel !== 'WHATSAPP_PERSONAL') bad('INVALID_SYNTHETIC_ACCOUNT');
  if (!Array.isArray(peers) || !plain(deliveryPort) || typeof deliveryPort.acceptInbound !== 'function' ||
      typeof deliveryPort.recordReceipt !== 'function') bad('W25_PORT_REQUIRED');
  if (replayPort !== undefined && (!plain(replayPort) || ['reserve','commit','release'].some(k=>typeof replayPort[k] !== 'function'))) bad('INVALID_REPLAY_PORT');
  const owner = Object.freeze({tenant:account.tenant, account:account.account, channel:account.channel, binding_revision:account.binding_revision});
  const byJid = new Map(), byLid = new Map(), byPeer = new Set();
  for (const peer of peers) {
    if (!plain(peer) || !fake(peer.peer_id) || byPeer.has(peer.peer_id)) bad('INVALID_OR_DUPLICATE_PEER');
    assertFakeJid(peer.jid);
    if (byJid.has(peer.jid)) bad('JID_COLLISION');
    if (peer.lid !== undefined) {
      assertFakeJid(peer.lid, true);
      if (byLid.has(peer.lid)) bad('LID_COLLISION');
      byLid.set(peer.lid, peer.peer_id);
    }
    byJid.set(peer.jid, peer.peer_id);
    byPeer.add(peer.peer_id);
  }
  let state = 'DISCONNECTED', epoch = 0, revoked = false;
  const inFlight = new Map(), seen = new Set();
  const status = () => Object.freeze({state, worker_epoch:epoch, account:owner.account, binding_revision:owner.binding_revision, synthetic:true});
  function connectSynthetic(session) {
    if (revoked) bad('ACCOUNT_REVOKED');
    const meta = validateEncryptedSessionDTO(session);
    if (meta.account !== owner.account || meta.binding_revision !== owner.binding_revision) bad('SESSION_BINDING_MISMATCH');
    epoch += 1;
    state = 'CONNECTED_SYNTHETIC';
    return status();
  }
  function disconnectSynthetic() { if (!revoked) state = 'DISCONNECTED'; return status(); }
  function revokeSynthetic() { revoked = true; state = 'REVOKED'; epoch += 1; seen.clear(); inFlight.clear(); return status(); }
  function resolvePeer(raw) {
    assertFakeJid(raw, raw.endsWith('@lid'));
    const id = raw.endsWith('@lid') ? byLid.get(raw) : byJid.get(raw);
    if (!id) bad('UNKNOWN_OR_CROSS_ACCOUNT_PEER');
    const K = frozenK({...owner, peer_id:id});
    canonicalK(K);
    return K;
  }
  async function one(eventKey, execute) {
    // Runtime duplicate suppression; cross-restart authority is the injected W25 replayPort.
    if (seen.has(eventKey)) return Object.freeze({duplicate:true, synthetic:true});
    if (inFlight.has(eventKey)) return inFlight.get(eventKey);
    const task = (async () => {
      let reserved = false;
      try {
        if (replayPort) {
          const owned = await replayPort.reserve(eventKey);
          if (owned !== true) return Object.freeze({duplicate:true, synthetic:true});
          reserved = true;
        }
        if (revoked || state !== 'CONNECTED_SYNTHETIC') bad('WORKER_FENCE_CHANGED');
        const result = await execute(); // W25 must independently check its authoritative fence.
        if (revoked || state !== 'CONNECTED_SYNTHETIC') bad('WORKER_FENCE_CHANGED');
        if (reserved) await replayPort.commit(eventKey);
        seen.add(eventKey);
        return result;
      } catch (error) {
        if (reserved) await replayPort.release(eventKey);
        throw error;
      }
    })();
    inFlight.set(eventKey, task);
    try { return await task; } finally { inFlight.delete(eventKey); }
  }
  async function ingestSynthetic(event) {
    if (revoked || state !== 'CONNECTED_SYNTHETIC') bad('WORKER_NOT_CONNECTED_OR_REVOKED');
    requireMeta(event, owner, epoch);
    if (event.type === 'messages.upsert') {
      if (!Array.isArray(event.messages) || event.messages.length !== 1) bad('ONE_MESSAGE_PER_SYNTHETIC_EVENT');
      const m = event.messages[0], key = keyOf(m?.key);
      if (key.fromMe === true || key.participant !== undefined) bad('OUTBOUND_OR_GROUP_UPSERT_NOT_SUPPORTED');
      const K = resolvePeer(key.remoteJid), text = inboundBody(m);
      const eventKey = canonicalK(K) + '|in|' + key.id;
      return one(eventKey, async () => {
        const payload = Object.freeze({identity:K, canonical_k:canonicalK(K), original:text, provider_mid:key.id,
          provider_key:Object.freeze({remoteJid:key.remoteJid, id:key.id, fromMe:false}),
          event_id:event.event_id, provenance:'BAILEYS_SHAPED_SYNTHETIC_UPSERT', synthetic:true, delivery_status:'NOT_SENT'});
        const receipt = await deliveryPort.acceptInbound(payload);
        if (receipt?.accepted !== true) bad('W25_INBOUND_NOT_ACCEPTED');
        return Object.freeze({accepted:true, inbound:payload});
      });
    }
    if (event.type === 'messages.update' || event.type === 'message-receipt.update') {
      if (!Array.isArray(event.updates) || event.updates.length !== 1) bad('ONE_RECEIPT_PER_SYNTHETIC_EVENT');
      const update = event.updates[0], key = keyOf(update?.key);
      if (key.fromMe !== true || key.participant !== undefined || !fake(update?.attempt_id)) bad('OUTBOUND_RECEIPT_KEY_REQUIRED');
      const K = resolvePeer(key.remoteJid);
      const kind = update?.receipt?.kind;
      const states = {'accepted':'PROVIDER_ACCEPTED_NOT_DELIVERED','timeout':'UNKNOWN','delivered':'ACK_DELIVERED','read':'ACK_READ'};
      if (!Object.hasOwn(states,kind)) bad('UNRECOGNIZED_RECEIPT_NOT_ACK');
      const eventKey = canonicalK(K) + '|receipt|' + key.id + '|' + event.event_id;
      return one(eventKey, async () => {
        const payload = Object.freeze({identity:K, canonical_k:canonicalK(K), provider_mid:key.id,
          provider_key:Object.freeze({remoteJid:key.remoteJid,id:key.id,fromMe:true}),
          attempt_id:update.attempt_id, event_id:event.event_id, raw_kind:kind,
          result:states[kind], synthetic:true, provenance:'BAILEYS_SHAPED_SYNTHETIC_RECEIPT',
          authority:'W25_MESSAGE_DELIVERY_DECIDES_FINAL_STATUS'});
        const receipt = await deliveryPort.recordReceipt(payload);
        if (receipt?.accepted !== true) bad('W25_RECEIPT_NOT_ACCEPTED');
        return Object.freeze({accepted:true, receipt:payload});
      });
    }
    bad('UNSUPPORTED_BAILEYS_EVENT');
  }
  return Object.freeze({connectSynthetic,disconnectSynthetic,revokeSynthetic,ingestSynthetic,status,
    upstream:BAILEYS_UPSTREAM});
}
