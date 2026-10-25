# W24 — IdentityConsent native canonical K (Issue #4)

Status: **RUNNABLE, NONPRODUCTION SYNTHETIC IN-PROCESS DOMAIN**. Not an HTTP deployment, external login, identity attestation provider, cryptographic audit ledger, persistent database or channel authorization. This module is real domain logic with fail-closed authority ports; do not call it a production-complete identity service.

## Execute (Node 24 built-in test runner)

From repository root:

```sh
node --test services/api/src/domains/identity-consent/identity-consent.test.mjs
```

No paid model, dependency installation, network server, credentials, real account, platform API, sender, production DB or deploy is used. Tests include all 120 official fictional fixture contacts.

## Contract exports

`canonicalK({tenant,account,channel,peer_id,binding_revision})` => W09 M0 compatible exact five-part delimited K; rejects separators, unknown channel, missing parts, non-synthetic tenant and invalid revision.

`new IdentityConsentService({grantAuthority,proofAuthority})`:
- `registerAccount(trustedContext, account)`: only the current in-process synthetic tenant and its authenticated principal; `{tenant,account,channel,principal_id,binding_revision}`; account namespace includes **channel**.
- `bindPeer(trustedContext, accountPeer)` and `currentK(trustedContext, accountPeer)`: current verified synthetic K, plus a stable identity_key.
- `assertCurrent(trustedContext, K)`: compares full account/channel/peer key to current authoritative binding_revision and active state. Inbound adapters **must** call this before passing original MID to W45.
- `invalidateAccount(trustedContext, {tenant,account,channel,expected_revision})`: CAS fence; bumps account binding revision and revocation epoch, blocks stale receives and sends.
- `relinkAccount(...)`: explicit **synthetic** relink after invalidation, bumps revision again. It does not perform a provider login or restore prior consent. Real provider ownership and credential verification are W26–W29 responsibilities.
- `createConsent(trustedContext, {k,consent_id,subject_id,proof_ref,purpose,operation,expires_at,now})`: specific asset/person purpose; only approved proofAuthority allows ACTIVE; otherwise EVIDENCE_PENDING. No client-supplied "verified" flag.
- `revokeConsent(trustedContext, {consent_id,expected_revision,idempotency_key})`: expected_revision CAS, monotonic consent_revision/revocation_epoch, idempotent retry. `privacyEvents(ctx)` exposes owner-scoped synthetic revocation audit markers only.
- `evaluate(trustedContext, {k,operation,purpose,consent_id,now})`: checks current binding, purpose, scope, proof, expiry. Sending calls *an external* W44 `grantAuthority.evaluate({ctx,k,operation,now})`; rejects absent, stale, revoked, inactive Agent, expired or wrong K decisions; any allow return is **reversible_snapshot_only** and never ACK or permission to bypass W25's final fence.
- `IdentityDenied.code`: stable fail-closed reason for consumers.

`trustedContext = {tenant:'SYNTHETIC_TEST_ONLY',principal_id:'fake-owner-1',input_domain:'CONTACT'}` is provided by an upstream authenticated caller **not** by an HTTP request parameter. No production HTTP gateway exists here, so direct untrusted network exposure is forbidden.

## Strict cross-owner API contracts

W45 and W26–W29: use `assertCurrent(ctx, canonicalK)` for synthetic inbound before creating MID/translation/candidate records, and reject late events after account/binding revocation. Always preserve the entire five-part K; never group solely by display_name or peer_id.

W44: implement a durable Grant/Custody/Budget service, not within W24. Its server-side decision must include `allowed,identity_key,agent_active,grant_revision,expires_at,revoked` and compare against the current K. Current tests inject a synthetic stub only. They **do not** establish W44 implementation.

W25: the sole MessageDelivery/Outbox must independently check binding/Consent/Grant again immediately before irreversible network I/O, using transactional fencing. Never take a prior `allowed:true` from W24 as a send authorization token. No provider MID or ACK is produced in this module.

W23: file bytes, encrypted blob custody, asset ACL, consent-linked download or deletion propagation belong to W23; W24 emits only synthetic revocation markers and purpose eligibility.

W43: official Agno SDK and agent execution remain outside this package. There is no mock or second agent runtime within W24.

W46: B+C Composer should carry the exact current K and GET-fenced state across draft/selection/edit; display a read-only state when no true service authority exists.

## Remaining HOLD and limitations

- **P0**: no external identity proof / platform ownership validation / legal photo-voice permissions / protected secret management / authenticated HTTP runtime / production consent storage.
- **P0**: no durable atomic privacy outbox or actual deletion propagation to W23, W43 memories, W25 queued sends or remote providers. Current in-memory events disappear on restart, so do not use for real private data.
- **P0**: no combined DB transaction across W24+W44+W25. Synthetic in-process CAS prevents stale revision here, but production concurrent worker/network fencing and crash recovery are NOT_RUN.
- **P1**: current authority ports are synchronous; an asynchronous W44/identity-proof API must be explicitly integrated by the actual gateway owner before M1 cross-process use.
- **P1**: no HTTP/OpenAPI endpoint and no independently authenticated request context yet. This is the domain-service contract, not a public REST release.

No production deployment, real user data, paid model, human sending, real account session or old YANCE migration is authorized.

## W24 targeted delta after PR #32 / existing 205 tests (2026-10-25)

This is **incremental** to original W24 #17 SHA `30b188346729d858826b491daaca40cbc6ef5279`, not a rewrite of W44's durable grant/budget DB or W25's unique Outbox.

- `readConsentEpoch(trustedContext,k)` is the **W24 authoritative peer-scoped monotonic version**. W44's existing `createW24IdentityPorts({readConsentEpoch})` must receive `({k})=>identityService.readConsentEpoch(trustedContext,k)`, **not** the fixed `()=>1` mock used by PR #32. Epoch starts at 1 for a known K and advances on create/revoke Consent, including EVIDENCE_PENDING. Existing W44 `reserve/checkForSend` invalidates a reserved intent on mismatch.
- `invalidateAccount` clears all bound peers in that exact `tenant/account/channel`. `relinkAccount` intentionally **does not restore peer membership**; explicit platform-verified `bindPeer` for each new binding is required from a channel Owner. Stale K and any existing Consent cannot be promoted by relink.
- Consent proof and W44 Grant ports can be re-entrant. `createConsent` and `evaluate` now reject if the binding/epoch changes mid-decision; no previously approved snapshot is treated as a durable send permission.
- Tests: `node --test services/api/src/domains/identity-consent/identity-consent.test.mjs` (28 PASS, including 5 new negative regressions). Existing PR #32 whole Node suite separately run 205 PASS on original composition source; *these results do not imply it already includes this delta*.
- Cross-owner regression without modifying the other Owners: `node services/api/src/domains/identity-consent/cross-owner-fence.mjs "C:\Users\1\Documents\YanceV2\Worktrees\W09_NATIVE_SYNTHETIC_INTEGRATION_20261025"` imports **existing PR #32 W44 SQLite and W25 SQLite/synthetic sink modules** and verifies 3 W44 fences plus W25 PRE_NETWORK revoke `DENIED` with 0 sink sends.

**Unclosed P0/P1:** This version exists in the W24 Owner PR only until independently integrated. W44/W25 owners must replace fixed consent epoch with W24's live `readConsentEpoch`, run recovery/restart/parallel-worker tests on the actual joined SHA, and harden multi-DB atomicity/leases. Existing W44 adapter propagates `IdentityDenied` directly after account invalidation (instead of returning `{ok:false}`); W44 decides canonical error DTO. No production DB, authenticated HTTP service, provider send, or independent SEC/legal signoff. Real Agno, translation and Composer M1 remain owned by W43/W45/W46.

## 2026-10-25 P0 persisted identity / W44 fence: RED

See [P0_DB_OWNER_MINIMAL_INTERFACE_REQUEST.md](./P0_DB_OWNER_MINIMAL_INTERFACE_REQUEST.md).
Real W44 SQLite remains the sole grant/custody/budget/fence authority. W24 has
no authorized W44 Owner-provided atomic durable identity repository, generation
read, or complete mutation-kind API; consequently W24's current in-memory
identity/Peer/Consent mutations **must not** be promoted as production-safe.
`authority-persistence-audit.test.mjs` intentionally reproduces W24 restart
state loss and a direct-mutation bypass while running actual W44 SQLite.
PASS in this diagnostic test suite means **bug reproduced**, not security PASS.
Release remains **P0 RED/HOLD**. No second database, Outbox or W44/W25 edits.

## 2026-10-25 W44 native strict durable identity source landed (synthetic)

Original W24 `IdentityConsentService` now supports
`requireDurableIdentity:true` with the existing W44 native authority store.
All six identity/consent mutators, authoritative reads/epochs and HUMAN takeover
are routed to W44's real SQLite transaction/fence and NEVER use original W24
RAM identity/consent for authorization in strict mode. See
[W24_W44_STRICT_DURABLE_HANDOFF.md](./W24_W44_STRICT_DURABLE_HANDOFF.md)
for exact injection, tests, proof limitations and remaining release HOLD.
The earlier P0 audit remains intentionally runnable against **legacy**
synthetic compatibility and demonstrates that legacy mode is unsafe.
Never use legacy compatibility in a deployed authorization path. W09-2
still owns actual strict-mode composition and independent SEC/release gate.
