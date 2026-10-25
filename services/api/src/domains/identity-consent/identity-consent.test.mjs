import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {IdentityConsentService, IdentityDenied, canonicalK} from './identity-consent.mjs';

const tenant = 'SYNTHETIC_TEST_ONLY';
const ctx = (principal_id = 'fake-owner-1') => ({tenant, principal_id, input_domain: 'CONTACT'});
const base = (account = 'fixture-account-1', peer_id = 'fake-peer-001', channel = 'FB_PERSONAL') =>
  ({tenant, account, channel, peer_id});
const rejects = (f, code) => assert.throws(f, e => e instanceof IdentityDenied && e.code === code);
const approvedProof = {evaluate: ({proof_ref}) => ({approved: proof_ref === 'fake-proof-approved'})};
function approvedGrant(identity_key) {
  return {allowed: true, identity_key, agent_active: true, grant_revision: 1, expires_at: 100000, revoked: false};
}
function fixture(extra = {}) {
  const owned = ctx();
  const grantAuthority = extra.grantAuthority ?? null;
  const proofAuthority = Object.hasOwn(extra, 'proofAuthority') ? extra.proofAuthority : approvedProof;
  const service = new IdentityConsentService({grantAuthority, proofAuthority});
  const a = base();
  service.registerAccount(owned, {...a, principal_id: owned.principal_id, binding_revision: 1});
  service.bindPeer(owned, a);
  const k = service.currentK(owned, a);
  return {service, owned, a, k};
}
function consentInput(k, operation = 'VOICE_SYNTHESIS', purpose = 'PRIVATE_PERSONALIZATION') {
  return {k, consent_id: 'fake-consent-1', subject_id: 'fake-person-1',
    proof_ref: 'fake-proof-approved', operation, purpose, expires_at: 5000, now: 100};
}
function allowedConsent(service, owned, k, operation = 'VOICE_SYNTHESIS', purpose = 'PRIVATE_PERSONALIZATION', consent_id = 'fake-consent-1') {
  return service.evaluate(owned, {k, operation, purpose, consent_id, now: 300});
}

test('identity K strictly preserves W09 M0 five parts and synthetic-only tenant', () => {
  const {k} = fixture();
  assert.equal(k.identity_key, 'SYNTHETIC_TEST_ONLY|fixture-account-1|FB_PERSONAL|fake-peer-001|1');
  assert.equal(canonicalK(k), k.identity_key);
  rejects(() => canonicalK({...k, binding_revision: 0}), 'INVALID_BINDING_REVISION');
  rejects(() => canonicalK({...k, tenant: 'live-tenant'}), 'NONPRODUCTION_TENANT_ONLY');
  rejects(() => canonicalK({...k, account: 'account|spoof'}), 'INVALID_ACCOUNT');
  rejects(() => canonicalK({...k, channel: 'FB_BOT'}), 'BAD_CHANNEL');
});

test('all 120 frozen fictional contacts map to unique full-K without network/provider access', () => {
  const path = new URL('../../../../../design/fixtures/synthetic_120_contacts.json', import.meta.url);
  const source = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(source.banner, 'OFFLINE_SYNTHETIC_FIXTURE_NOT_REAL_USER_OR_PROVIDER');
  assert.equal(source.contacts.length, 120);
  const service = new IdentityConsentService();
  const owner = ctx();
  const accounts = new Set();
  const seen = new Set();
  for (const c of source.contacts) {
    const id = JSON.stringify([c.tenant, c.account, c.channel]);
    if (!accounts.has(id)) {
      service.registerAccount(owner, {...c, principal_id: owner.principal_id});
      accounts.add(id);
    }
    service.bindPeer(owner, c);
    const found = service.currentK(owner, c);
    assert.equal(found.identity_key, canonicalK(c));
    assert.equal(found.binding_revision, c.binding_revision);
    assert.ok(!seen.has(found.identity_key), 'duplicate full K');
    seen.add(found.identity_key);
  }
  assert.equal(seen.size, 120);
});

test('duplicate account enrollment and forged owner cannot seize identity', () => {
  const {service, owned, a} = fixture();
  rejects(() => service.registerAccount(owned, {...a, principal_id: owned.principal_id, binding_revision: 1}), 'ACCOUNT_ALREADY_BOUND');
  rejects(() => service.bindPeer(ctx('fake-other-owner'), a), 'ACCOUNT_OWNER_MISMATCH');
  rejects(() => service.currentK(ctx('fake-other-owner'), a), 'ACCOUNT_OWNER_MISMATCH');
});

test('same provider peer text across accounts and channels never shares K', () => {
  const {service, owned, a, k} = fixture();
  const other = base('fixture-account-2', a.peer_id);
  service.registerAccount(owned, {...other, principal_id: owned.principal_id, binding_revision: 1});
  service.bindPeer(owned, other);
  assert.notEqual(k.identity_key, service.currentK(owned, other).identity_key);
  const otherChannel = base(a.account, a.peer_id, 'WHATSAPP_PERSONAL');
  service.registerAccount(owned, {...otherChannel, principal_id: owned.principal_id, binding_revision: 1});
  service.bindPeer(owned, otherChannel);
  assert.notEqual(k.identity_key, service.currentK(owned, otherChannel).identity_key);
});

test('unbound peer and wrong tenant fail closed', () => {
  const {service, owned, a} = fixture();
  rejects(() => service.currentK(owned, {...a, peer_id: 'fake-never-bound'}), 'ACCOUNT_OR_PEER_UNBOUND');
  rejects(() => service.currentK({...owned, tenant: 'OTHER'}, a), 'NONPRODUCTION_TENANT_ONLY');
});

test('account invalidation increases revision and epoch, old K rejected', () => {
  const {service, owned, a, k} = fixture();
  const revoked = service.invalidateAccount(owned, {...a, expected_revision: 1});
  assert.equal(revoked.binding_revision, 2);
  assert.equal(revoked.revocation_epoch, 1);
  rejects(() => service.assertCurrent(owned, k), 'ACCOUNT_OR_PEER_UNBOUND');
  rejects(() => service.invalidateAccount(owned, {...a, expected_revision: 1}), 'STALE_BINDING_REVISION');
  assert.equal(service.privacyEvents(owned).at(-1).type, 'ACCOUNT_BINDING_INVALIDATED');
});

test('explicit relink does not resurrect old K or attached consents', () => {
  const {service, owned, a, k} = fixture();
  service.createConsent(owned, consentInput(k));
  service.invalidateAccount(owned, {...a, expected_revision: 1});
  const linked = service.relinkAccount(owned, {...a, expected_revision: 2});
  assert.equal(linked.binding_revision, 3);
  rejects(() => service.assertCurrent(owned, k), 'STALE_BINDING_REVISION');
  const newK = service.currentK(owned, a);
  rejects(() => allowedConsent(service, owned, newK), 'STALE_CONSENT_BINDING');
  rejects(() => service.relinkAccount(owned, {...a, expected_revision: 3}), 'ACCOUNT_ALREADY_ACTIVE');
});

test('real-channel identity and a bad channel cannot register synthetic authority', () => {
  const s = new IdentityConsentService();
  rejects(() => s.registerAccount(ctx(), {...base(), tenant: 'live', principal_id: 'fake-owner-1', binding_revision: 1}), 'NONPRODUCTION_TENANT_ONLY');
  rejects(() => s.registerAccount(ctx(), {...base('fixture-account-1', 'fake-peer-1', 'INSTAGRAM'), principal_id: 'fake-owner-1', binding_revision: 1}), 'BAD_CHANNEL');
});

test('READ_INBOUND checks current K without granting sender authority', () => {
  const {service, owned, k} = fixture();
  const result = service.evaluate(owned, {k, operation: 'READ_INBOUND', now: 100});
  assert.equal(result.allowed, true);
  assert.equal(result.reversible_snapshot_only, true);
  rejects(() => service.evaluate(owned, {k, operation: 'SEND_MESSAGE', now: 100}), 'GRANT_AUTHORITY_UNAVAILABLE');
});

test('CONTACT cannot impersonate SELF_PRIVATE authority during contact operation', () => {
  const {service, owned, k} = fixture();
  rejects(() => service.evaluate({...owned, input_domain: 'SELF_PRIVATE'}, {k, operation: 'READ_INBOUND', now: 100}), 'INPUT_DOMAIN_MISMATCH');
  rejects(() => service.evaluate(owned, {k, operation: 'INSTALL_SOFTWARE', now: 100}), 'UNSUPPORTED_OPERATION');
});

test('consent stays pending when proof authority missing or insufficient', () => {
  const {service, owned, k} = fixture({proofAuthority: null});
  const pending = service.createConsent(owned, consentInput(k));
  assert.equal(pending.status, 'EVIDENCE_PENDING');
  rejects(() => allowedConsent(service, owned, k), 'PROOF_NOT_VERIFIED');
});

test('verified narrow consent allows only its precise purpose, operation, peer and account', () => {
  const {service, owned, k} = fixture();
  const c = service.createConsent(owned, consentInput(k));
  assert.equal(c.status, 'ACTIVE');
  assert.equal(allowedConsent(service, owned, k).allowed, true);
  rejects(() => service.evaluate(owned, {k, operation: 'AVATAR_EDIT', purpose:'PRIVATE_PERSONALIZATION', consent_id:c.consent_id, now:300}), 'CONSENT_PURPOSE_DENIED');
  rejects(() => service.evaluate(owned, {k, operation: 'VOICE_SYNTHESIS', purpose:'PUBLIC_CAMPAIGN', consent_id:c.consent_id, now:300}), 'CONSENT_PURPOSE_DENIED');
  const otherPeer = {...k, peer_id:'fake-peer-002'};
  service.bindPeer(owned, otherPeer);
  rejects(() => allowedConsent(service, owned, otherPeer), 'CONSENT_SCOPE_DENIED');
});

test('consent does not authorize sending without independent effective Grant', () => {
  const {service, owned, k} = fixture();
  service.createConsent(owned, consentInput(k, 'SEND_MEDIA', 'SEND_TO_CONTACT'));
  rejects(() => service.evaluate(owned, {k, operation: 'SEND_MEDIA', purpose:'SEND_TO_CONTACT', consent_id:'fake-consent-1',now:300}), 'GRANT_AUTHORITY_UNAVAILABLE');
});

test('time expiry is checked against server-supplied time, never client display state', () => {
  const {service, owned, k} = fixture();
  service.createConsent(owned, consentInput(k));
  rejects(() => service.evaluate(owned, {k, operation: 'VOICE_SYNTHESIS', purpose:'PRIVATE_PERSONALIZATION', consent_id:'fake-consent-1',now:5000}), 'CONSENT_EXPIRED');
});

test('revoke is CAS fenced, monotonic and idempotent per request; evidence event once', () => {
  const {service, owned, k} = fixture();
  service.createConsent(owned, consentInput(k));
  const input = {consent_id:'fake-consent-1', expected_revision:1, idempotency_key:'fake-request-1'};
  const one = service.revokeConsent(owned, input);
  const two = service.revokeConsent(owned, input);
  assert.deepEqual(one, two);
  assert.equal(one.consent_revision, 2);
  assert.equal(one.revocation_epoch, 1);
  assert.equal(service.privacyEvents(owned).filter(e => e.type==='CONSENT_REVOKED').length, 1);
  rejects(() => allowedConsent(service, owned, k), 'CONSENT_REVOKED');
  rejects(() => service.revokeConsent(owned, {...input, idempotency_key:'fake-request-2'}), 'STALE_CONSENT_REVISION');
});

test('cross principal cannot revoke consent or read its private events', () => {
  const {service, owned, k} = fixture();
  service.createConsent(owned, consentInput(k));
  rejects(() => service.revokeConsent(ctx('fake-stranger'), {consent_id:'fake-consent-1', expected_revision:1, idempotency_key:'fake-request-9'}), 'CONSENT_SCOPE_DENIED');
  service.revokeConsent(owned, {consent_id:'fake-consent-1', expected_revision:1, idempotency_key:'fake-request-owner'});
  assert.equal(service.privacyEvents(ctx('fake-stranger')).length, 0);
  assert.equal(service.privacyEvents(owned).length, 1);
});

test('W44 grant authority revoked or inactive blocks all send attempts', () => {
  let result = null;
  const grantAuthority = {evaluate: () => result};
  const {service, owned, k} = fixture({grantAuthority});
  result = {...approvedGrant(k.identity_key), revoked:true};
  rejects(() => service.evaluate(owned, {k, operation:'SEND_MESSAGE',now:100}), 'GRANT_NOT_EFFECTIVE');
  result = {...approvedGrant(k.identity_key), agent_active:false};
  rejects(() => service.evaluate(owned, {k, operation:'SEND_MESSAGE',now:100}), 'GRANT_NOT_EFFECTIVE');
  result = {...approvedGrant(k.identity_key), expires_at:100};
  rejects(() => service.evaluate(owned, {k, operation:'SEND_MESSAGE',now:100}), 'GRANT_NOT_EFFECTIVE');
});

test('cross account wrong grant K blocked at integration interface', () => {
  let grant = null;
  const {service, owned, k} = fixture({grantAuthority:{evaluate:()=>grant}});
  grant = approvedGrant(k.identity_key.replace('fixture-account-1', 'fixture-account-2'));
  rejects(() => service.evaluate(owned, {k, operation:'SEND_MESSAGE',now:100}), 'GRANT_NOT_EFFECTIVE');
});

test('positive grant result is only a reversible eligibility snapshot, never a send receipt', () => {
  let grant = null;
  const {service, owned, k} = fixture({grantAuthority:{evaluate:()=>grant}});
  grant = approvedGrant(k.identity_key);
  const r = service.evaluate(owned, {k, operation:'SEND_MESSAGE',now:100});
  assert.equal(r.allowed, true);
  assert.equal(r.reversible_snapshot_only, true);
  assert.equal(r.status, undefined);
  assert.equal(r.provider_mid, undefined);
});

test('failed delegated/async grant proof fails closed rather than silently accepting', () => {
  const {service, owned, k} = fixture({grantAuthority:{evaluate:()=>Promise.resolve(approvedGrant('fake'))}});
  rejects(() => service.evaluate(owned, {k, operation:'SEND_MESSAGE',now:100}), 'ASYNC_GRANT_NOT_SUPPORTED');
});

test('missing identity fields and invalid consent id reject before any side effect', () => {
  const {service, owned, k} = fixture();
  rejects(() => service.assertCurrent(owned, {...k, peer_id:undefined}), 'INVALID_PEER');
  rejects(() => service.createConsent(owned, {...consentInput(k), consent_id:'invalid|id'}), 'INVALID_CONSENT_ID');
  assert.equal(service.privacyEvents(owned).length, 0);
});

test('different contact B/C keep their active K when contact A binding invalidates', () => {
  const {service, owned, a, k} = fixture();
  const b=base('fixture-account-2','fake-peer-002');
  const c=base('fixture-account-3','fake-peer-003');
  for (const x of [b,c]) {
    service.registerAccount(owned,{...x,principal_id:owned.principal_id,binding_revision:1});
    service.bindPeer(owned,x);
  }
  const bK=service.currentK(owned,b),cK=service.currentK(owned,c);
  service.invalidateAccount(owned,{...a,expected_revision:1});
  rejects(() => service.assertCurrent(owned,k),'ACCOUNT_OR_PEER_UNBOUND');
  assert.equal(service.assertCurrent(owned,bK).identity_key,bK.identity_key);
  assert.equal(service.assertCurrent(owned,cK).identity_key,cK.identity_key);
});

test('stale late event cannot restore same account before explicit relink', () => {
  const {service,owned,a,k} = fixture();
  service.invalidateAccount(owned,{...a,expected_revision:1});
  rejects(() => service.currentK(owned,a),'ACCOUNT_OR_PEER_UNBOUND');
  rejects(() => service.bindPeer(owned,a),'ACCOUNT_UNBOUND');
  rejects(() => service.evaluate(owned,{k,operation:'READ_INBOUND',now:100}),'ACCOUNT_OR_PEER_UNBOUND');
});
