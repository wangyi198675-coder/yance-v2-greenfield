/**
 * YANCE V2 nonproduction MessageDelivery; Issue #7.
 * A single durable synthetic sender. This module intentionally has no network connector.
 * W24 owns canonical K; W44 owns grants, custody and budget. Their authoritative
 * eligibility port is mandatory for BOTH admission and just-before-sink validation.
 * SQLite transactions are durable; crossing W24/W44 DB boundaries is NOT atomic yet.
 */
export {createW25NativeInboundPort} from './native-inbound.mjs';
export {createW25NativeChannelOwnerPorts} from './native-channel-owners.mjs';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';

const VALID_CHANNELS = new Set(['FB_PERSONAL', 'FB_PAGE', 'WHATSAPP_PERSONAL', 'TELEGRAM_PERSONAL']);
const SEND_MODES = new Set(['HUMAN', 'AUTO']);
const MIN_K = ['tenantId', 'accountId', 'channel', 'peerId', 'bindingRevision'];
const allowedStr = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 512;
const canonicalJson = (v) => JSON.stringify(v, (_, x) =>
  x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);
const sha = (x) => createHash('sha256').update(canonicalJson(x)).digest('hex');
const peerKey = (k) => sha([k.tenantId, k.accountId, k.channel, k.peerId]);

export class DeliveryError extends Error {
  constructor(code, detail = code) { super(detail); this.name = 'DeliveryError'; this.code = code; }
}

export function assertCanonicalK(k) {
  if (!k || typeof k !== 'object' || MIN_K.some((field) => !allowedStr(k[field]))
      || !VALID_CHANNELS.has(k.channel)) throw new DeliveryError('INVALID_CANONICAL_K');
  return Object.fromEntries(MIN_K.map((key) => [key, k[key]]));
}

export class NativeConnectorSink {
  syntheticOnly = false;
  owner = 'MAUTRIX_META_NATIVE';
  constructor({deliver}={}){
    if(typeof deliver!=='function')throw new DeliveryError('OFFICIAL_NATIVE_DELIVERY_PORT_REQUIRED');
    this.deliver=deliver;
  }
  async send(request){
    if(request?.synthetic!==false||request?.k?.channel!=='FB_PERSONAL'||
       !allowedStr(request?.attemptId)||!allowedStr(request?.intentId)||
       !allowedStr(request?.businessMessageId))
      throw new DeliveryError('OFFICIAL_NATIVE_SINK_INVALID_REQUEST');
    // This is called ONLY by the original W25 durable Outbox, after both
    // current W24/W44 authority checks. It does not create another sender.
    const result=await this.deliver(structuredClone(request));
    // Matrix event acceptance is not a Meta provider ACK. The official
    // provider must prove delivery separately; uncertain results freeze peer.
    if(result?.kind==='REJECTED_NO_SEND'&&result?.beforeNetwork===true)
      return {kind:'REJECTED_NO_SEND'};
    // In production a local Matrix send is never proof of Meta delivery.
    // All actual provider ACK/DELIVERED/READ states are accepted exclusively
    // via W25 recordVerifiedReceipt and its independent trusted verifier.
    return {kind:'UNKNOWN'};
  }
}

export class SyntheticConnectorSink {
  syntheticOnly = true;
  constructor(handler = async ({ attemptId }) =>
    ({ kind: 'ACK', providerMid: 'synthetic:' + attemptId })) {
    if (typeof handler !== 'function') throw new DeliveryError('INVALID_SYNTHETIC_HANDLER');
    this.handler = handler;
    this.calls = [];
  }
  async send(request) {
    this.calls.push(structuredClone(request));
    return this.handler(request);
  }
}

// First-open WAL setup needs a short exclusive database lock. On Windows two
// Node processes can both successfully open the cold file but one journal_mode
// switch returns SQLITE_BUSY even with SQLite's busy handler enabled.
// RETRY ONLY idempotent startup DDL/PRAGMA; NEVER retry an Outbox/ACK/UNKNOWN op.
const INIT_BUSY_MAX_RETRIES = 16;
const INIT_BUSY_WAIT_MS = 40;
const initWaitCell = new Int32Array(new SharedArrayBuffer(4));
function retryBusyDuringStartup(action) {
  for (let retry = 0; ; retry++) {
    try { return action(); }
    catch (error) {
      if (error?.errcode !== 5 || retry >= INIT_BUSY_MAX_RETRIES) throw error;
      Atomics.wait(initWaitCell, 0, 0, INIT_BUSY_WAIT_MS);
    }
  }
}
function initSchema(db) {
  // Keep the entire cold-start retry budget bounded; restore normal 5s
  // transaction busy timeout after setup completes, without retrying sends.
  db.exec('PRAGMA busy_timeout = 250;');
  retryBusyDuringStartup(() => db.exec('PRAGMA journal_mode = WAL;'));
  db.exec('PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;');
  retryBusyDuringStartup(() => db.exec([
    'CREATE TABLE IF NOT EXISTS send_intents (',
    ' id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, account_id TEXT NOT NULL, channel TEXT NOT NULL,',
    ' peer_id TEXT NOT NULL, binding_revision TEXT NOT NULL, business_id TEXT NOT NULL,',
    ' k_json TEXT NOT NULL, payload_json TEXT NOT NULL, payload_hash TEXT NOT NULL, mode TEXT NOT NULL,',
    ' authority_json TEXT NOT NULL, actor_id TEXT NOT NULL, session_id TEXT NOT NULL,',
    ' state TEXT NOT NULL, denial_code TEXT, revision INTEGER NOT NULL DEFAULT 1,',
    ' created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,',
    ' UNIQUE(tenant_id, account_id, channel, peer_id, business_id)',
    ');',
    'CREATE INDEX IF NOT EXISTS idx_intents_peer ON send_intents(tenant_id,account_id,channel,peer_id,state);',
    'CREATE TABLE IF NOT EXISTS recipient_leases (peer_key TEXT PRIMARY KEY, intent_id TEXT NOT NULL, fence INTEGER NOT NULL, acquired_at INTEGER NOT NULL);',
    'CREATE TABLE IF NOT EXISTS recipient_fence_counters (peer_key TEXT PRIMARY KEY, last_fence INTEGER NOT NULL);',
    'CREATE TABLE IF NOT EXISTS outbox_attempts (',
    ' id TEXT PRIMARY KEY, intent_id TEXT NOT NULL UNIQUE REFERENCES send_intents(id),',
    ' peer_key TEXT NOT NULL, recipient_fence INTEGER NOT NULL, binding_revision TEXT NOT NULL,',
    ' page_owner_epoch TEXT, state TEXT NOT NULL, network_boundary_at INTEGER NOT NULL,',
    ' provider_mid TEXT, error_code TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL',
    ');',
    'CREATE TABLE IF NOT EXISTS receipt_events (',
    ' source_event_id TEXT PRIMARY KEY, intent_id TEXT NOT NULL, attempt_id TEXT NOT NULL,',
    ' kind TEXT NOT NULL, provider_mid TEXT NOT NULL, verified_source TEXT NOT NULL, received_at INTEGER NOT NULL',
    ');',
    'CREATE TABLE IF NOT EXISTS audit_events (',
    ' seq INTEGER PRIMARY KEY AUTOINCREMENT, intent_id TEXT NOT NULL, event_type TEXT NOT NULL,',
    ' details TEXT NOT NULL, at INTEGER NOT NULL',
    ');'
  ].join('\n')));
  db.exec('PRAGMA busy_timeout = 5000;');
}
function asIntent(row) {
  if (!row) return null;
  return {
    id: row.id, k: JSON.parse(row.k_json), businessMessageId: row.business_id,
    payload: JSON.parse(row.payload_json), payloadHash: row.payload_hash,
    mode: row.mode, state: row.state, denialCode: row.denial_code,
    authority: JSON.parse(row.authority_json), revision: row.revision,
    actorId: row.actor_id, sessionId: row.session_id
  };
}
function requireAuthorized(intent, proof, time, frozen = null) {
  if (!proof || proof.allowed !== true) throw new DeliveryError(proof?.reason || 'ELIGIBILITY_DENIED');
  const k = assertCanonicalK(proof.k);
  if (canonicalJson(k) !== canonicalJson(intent.k)) throw new DeliveryError('BINDING_STALE');
  if (!allowedStr(proof.custodyEpoch) || !allowedStr(proof.accountEpoch) ||
      !allowedStr(proof.routeRevision)) throw new DeliveryError('AUTHORITY_INCOMPLETE');
  if (proof.accountActive !== true) throw new DeliveryError('ACCOUNT_INACTIVE');
  if (proof.custodyMode !== intent.mode) throw new DeliveryError('CUSTODY_STALE');
  if (proof.budget?.reserved !== true || !allowedStr(proof.budget.reservationId))
    throw new DeliveryError('BUDGET_NOT_RESERVED');
  if (!Number.isFinite(proof.expiresAt) || proof.expiresAt <= time)
    throw new DeliveryError('AUTHORITY_EXPIRED');
  if (intent.mode === 'AUTO') {
    if (proof.agentActive !== true || !allowedStr(proof.agentRevision) ||
        !allowedStr(proof.grantRevision) || proof.grantActive !== true)
      throw new DeliveryError('AUTO_GRANT_INVALID');
  } else if (proof.humanAuthorized !== true) {
    throw new DeliveryError('HUMAN_AUTH_REQUIRED');
  }
  if (intent.k.channel === 'FB_PAGE' && (!allowedStr(proof.pageOwnerEpoch) ||
      !['PANCAKE', 'CHATWOOT'].includes(proof.pageSendOwner) ||
      proof.pageRouteReady !== true)) throw new DeliveryError('PAGE_OWNER_NOT_READY');
  const snapshot = {
    accountEpoch: proof.accountEpoch, custodyEpoch: proof.custodyEpoch,
    custodyMode: proof.custodyMode, routeRevision: proof.routeRevision,
    grantRevision: proof.grantRevision || null, agentRevision: proof.agentRevision || null,
    reservationId: proof.budget.reservationId,
    pageOwnerEpoch: proof.pageOwnerEpoch || null, pageSendOwner: proof.pageSendOwner || null
  };
  if (frozen && canonicalJson(frozen) !== canonicalJson(snapshot))
    throw new DeliveryError('AUTHORITY_REVISION_STALE');
  return snapshot;
}

export class MessageDelivery {
  constructor({ databasePath, eligibility, sink, receiptVerifier, now = () => Date.now() }) {
    if (!allowedStr(databasePath) || !eligibility || typeof eligibility.check !== 'function')
      throw new DeliveryError('AUTHORITY_PORT_REQUIRED');
    if(!((sink instanceof SyntheticConnectorSink && sink.syntheticOnly===true)||
         (sink instanceof NativeConnectorSink && sink.syntheticOnly===false)))
      throw new DeliveryError('SYNTHETIC_SINK_ONLY');
    if (typeof receiptVerifier !== 'function') throw new DeliveryError('RECEIPT_VERIFIER_REQUIRED');
    this.db = new DatabaseSync(databasePath, { timeout: 5000 });
    try { initSchema(this.db); }
    catch (error) { this.db.close(); throw error; }
    this.eligibility = eligibility;
    this.sink = sink;
    this.receiptVerifier = receiptVerifier;
    this.now = now;
  }
  close() { this.db.close(); }
  tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; }
    catch (err) { this.db.exec('ROLLBACK'); throw err; }
  }
  audit(id, type, details = {}) {
    this.db.prepare('INSERT INTO audit_events(intent_id,event_type,details,at) VALUES(?,?,?,?)')
      .run(id, type, canonicalJson(details), this.now());
  }
  getIntent(id) {
    return asIntent(this.db.prepare('SELECT * FROM send_intents WHERE id=?').get(id));
  }
  getAudit(id) {
    return this.db.prepare('SELECT seq,event_type,details,at FROM audit_events WHERE intent_id=? ORDER BY seq').all(id)
      .map((e) => ({ ...e, details: JSON.parse(e.details) }));
  }
  getAttempt(id) { return this.db.prepare('SELECT * FROM outbox_attempts WHERE intent_id=?').get(id) || null; }
  listReceipts(id) {
    return this.db.prepare('SELECT source_event_id,kind,provider_mid,verified_source FROM receipt_events WHERE intent_id=? ORDER BY received_at').all(id);
  }

  async submitIntent({ k: rawK, businessMessageId, payload, mode, actorId, sessionId }) {
    const k = assertCanonicalK(rawK);
    if (!allowedStr(businessMessageId) || !allowedStr(actorId) || !allowedStr(sessionId) ||
        !SEND_MODES.has(mode) || !payload || typeof payload !== 'object' || Array.isArray(payload))
      throw new DeliveryError('INVALID_INTENT');
    if (typeof payload.text !== 'string' || payload.text.length > 20000 ||
        (payload.assetIds !== undefined && (!Array.isArray(payload.assetIds) ||
          payload.assetIds.some((x) => !allowedStr(x)))))
      throw new DeliveryError('INVALID_PAYLOAD');
    if (payload.assetIds?.length) throw new DeliveryError('ASSET_AUTHORITY_NOT_CONNECTED');
    const intent = { k, mode };
    const authority = requireAuthorized(intent,
      await this.eligibility.check({ k, mode, businessMessageId, phase: 'ADMISSION' }), this.now());
    const payloadHash = sha(payload);
    return this.tx(() => {
      const existing = this.db.prepare(
        'SELECT * FROM send_intents WHERE tenant_id=? AND account_id=? AND channel=? AND peer_id=? AND business_id=?'
      ).get(k.tenantId, k.accountId, k.channel, k.peerId, businessMessageId);
      if (existing) {
        if (existing.payload_hash !== payloadHash || existing.binding_revision !== k.bindingRevision ||
            existing.mode !== mode) throw new DeliveryError('BUSINESS_ID_CONFLICT');
        this.audit(existing.id, 'DEDUPLICATED', { actorId, sessionId });
        return { ...asIntent(existing), reused: true };
      }
      const id = randomUUID(), at = this.now();
      this.db.prepare('INSERT INTO send_intents(id,tenant_id,account_id,channel,peer_id,binding_revision,business_id,k_json,payload_json,payload_hash,mode,authority_json,actor_id,session_id,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(id, k.tenantId, k.accountId, k.channel, k.peerId, k.bindingRevision,
          businessMessageId, canonicalJson(k), canonicalJson(payload), payloadHash, mode,
          canonicalJson(authority), actorId, sessionId, 'QUEUED', at, at);
      this.audit(id, 'QUEUED', { businessMessageId, k });
      return { ...this.getIntent(id), reused: false };
    });
  }

  async dispatchOne(id) {
    const initial = this.getIntent(id);
    if (!initial) throw new DeliveryError('NOT_FOUND');
    const key = peerKey(initial.k);
    const claimed = this.tx(() => {
      const row = this.db.prepare('SELECT * FROM send_intents WHERE id=?').get(id);
      if (row.state !== 'QUEUED') return { state: row.state, dispatched: false };
      const lease = this.db.prepare('SELECT * FROM recipient_leases WHERE peer_key=?').get(key);
      if (lease) return { state: 'RECIPIENT_BUSY', dispatched: false };
      const unknown = this.db.prepare(
        "SELECT id FROM send_intents WHERE tenant_id=? AND account_id=? AND channel=? AND peer_id=? AND id<>? AND state IN ('UNKNOWN','IN_FLIGHT') LIMIT 1"
      ).get(initial.k.tenantId,initial.k.accountId,initial.k.channel,initial.k.peerId,id);
      if (unknown) return { state: 'RECIPIENT_UNKNOWN_HOLD', dispatched: false };
      this.db.prepare('INSERT INTO recipient_fence_counters(peer_key,last_fence) VALUES(?,1) ON CONFLICT(peer_key) DO UPDATE SET last_fence=last_fence+1')
        .run(key);
      const fence = this.db.prepare('SELECT last_fence FROM recipient_fence_counters WHERE peer_key=?').get(key).last_fence;
      this.db.prepare('INSERT INTO recipient_leases(peer_key,intent_id,fence,acquired_at) VALUES(?,?,?,?)')
        .run(key,id,fence,this.now());
      this.db.prepare("UPDATE send_intents SET state='CLAIMED',revision=revision+1,updated_at=? WHERE id=?")
        .run(this.now(),id);
      this.audit(id, 'CLAIMED', { key });
      return { state: 'CLAIMED', dispatched: true };
    });
    if (!claimed.dispatched) return claimed;
    const intent = this.getIntent(id);
    try {
      const proof = await this.eligibility.check({
        k: intent.k, mode: intent.mode, businessMessageId: intent.businessMessageId,
        phase: 'PRE_NETWORK', intentId: id
      });
      requireAuthorized(intent, proof, this.now(), intent.authority);
    } catch (err) {
      const code = err.code || 'ELIGIBILITY_ERROR';
      return this.tx(() => {
        this.db.prepare("UPDATE send_intents SET state='DENIED',denial_code=?,revision=revision+1,updated_at=? WHERE id=?")
          .run(code,this.now(),id);
        this.db.prepare('DELETE FROM recipient_leases WHERE peer_key=? AND intent_id=?').run(key,id);
        this.audit(id, 'PRE_NETWORK_DENIED', { code });
        return { state: 'DENIED', denialCode: code, dispatched: false };
      });
    }
    const attemptId = randomUUID();
    this.tx(() => {
      const lease = this.db.prepare('SELECT * FROM recipient_leases WHERE peer_key=?').get(key);
      if (!lease || lease.intent_id !== id) throw new DeliveryError('LEASE_STALE');
      const row = this.db.prepare('SELECT state FROM send_intents WHERE id=?').get(id);
      if (row.state !== 'CLAIMED') throw new DeliveryError('INTENT_STALE');
      this.db.prepare('INSERT INTO outbox_attempts(id,intent_id,peer_key,recipient_fence,binding_revision,page_owner_epoch,state,network_boundary_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(attemptId,id,key,lease.fence,intent.k.bindingRevision,
          intent.authority.pageOwnerEpoch, 'IN_FLIGHT',this.now(),this.now(),this.now());
      this.db.prepare("UPDATE send_intents SET state='IN_FLIGHT',revision=revision+1,updated_at=? WHERE id=?").run(this.now(),id);
      this.audit(id, this.sink.syntheticOnly?'SYNTHETIC_BOUNDARY_ENTERED':'NATIVE_BOUNDARY_ENTERED',
        { attemptId, recipientFence: lease.fence });
    });
    // Recheck once more AFTER recording the durable attempt and as close as
    // possible to the synthetic side-effect. W44's existing PRE_NETWORK port
    // is reused: do not invent a parallel eligibility/authorization system.
    // This narrows the cross-DB TOCTOU gap; it does NOT make W24/W44/W25 atomic.
    try {
      const finalProof = await this.eligibility.check({
        k: intent.k, mode: intent.mode, businessMessageId: intent.businessMessageId,
        phase: 'PRE_NETWORK', intentId: id
      });
      requireAuthorized(intent, finalProof, this.now(), intent.authority);
    } catch (err) {
      const code = err.code || 'ELIGIBILITY_ERROR';
      return this.tx(() => {
        const row = this.db.prepare('SELECT state FROM send_intents WHERE id=?').get(id);
        if (row?.state !== 'IN_FLIGHT') throw new DeliveryError('BOUNDARY_STATE_STALE');
        this.db.prepare("UPDATE send_intents SET state='DENIED',denial_code=?,revision=revision+1,updated_at=? WHERE id=?")
          .run(code,this.now(),id);
        this.db.prepare("UPDATE outbox_attempts SET state='NOT_SENT_AUTHORITY_DENIED',error_code=?,updated_at=? WHERE id=?")
          .run(code,this.now(),attemptId);
        this.db.prepare('DELETE FROM recipient_leases WHERE peer_key=? AND intent_id=?').run(key,id);
        this.audit(id,'FINAL_BOUNDARY_DENIED_NO_SEND',{code,attemptId});
        return {state:'DENIED',denialCode:code,dispatched:false,attemptId};
      });
    }
    let result;
    try {
      result = await this.sink.send({
        synthetic: this.sink.syntheticOnly, intentId: id, attemptId, k: structuredClone(intent.k),
        payload: structuredClone(intent.payload), businessMessageId: intent.businessMessageId,
        pageOwnerEpoch: intent.authority.pageOwnerEpoch
      });
    } catch {
      result = { kind: 'UNKNOWN' };
    }
    return this.tx(() => {
      const ack = result?.kind === 'ACK' && allowedStr(result.providerMid);
      const rejected = result?.kind === 'REJECTED_NO_SEND';
      const state = ack ? (this.sink.syntheticOnly?'ACKED_SYNTHETIC':'ACKED_NATIVE') :
        rejected ? 'REJECTED_NO_SEND' : 'UNKNOWN';
      this.db.prepare('UPDATE send_intents SET state=?,revision=revision+1,updated_at=? WHERE id=?')
        .run(state,this.now(),id);
      this.db.prepare('UPDATE outbox_attempts SET state=?,provider_mid=?,error_code=?,updated_at=? WHERE id=?')
        .run(state,ack?result.providerMid:null,state==='UNKNOWN'?'UNCONFIRMED_NETWORK_OUTCOME':null,this.now(),attemptId);
      this.db.prepare('DELETE FROM recipient_leases WHERE peer_key=? AND intent_id=?').run(key,id);
      this.audit(id,this.sink.syntheticOnly?'SYNTHETIC_RESULT':'NATIVE_RESULT',
       {state,attemptId,providerMid:ack?result.providerMid:null});
      return { state, dispatched: true, attemptId, providerMid:ack?result.providerMid:null };
    });
  }

  // A restarted Worker cannot retry a potentially transmitted in-flight attempt.
  recoverInterrupted({ olderThanMs = 60000 } = {}) {
    if (!Number.isFinite(olderThanMs) || olderThanMs < 1)
      throw new DeliveryError('INVALID_RECOVERY_AGE');
    return this.tx(() => {
      const cutoff = this.now() - olderThanMs;
      const inflight = this.db.prepare(
        "SELECT i.id FROM send_intents i JOIN outbox_attempts a ON a.intent_id=i.id WHERE i.state='IN_FLIGHT' AND a.network_boundary_at<=?"
      ).all(cutoff);
      const claimed = this.db.prepare(
        "SELECT i.id FROM send_intents i JOIN recipient_leases l ON l.intent_id=i.id WHERE i.state='CLAIMED' AND l.acquired_at<=?"
      ).all(cutoff);
      for (const { id } of inflight) {
        this.db.prepare("UPDATE send_intents SET state='UNKNOWN',revision=revision+1,updated_at=? WHERE id=?").run(this.now(),id);
        this.db.prepare("UPDATE outbox_attempts SET state='UNKNOWN',error_code='CRASH_AFTER_BOUNDARY',updated_at=? WHERE intent_id=?").run(this.now(),id);
        this.audit(id,'CRASH_RECOVERY_UNKNOWN');
      }
      for (const { id } of claimed) {
        this.db.prepare("UPDATE send_intents SET state='QUEUED',revision=revision+1,updated_at=? WHERE id=?").run(this.now(),id);
        this.audit(id,'CRASH_BEFORE_BOUNDARY_REQUEUED');
      }
      for (const { id } of [...inflight, ...claimed]) {
        this.db.prepare('DELETE FROM recipient_leases WHERE intent_id=?').run(id);
      }
      return { unknown: inflight.length, safeRequeued: claimed.length };
    });
  }

  async recordVerifiedReceipt(event) {
    if (!event || !allowedStr(event.sourceEventId) || !allowedStr(event.intentId) ||
        !allowedStr(event.attemptId) || !allowedStr(event.providerMid) ||
        !['ACK','DELIVERED','READ'].includes(event.kind))
      throw new DeliveryError('INVALID_RECEIPT');
    const verification = await this.receiptVerifier(event);
    if (!verification || verification.verified !== true || !allowedStr(verification.source))
      throw new DeliveryError('RECEIPT_UNVERIFIED');
    return this.tx(() => {
      const i = this.db.prepare('SELECT * FROM send_intents WHERE id=?').get(event.intentId);
      const a = this.db.prepare('SELECT * FROM outbox_attempts WHERE id=? AND intent_id=?').get(event.attemptId,event.intentId);
      if (!i || !a || event.bindingRevision !== i.binding_revision ||
          event.channel !== i.channel || event.accountId !== i.account_id ||
          event.peerId !== i.peer_id || (i.channel === 'FB_PAGE' &&
            event.pageOwnerEpoch !== a.page_owner_epoch) ||
          (a.provider_mid && a.provider_mid !== event.providerMid))
        throw new DeliveryError('RECEIPT_IDENTITY_MISMATCH');
      if (['REJECTED_NO_SEND','DENIED','CANCELLED'].includes(i.state))
        throw new DeliveryError('RECEIPT_STATE_CONFLICT');
      const existing = this.db.prepare('SELECT * FROM receipt_events WHERE source_event_id=?').get(event.sourceEventId);
      if (existing) {
        if (existing.intent_id !== event.intentId || existing.attempt_id !== event.attemptId ||
            existing.kind !== event.kind || existing.provider_mid !== event.providerMid ||
            existing.verified_source !== verification.source)
          throw new DeliveryError('RECEIPT_REPLAY_CONFLICT');
        return { state: i.state, duplicate: true };
      }
      this.db.prepare('INSERT INTO receipt_events(source_event_id,intent_id,attempt_id,kind,provider_mid,verified_source,received_at) VALUES(?,?,?,?,?,?,?)')
        .run(event.sourceEventId,event.intentId,event.attemptId,event.kind,event.providerMid,verification.source,this.now());
      const native=this.sink.syntheticOnly===false;
      const suffix=native?'NATIVE':'SYNTHETIC';
      const priority = { UNKNOWN: 0, IN_FLIGHT: 0, ACKED_SYNTHETIC: 1, DELIVERED_SYNTHETIC: 2, READ_SYNTHETIC: 3,
        ACKED_NATIVE:1,DELIVERED_NATIVE:2,READ_NATIVE:3 };
      const proposed = event.kind === 'ACK' ? 'ACKED_'+suffix :
        event.kind === 'DELIVERED' ? 'DELIVERED_'+suffix : 'READ_'+suffix;
      const state = (priority[proposed] > (priority[i.state] ?? -1)) ? proposed : i.state;
      this.db.prepare('UPDATE send_intents SET state=?,revision=revision+1,updated_at=? WHERE id=?').run(state,this.now(),event.intentId);
      this.db.prepare('UPDATE outbox_attempts SET state=?,provider_mid=?,updated_at=? WHERE id=?')
        .run(state,event.providerMid,this.now(),event.attemptId);
      this.audit(event.intentId,native?'VERIFIED_NATIVE_RECEIPT':'VERIFIED_SYNTHETIC_RECEIPT',
        {sourceEventId:event.sourceEventId,kind:event.kind,state});
      return { state, duplicate: false };
    });
  }
}
