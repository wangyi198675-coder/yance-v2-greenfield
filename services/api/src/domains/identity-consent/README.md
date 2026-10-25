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
