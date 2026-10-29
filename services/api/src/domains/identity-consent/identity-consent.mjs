// W24 Issue #4. Legacy synthetic plus W44-backed strict durable IdentityConsent domain.
import {createDurableIdentityDriver} from './durable-identity.mjs';
// No production authentication, network listener, database, platform credentials or send.
const CHANNELS = new Set(['FB_PERSONAL', 'FB_PAGE', 'WHATSAPP_PERSONAL', 'TELEGRAM_PERSONAL']);
const SEND_OPERATIONS = new Set(['SEND_MESSAGE', 'SEND_MEDIA']);
const CONSENT_OPERATIONS = new Set([
  'AVATAR_EDIT', 'VOICE_SYNTHESIS', 'VOICE_PREVIEW',
  'RECORDING', 'SEND_MEDIA', 'PERSISTENT_LEARNING', 'ASSET_READ'
]);
const ALLOWED_OPERATIONS = new Set([...SEND_OPERATIONS, ...CONSENT_OPERATIONS, 'READ_INBOUND']);
const SYNTHETIC_TENANT = 'SYNTHETIC_TEST_ONLY';

export class IdentityDenied extends Error {
  constructor(code) { super(code); this.name = 'IdentityDenied'; this.code = code; }
}
function deny(code) { throw new IdentityDenied(code); }
function id(value, field) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{1,120}$/.test(value)) deny('INVALID_' + field);
  return value;
}
function revision(value, field = 'BINDING_REVISION') {
  if (!Number.isSafeInteger(value) || value < 1) deny('INVALID_' + field);
  return value;
}
function synthetic(tenant) {
  if (tenant !== SYNTHETIC_TENANT) deny('NONPRODUCTION_TENANT_ONLY');
}
function accountKey(v) {
  return JSON.stringify([v.tenant, v.account, v.channel]);
}
function peerKey(v) {
  return JSON.stringify([v.tenant, v.account, v.channel, v.peer_id]);
}
export function canonicalK(raw) {
  if (!raw || typeof raw !== 'object') deny('MISSING_K');
  const tenant = id(raw.tenant, 'TENANT');
  synthetic(tenant);
  const account = id(raw.account, 'ACCOUNT');
  const channel = id(raw.channel, 'CHANNEL');
  if (!CHANNELS.has(channel)) deny('BAD_CHANNEL');
  const peer_id = id(raw.peer_id, 'PEER');
  const binding_revision = revision(raw.binding_revision);
  // Delimiter-safe, stable across W09's exact M0 five-component K.
  return [tenant, account, channel, peer_id, binding_revision].join('|');
}
function validateAccount(raw) {
  if (!raw) deny('ACCOUNT_MISSING');
  synthetic(raw.tenant);
  id(raw.account, 'ACCOUNT');
  if (!CHANNELS.has(raw.channel)) deny('BAD_CHANNEL');
  return raw;
}
function context(ctx) {
  if (!ctx || typeof ctx !== 'object') deny('AUTHORITY_UNAVAILABLE');
  synthetic(ctx.tenant);
  id(ctx.principal_id, 'PRINCIPAL');
  if (!['CONTACT', 'SELF_PRIVATE'].includes(ctx.input_domain)) deny('INVALID_INPUT_DOMAIN');
  return ctx;
}
function snapshot(obj) { return Object.freeze({ ...obj }); }
function requireExpected(actual, expected, type = 'BINDING') {
  revision(expected, 'EXPECTED_' + type + '_REVISION');
  if (actual !== expected) deny('STALE_' + type + '_REVISION');
}
function checkTime(now) {
  if (!Number.isSafeInteger(now) || now < 0) deny('INVALID_SERVER_TIME');
  return now;
}

/**
 * Entrypoints accept ONLY trusted in-process service auth context, never raw HTTP user claims.
 * grantAuthority.evaluate({ctx,k,operation,now}) is an external W44 port; no grants are stored here.
 * proofAuthority.evaluate({ctx,proof_ref,purpose,operation,subject_id}) is an external proof verifier.
 * Neither dependency is substituted by a permissive default.
 */
export class IdentityConsentService {
  #accounts = new Map();
  #peers = new Set();
  #consentEpochs = new Map();
  #consents = new Map();
  #privacyEvents = [];
  #revocationRequests = new Map();
  #grantAuthority;
  #proofAuthority;
  #durable = null;

  constructor({grantAuthority = null, proofAuthority = null,
    requireDurableIdentity = false, durableAuthority = null} = {}) {
    this.#grantAuthority = grantAuthority;
    this.#proofAuthority = proofAuthority;
    if(requireDurableIdentity){
      this.#durable = createDurableIdentityDriver({
        store:durableAuthority,proofAuthority,grantAuthority
      });
    }
  }

  get isDurableIdentity(){return this.#durable!==null}

  /** Strict mode mutates ONLY W44's same-transaction account/consent/custody rows. */
  takeover(ctx,k,expected){if(!this.#durable)deny('DURABLE_TAKEOVER_REQUIRED');
    return this.#durable.takeover(ctx,k,expected)}
  mutationResult(ctx,requestId){if(!this.#durable)deny('DURABLE_MUTATION_REQUIRED');
    return this.#durable.reconcile(ctx,requestId)}
  finalizePendingMutation(ctx,requestId,typedPayload){
    if(!this.#durable)deny('DURABLE_MUTATION_REQUIRED');
    return this.#durable.finishPending(ctx,requestId,typedPayload)}


  registerAccount(ctx, raw) {
    if(this.#durable)return this.#durable.registerAccount(ctx,raw);
    context(ctx); validateAccount(raw);
    if (ctx.tenant !== raw.tenant) deny('TENANT_MISMATCH');
    if (raw.principal_id !== ctx.principal_id) deny('ACCOUNT_OWNER_MISMATCH');
    revision(raw.binding_revision);
    const k = accountKey(raw);
    if (this.#accounts.has(k)) deny('ACCOUNT_ALREADY_BOUND');
    const record = {
      tenant: raw.tenant, account: raw.account, channel: raw.channel,
      owner_principal_id: ctx.principal_id, binding_revision: raw.binding_revision,
      revocation_epoch: 0, active: true
    };
    this.#accounts.set(k, record);
    return snapshot(record);
  }

  bindPeer(ctx, raw) {
    if(this.#durable)return this.#durable.bindPeer(ctx,raw);
    context(ctx); validateAccount(raw); id(raw.peer_id, 'PEER');
    const account = this.#ownedAccount(ctx, raw);
    if (!account.active) deny('ACCOUNT_UNBOUND');
    this.#peers.add(peerKey(raw));
    return snapshot({tenant: account.tenant, account: account.account,
      channel: account.channel, peer_id: raw.peer_id, binding_revision: account.binding_revision,
      identity_key: canonicalK({...raw, binding_revision: account.binding_revision})});
  }

  currentK(ctx, raw) {
    if(this.#durable)return this.#durable.current(ctx,raw);
    context(ctx); validateAccount(raw); id(raw.peer_id, 'PEER');
    const account = this.#ownedAccount(ctx, raw);
    if (!account.active || !this.#peers.has(peerKey(raw))) deny('ACCOUNT_OR_PEER_UNBOUND');
    const k = {tenant: account.tenant, account: account.account, channel: account.channel,
      peer_id: raw.peer_id, binding_revision: account.binding_revision};
    return snapshot({...k, identity_key: canonicalK(k), account_revocation_epoch: account.revocation_epoch});
  }

  assertCurrent(ctx, k) {
    if(this.#durable)return this.#durable.current(ctx,k);
    context(ctx); canonicalK(k);
    const account = this.#ownedAccount(ctx, k);
    if (!account.active || !this.#peers.has(peerKey(k))) deny('ACCOUNT_OR_PEER_UNBOUND');
    if (account.binding_revision !== k.binding_revision) deny('STALE_BINDING_REVISION');
    return this.currentK(ctx, k);
  }

  /** Peer-scoped synthetic revision for W44 reservation/dispatch fencing.
   * No hardcoded consent epoch: every create/revoke changes this authority. */
  readConsentEpoch(ctx, k) {
    if(this.#durable)return this.#durable.epoch(ctx,k);
    this.assertCurrent(ctx, k);
    return this.#consentEpochs.get(peerKey(k)) ?? 1;
  }

  #bumpConsentEpoch(k) {
    const key = peerKey(k);
    this.#consentEpochs.set(key, (this.#consentEpochs.get(key) ?? 1) + 1);
  }

  invalidateAccount(ctx, {tenant, account, channel, peer_id, expected_revision, idempotency_key} = {}) {
    if(this.#durable)return this.#durable.revokeAccount(ctx,{
      tenant,account,channel,peer_id,expected_revision,idempotency_key});
    context(ctx);
    const record = this.#ownedAccount(ctx, {tenant, account, channel});
    requireExpected(record.binding_revision, expected_revision);
    record.binding_revision += 1;
    record.revocation_epoch += 1;
    record.active = false;
    // Provider re-binding must not silently resurrect old peer membership.
    // Explicit bindPeer after relink is required for each newly verified peer.
    for (const p of this.#peers) {
      const [t, a, c] = JSON.parse(p);
      if (t === tenant && a === account && c === channel) this.#peers.delete(p);
    }
    this.#privacyEvents.push(snapshot({
      event_id: 'fake-identity-event-' + this.#privacyEvents.length,
      type: 'ACCOUNT_BINDING_INVALIDATED', tenant, account, channel,
      owner_principal_id: record.owner_principal_id,
      binding_revision: record.binding_revision, revocation_epoch: record.revocation_epoch
    }));
    return snapshot(record);
  }

  relinkAccount(ctx, {tenant, account, channel, peer_id, expected_revision,
    binding_proof_ref, idempotency_key} = {}) {
    if(this.#durable)return this.#durable.relinkAccount(ctx,{
      tenant,account,channel,peer_id,expected_revision,binding_proof_ref,idempotency_key});
    // Explicit synthetic relink; channel credential verification belongs solely to W26-W29.
    context(ctx);
    const record = this.#ownedAccount(ctx, {tenant, account, channel});
    requireExpected(record.binding_revision, expected_revision);
    if (record.active) deny('ACCOUNT_ALREADY_ACTIVE');
    record.binding_revision += 1;
    record.revocation_epoch += 1;
    record.active = true;
    return snapshot(record);
  }

  createConsent(ctx, input) {
    if(this.#durable)return this.#durable.createConsent(ctx,input);
    context(ctx);
    const k = this.assertCurrent(ctx, input.k);
    const consent_id = id(input.consent_id, 'CONSENT_ID');
    const subject_id = id(input.subject_id, 'SUBJECT_ID');
    const purpose = id(input.purpose, 'PURPOSE');
    const operation = id(input.operation, 'OPERATION');
    if (!CONSENT_OPERATIONS.has(operation)) deny('CONSENT_OPERATION_NOT_ALLOWED');
    if (this.#consents.has(consent_id)) deny('DUPLICATE_CONSENT');
    const proof_ref = id(input.proof_ref, 'PROOF_REF');
    const expires_at = checkTime(input.expires_at);
    const created_at = checkTime(input.now ?? Date.now());
    if (expires_at <= created_at) deny('CONSENT_EXPIRED');
    // Caller cannot set status/verified. Independent proof port must prove eligible.
    const proof = this.#proofAuthority?.evaluate?.({
      ctx: snapshot(ctx), proof_ref, purpose, operation, subject_id
    });
    if (proof && typeof proof.then === 'function') deny('ASYNC_PROOF_NOT_SUPPORTED');
    // A proof adapter can be re-entrant. Fail closed if it revoked/rebound K.
    const afterProof = this.assertCurrent(ctx, input.k);
    if (afterProof.account_revocation_epoch !== k.account_revocation_epoch)
      deny('AUTHORITY_EPOCH_CHANGED');
    const rec = {
      consent_id, subject_id, purpose, operation, proof_ref,
      tenant: k.tenant, account: k.account, channel: k.channel, peer_id: k.peer_id,
      binding_revision: k.binding_revision, owner_principal_id: ctx.principal_id,
      consent_revision: 1, revocation_epoch: 0,
      status: proof?.approved === true ? 'ACTIVE' : 'EVIDENCE_PENDING',
      expires_at
    };
    this.#consents.set(consent_id, rec);
    this.#bumpConsentEpoch(k);
    return snapshot({...rec, consent_epoch: this.readConsentEpoch(ctx, k)});
  }

  revokeConsent(ctx, {consent_id, expected_revision, idempotency_key, k} = {}) {
    if(this.#durable)return this.#durable.revokeConsent(ctx,{
      consent_id,expected_revision,idempotency_key,k});
    context(ctx);
    id(idempotency_key, 'IDEMPOTENCY_KEY');
    id(consent_id, 'CONSENT_ID');
    const rec = this.#consents.get(consent_id);
    if (!rec) deny('CONSENT_MISSING');
    if (rec.tenant !== ctx.tenant || rec.owner_principal_id !== ctx.principal_id) deny('CONSENT_SCOPE_DENIED');
    const idemp = JSON.stringify([rec.tenant, consent_id, ctx.principal_id, idempotency_key]);
    if (this.#revocationRequests.has(idemp)) return this.#revocationRequests.get(idemp);
    requireExpected(rec.consent_revision, expected_revision, 'CONSENT');
    if (rec.status === 'REVOKED') deny('CONSENT_REVOKED');
    rec.consent_revision += 1;
    rec.revocation_epoch += 1;
    rec.status = 'REVOKED';
    this.#bumpConsentEpoch(rec);
    const consentEpoch = this.#consentEpochs.get(peerKey(rec));
    const event = snapshot({
      event_id: 'fake-privacy-event-' + this.#privacyEvents.length,
      type: 'CONSENT_REVOKED', tenant: rec.tenant, account: rec.account,
      channel: rec.channel, peer_id: rec.peer_id, consent_id,
      owner_principal_id: rec.owner_principal_id,
      consent_revision: rec.consent_revision, revocation_epoch: rec.revocation_epoch,
      consent_epoch: consentEpoch
    });
    this.#privacyEvents.push(event);
    const receipt = snapshot({
      consent_id, status: rec.status, consent_revision: rec.consent_revision,
      revocation_epoch: rec.revocation_epoch, consent_epoch: consentEpoch,
      event_id: event.event_id
    });
    this.#revocationRequests.set(idemp, receipt);
    return receipt;
  }

  privacyEvents(ctx) {
    if(this.#durable)deny('DURABLE_PRIVACY_AUDIT_READ_UNAVAILABLE');
    context(ctx);
    return this.#privacyEvents.filter(e => e.tenant === ctx.tenant && e.owner_principal_id === ctx.principal_id)
      .map(e => snapshot(e));
  }

  /**
   * Evaluate at EVERY sensitive operation (W25 repeats it at the irreversible send boundary).
   * Never accept a prior allow response as a durable authorization snapshot.
   */
  evaluate(ctx, {k, operation, purpose = null, consent_id = null, now = Date.now()}) {
    if(this.#durable)return this.#durable.evaluate(ctx,{
      k,operation,purpose,consent_id,now});
    const current = this.assertCurrent(ctx, k);
    checkTime(now);
    const startingConsentEpoch = this.readConsentEpoch(ctx, k);
    if (!ALLOWED_OPERATIONS.has(operation)) deny('UNSUPPORTED_OPERATION');
    if (ctx.input_domain !== 'CONTACT') deny('INPUT_DOMAIN_MISMATCH');
    if (CONSENT_OPERATIONS.has(operation)) {
      id(consent_id, 'CONSENT_ID');
      const rec = this.#consents.get(consent_id);
      if (!rec) deny('CONSENT_MISSING');
      if (rec.tenant !== current.tenant || rec.account !== current.account ||
          rec.channel !== current.channel || rec.peer_id !== current.peer_id ||
          rec.owner_principal_id !== ctx.principal_id) deny('CONSENT_SCOPE_DENIED');
      if (rec.binding_revision !== current.binding_revision) deny('STALE_CONSENT_BINDING');
      if (rec.operation !== operation || rec.purpose !== purpose) deny('CONSENT_PURPOSE_DENIED');
      if (rec.status !== 'ACTIVE') deny(rec.status === 'REVOKED' ? 'CONSENT_REVOKED' : 'PROOF_NOT_VERIFIED');
      if (now >= rec.expires_at) deny('CONSENT_EXPIRED');
    }
    if (SEND_OPERATIONS.has(operation)) {
      if (typeof this.#grantAuthority?.evaluate !== 'function') deny('GRANT_AUTHORITY_UNAVAILABLE');
      const grant = this.#grantAuthority.evaluate({ctx: snapshot(ctx), k: snapshot(current), operation, now});
      if (grant && typeof grant.then === 'function') deny('ASYNC_GRANT_NOT_SUPPORTED');
      // Independent W44 service must bind its server-authenticated decision to current immutable K.
      if (!grant || grant.allowed !== true || grant.identity_key !== current.identity_key ||
          grant.agent_active !== true || !Number.isSafeInteger(grant.grant_revision) ||
          grant.grant_revision < 1 || !Number.isSafeInteger(grant.expires_at) ||
          grant.expires_at <= now || grant.revoked === true) deny('GRANT_NOT_EFFECTIVE');
      // W44 may read/mutate bindings or consent during grant evaluation.
      // A previously valid proof cannot survive a re-entrant revocation/rebind.
      const afterGrant = this.assertCurrent(ctx, k);
      if (afterGrant.account_revocation_epoch !== current.account_revocation_epoch ||
          this.readConsentEpoch(ctx, k) !== startingConsentEpoch)
        deny('AUTHORITY_EPOCH_CHANGED');
    }
    return snapshot({
      allowed: true, identity_key: current.identity_key,
      binding_revision: current.binding_revision, account_revocation_epoch: current.account_revocation_epoch,
      consent_epoch: startingConsentEpoch,
      operation, purpose, checked_at: now, reversible_snapshot_only: true
    });
  }

  #ownedAccount(ctx, raw) {
    validateAccount(raw);
    if (raw.tenant !== ctx.tenant) deny('TENANT_MISMATCH');
    const record = this.#accounts.get(accountKey(raw));
    if (!record) deny('ACCOUNT_UNBOUND');
    if (record.owner_principal_id !== ctx.principal_id) deny('ACCOUNT_OWNER_MISMATCH');
    return record;
  }
}
