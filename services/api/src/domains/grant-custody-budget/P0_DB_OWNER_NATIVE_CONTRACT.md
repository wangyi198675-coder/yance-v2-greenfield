# W44 -> W24 / W25 / W09-2: Durable Account, Peer, Consent and Mutation API

**NONPRODUCTION SYNTHETIC; P0 SECURITY RED until W24/W25 independent integration + security attestation.**
Inherited source identities: W24 2b67af369156840c8fada8e7974c6482a45de6fb; W44 1509f4c44a49faf9a8a831d52b0a659ca6f3ddc1; W25 7f6fabd9f35d3cf3c27bd661d9627db731ec9ae7; W46 88f6c30094a3d6217491c3d1f410a040d91ab3f0; W09-2 b1b30e839a33b3bab20b805d7babcdb359086831.
Source request read first: identity-consent/P0_DB_OWNER_MINIMAL_INTERFACE_REQUEST.md.

## Owner scope / schema
Only W44 domain files changed. authority-db.mjs is instantiated by the existing openEligibilityStore index.mjs using the SAME SQLite DatabaseSync, WAL/FULL, BEGIN IMMEDIATE and path already storing grants, custody, reservations, boundary_leases, mutation_barriers. NO second identity database, W24 runtime reimplementation, W25 Outbox or sender.
New relations:
- identity_accounts: tenant/account/channel, trusted owner principal, binding revision, monotonically increasing account revocation epoch, active, verified binding proof reference (never raw credential).
- identity_peers: tenant/account/channel/peer, bound state, binding revision, peer proof reference, revocation epoch. Rebinding NEVER revives earlier peer memberships.
- identity_consents: unique Consent ID, complete peer scope and binding version, subject/purpose/operation, verified proof ref, expiration/status and CAS consent/revoke revisions.
- identity_consent_epochs: durable peer-scope monotonic counter; increments on bind, create/revoke, invalidate, relink. Prior K cannot silently roll back.
- authority_mutation_requests: immutable request ID, idempotency key, complete K, Actor, kind, scope, all expected epochs, generation, typed payload, PENDING/APPLIED/REJECTED, after-commit result.
- authority_privacy_audit: same-transaction minimal mutation event, W24 purpose-specific metadata, no provider message Outbox.

## Strict native factory and ports
Factory:
openEligibilityStore({path,authorizeMutation,verifyOwnerMutation,verifyOwnerCancellation?,verifyDeliveryArm,verifySettlement,requireDurableIdentity:true})

The externally bound authorizeMutation authenticates server Actor. verifyOwnerMutation is a PURE, SYNCHRONOUS trusted W24 typed proof validator: it MUST NEVER mutate W24 process memory. An absent proof or validator denies. Production/strict mode ignores W24 in-memory verifyIdentity entirely, even if it exists, and rejects legacy direct setCustody or callback-style finalization. Existing legacy synthetic tests may run without strict mode for historical test compatibility; this is NOT a live authorization mode.

1. readIdentityAuthority({actor,identity:K}): short atomic read transaction of account, Peer, Consent records, exact bindingRevision/accountEpoch/consentEpoch/custodyEpoch and scope. The field valid means account+peer+binding membership is valid; it is NOT a blanket consent to send or use tools. W24 remains responsible for operation/purpose/expiry interpretation.
2. readMutationFence({identity:K,scope:'CONTACT'|'GLOBAL',actor}): persisted generation, pending flag, activeLease, last requestId/kind/status. The epoch/generation MUST come from persisted W44 read, never W24 RAM.
3. requestMutationFence({identity:K,scope,actor,kind,expectedGeneration,expectedBindingRevision,expectedAccountEpoch,expectedConsentEpoch,expectedCustodyEpoch,idempotencyKey,payload}): writes PENDING record and existing barrier in the SAME W44 transaction; exact duplicate returns identical original request/status; differing payload under same id rejects IDEMPOTENCY_CONFLICT; stale CAS produces CONFLICT/409. The pending GLOBAL barrier freezes all corresponding account/channel peers; CONTACT touches only full K.
4. finalizeMutationFence({requestId,generation,actor,ownerValidatedMutation}): typed mutation must exactly equal persisted payload, pass PURE W24 server proof and current CAS, and observe no relevant W25 ARMED lease. Updates persistent W24-owned Account/Peer/Consent records or W44 custody/grant, privacy audit, immutable result and barrier clear within ONE BEGIN IMMEDIATE. Returns COMMITTED plus authoritative after epochs. When W25 ARMED, returns PENDING with ACTIVE_SEND_MUST_SETTLE_FIRST; never falsely reports revocation/Takeover successful.
5. mutationResult({requestId,actor}): immutable pending/committed/rejected and post-commit epochs after process restart; actor scoped.
6. cancelMutationFence({requestId,expectedGeneration,actor,provenNoMutation}): optional safe cancellation requires separately injected PURE verifyOwnerCancellation attesting original request never applied; no TTL deletion, no cancel with an active send lease.
The same public requestMutationFence/finalizeMutationFence names route to native transactional ports when strict mode is enabled. Aliases requestNativeMutationFence/finalizeNativeMutationFence exist for adapter migration and synthetic tests.

## Typed operations / expected scopes
REGISTER_ACCOUNT GLOBAL: {bindingProofRef}; authentic W24 channel ownership proof, version 1.
BIND_PEER CONTACT: {peerProofRef}; current account required, durable peer epoch bump.
CREATE_CONSENT CONTACT: {consentId,subjectId,purpose,operation,proofRef,expiresAt,approved}; W24 validated proof required; does not mint a sending grant.
REVOKE_CONSENT CONTACT: {consentId,expectedConsentRevision}; owner + per-Consent CAS, epoch bump.
REVOKE_ACCOUNT GLOBAL: {}; invalidates all peers and existing Consents, bumps binding/account/consent revisions, and creates durable GLOBAL grant DENY/tombstone without resetting old spent/reserved budget.
RELINK_ACCOUNT GLOBAL: {bindingProofRef}; only inactive account with verified channel rebind; never resurrects old peer or grant.
HUMAN_TAKEOVER CONTACT: {action:'USER_EDIT'}; only actual edit and only target contact custody, no focus takeover.
REVOKE_GRANT: {grantScope:'GLOBAL'|'CONTACT'} within preapproved matching owner scope.
Every mutation has full K, trusted actor, all four expected epochs, persisted generation, unique idempotency key and W24-validated typed proof. Local fake proof labels are TEST FIXTURES, not real provider verification.

## Send boundary ordering / blockers
W25 alone owns durable Outbox, recipient lease and synthetic send/UNKNOWN/late ACK. The existing W44 armSend and existing budget settleBoundary remain authoritative for send reservations. If W24 durable Mutation writes PENDING first, new W25 reserve/ARM for affected scope is denied. If W25 ARMED first, mutation stays PENDING until the *same original attempt* gets verified W25 terminal evidence. W25 UNKNOWN and process crashes never release W44 budget/send lease or resend. A CONTACT takeover can wait without blocking B/C. GLOBAL account pending blocks A/B/C in same account/channel.
P0 remains RED because W24 Owner has NOT YET migrated ALL original registerAccount, bindPeer, createConsent, revokeConsent, invalidateAccount, relinkAccount and TAKEOVER to these native transactional entrypoints. Original W24 in-memory mutators can still bypass unless moved/disabled by W24 Owner. W25 Owner must independently attest all irreversible send paths require W44 ARM; real provider effects cannot be rolled back by SQLite. Defer independent SEC/QA before live deployment.

## Native test evidence, separate denominators
New W44 identity durable tests: node --test services/api/src/domains/grant-custody-budget/authority-db.test.mjs
Inherited W44 grant/custody/budget/ARM suite: node --test services/api/src/domains/grant-custody-budget/index.test.mjs
Inherit original native W24+W25 synthetic interop: node services/api/src/domains/grant-custody-budget/interop.native.mjs ABSOLUTE_W24.mjs ABSOLUTE_W25.mjs
New cases cover account+peer+consent CRUD and epochs across restarts, deterministic 409, immutable request IDs, pure proof fail-close, refund/UNKNOWN hold, two separate Node OS worker processes, real OS process exit/reopen, GLOBAL A/B/C vs CONTACT A custody, revoked grant no resurrection after explicit rebind, pending cancellation only on separate trusted no-mutation proof. These tests do NOT mean W24 original source has been migrated.

No real account or Provider login, social send, paid model, production deploy, independent safety or legal signoff.
