# W24 -> W44 DB Owner + W25/W09-2 | P0 native durable identity / mutation-fence change request

**Status: P0 RED / RELEASE HOLD. This is an OWNER INTERFACE CHANGE REQUEST, not a claim of a durable identity implementation.**

Validated source refs on authorized DESKTOP-029FH47, 2026-10-25:
- W24 Owner: `e10f9e17988fa19c4dc71ce927e5d9eaa01dbdc9`.
- W44 Owner: `1509f4c44a49faf9a8a831d52b0a659ca6f3ddc1`.
- W25 Owner: `7f6fabd9f35d3cf3c27bd661d9627db731ec9ae7`.
- W46 Owner: `babd079acc48914141d8782341182b9bae8a32f2`.
- W09-2 integration: `84378a1d8419194ff1599fd4ad408b349ca9d38e`.

## 1. Root cause and exact current owner boundaries

W24 `IdentityConsentService` uses private process-memory `Map`/`Set`:
- `#accounts`: registerAccount(ctx,raw) / invalidateAccount(ctx,...) / relinkAccount(ctx,...).
- `#peers`: bindPeer(ctx,raw); account invalidation clears related peers.
- `#consents`, `#consentEpochs`, `#revocationRequests` and `#privacyEvents`:
  createConsent(ctx,input), revokeConsent(ctx,input).
- Read operations: currentK, assertCurrent, readConsentEpoch, privacyEvents, evaluate.
- W24 `takeover.mjs` currently calls W44 `setCustody` directly after GET/CAS checks; it is NOT yet wired to `requestMutationFence/finalizeMutationFence`.

W44 already owns the ONE persistent synthetic authority/custody/budget SQLite:
`grant-custody-budget/index.mjs`, tables `grants`, `custody`,
`reservations`, `boundary_leases`, `mutation_barriers`.
Its `requestMutationFence({identity,scope,actor,expectedGeneration})` and
`finalizeMutationFence({identity,scope,actor,generation,kind,applyW24})`
protect active W25 send leases, but **W24 mutators do not consume them**.
The finalize callback executes within W44 SQLite `BEGIN IMMEDIATE`, while
W24 memory writes CANNOT participate in its rollback or survive process restart.

W44 `leaseStatus` does NOT provide the last barrier `generation`.
A first mutation with expectedGeneration 0 works, later successive mutations
must know a persisted generation or fail forever. Reconstructing it in W24 RAM
or reading W44 private SQL tables outside Owner's API is unsafe.
W44 currently exposes kinds `REVOKE_GRANT | REVOKE_ACCOUNT |
REVOKE_CONSENT | HUMAN_TAKEOVER`; **no safe atomic kind for RELINK_ACCOUNT,
REGISTER_ACCOUNT, BIND_PEER, CREATE_CONSENT**.

Do not add second SQLite identity DB, second grant system, second Outbox, or
external account calls. W24's legacy constructor is synthetic-only; it MUST NOT
be promoted as a production source of truth.

## 2. Minimum W44 DATABASE OWNER change request (approval required)

Add identity/consent relations to W44's **existing native SQLite authority
database**, under a W44-owned migration and transaction factory, OR provide an
equally atomic W44 Owner-backed existing authority relation. Suggested minimum
schema (names illustrative; exact design owned by W44):

1. `identity_accounts`: PK(tenant,account,channel), trusted owner principal,
   binding_revision, monotonic account_revocation_epoch, active/status, verified
   channel binding evidence reference (no secrets in audit).
2. `identity_peers`: PK(tenant,account,channel,peer_id), current verified
   binding_revision, explicit bind state, proof reference, revocation epoch.
3. `identity_consents`: unique scoped consent ID, owner, complete canonical K,
   purpose/operation/subject/proof reference and authority decision, expires_at,
   status, consent_revision and revocation_epoch.
4. `identity_consent_epochs`: peer-scoped monotonic epoch, surviving process
   restarts, relinks and revoked Consent. Same K cannot roll back to a previously
   authorized epoch.
5. `identity_revocation_receipts` + minimal privacy audit event/outbox within
   the **same W44 authority DB transaction** (privacy records, NOT W25 message
   Outbox), idempotency keys and immutable request receipt.
6. `authority_mutation_requests` (or extend existing W44
   `mutation_barriers`): request ID, scope, kind, expected original full K and
   all expected epochs, generation, state PENDING/APPLIED/REJECTED, actor, result,
   monotonic timestamps and after-crash reconciliation evidence. A persistent
   barrier MUST remain in place while W25 UNKNOWN/ARMED cannot settle.

**Required W44 typed native ports** (names provisional, W44 owns contract):

- `readIdentityAuthority(trustedActor, K)`: read committed account binding,
  peer, Consent and exact current epochs from the **same** authoritative DB;
  never client-supplied identity/proof metadata.
- `readMutationFence({identity,scope})` -> `{generation,pending,activeLease,
  requestId,kind,status}`. Durable and scoped CONTACT vs GLOBAL. Must support
  repeated completed generations and optimistic CAS.
- `requestMutationFence({identity,scope,actor,kind,expectedGeneration,
  expectedBindingRevision,expectedAccountEpoch,expectedConsentEpoch,
  expectedCustodyEpoch,idempotencyKey})` -> stable `requestId/generation`
  and `PENDING`, blocks affected new grants/arms/reservations before mutation.
- `finalizeMutationFence({requestId,generation,expected...,
  ownerValidatedMutation})` must write authoritative **W24-owned identity/
  Consent or W44 custody changes in the SAME SQLite BEGIN IMMEDIATE
  transaction** as checking `boundary_leases`, CAS and clearing the barrier;
  the W24-validated mutation must be represented as durable data/typed SQL
  parameters, NOT a side effect of an in-memory callback.
- `mutationResult(requestId)` -> PENDING/COMMITTED/CONFLICT with authoritative
  epochs, idempotently after restart; unknown outcome never falsely committed.
- `cancelMutationFence(requestId,expectedGeneration,provenNoMutation)` only
  for an independently proven never-applied request, not when W25 UNKNOWN or
  an ARMED lease is outstanding. No TTL-based barrier deletion.
- Supported kinds at minimum: `REGISTER_ACCOUNT`, `BIND_PEER`,
  `CREATE_CONSENT`, `REVOKE_CONSENT`, `REVOKE_ACCOUNT`,
  `RELINK_ACCOUNT`, `HUMAN_TAKEOVER` (and existing W44 grant revoke).
  Positive-authority creation must never resurrect revoked grants or old
  peer memberships; rebind must require verified channel ownership.

Preserve full K tenant/account/channel/peer_id/binding_revision. Enforce
GLOBAL account+channel scope for revoke/relink, CONTACT for Consent/contact
HUMAN takeover. On GLOBAL pending, all affected account peers blocked; a
CONTACT HUMAN takeover must not alter unrelated B/C AUTO grants.

W24 Owner will adapt original `IdentityConsentService` to this native durable
repository/transaction port **after W44 schema and method contract are
approved**; production-mode constructors and all six mutators must fail
closed if repository/required fence is absent. Preserve existing W24 GET/POST
wire fields and W46 Composer; do not accept a browser's identity as principal.

## 3. Required linearization and post-ARM semantics

- **Before W25 ARM:** `requestMutationFence` PENDING is written first.
  Subsequent W25 `reserve/checkForSend/armSend` must deny affected K; after
  W44 durable transactional W24 mutation, return confirmed new version.
- **After W25 ARM:** `finalizeMutationFence` returns PENDING and
  `ACTIVE_SEND_MUST_SETTLE_FIRST`, **NOT revoked, completed or HUMAN**.
  No new unauthorized intents can be armed behind the persisted barrier.
- **W25 UNKNOWN / crash:** keep exact W44 lease and reservation, never silently
  send again, release/charge budget, clear barrier or mark a revoke effective.
  Only authenticated original W25 persisted terminal evidence can settle; on
  verified terminal outcome, finalize the SAME original pending mutation once.
- A CONTACT takeover that is waiting for A's armed send does not block B/C;
  GLOBAL account mutation must block A/B/C in that account+channel.
- W25's existing unique Outbox/synthetic sink, W44 budget ledger and
  W46 GET/POST→GET endpoints remain the only permitted owners.

## 4. Actual negative evidence collected this round

All checks used authorized remote Windows Node 24 and **real W44 SQLite**, no
actual Provider connection.

- W44 `index.test.mjs`: **25/25 PASS**, includes OS child crash with durable
  ARM lease, parallel budget workers, PENDING and UNKNOWN retention.
- W25 `index.test.mjs` + `sqlite-cold-start.test.mjs`: **21/21 PASS**,
  including UNKNOWN persisted, two restarted OS workers never auto-resend.
- W09-2 existing native interop `interop.native.mjs` executed against
  exact W24 and W25 owner files: **PASS**, PRE_NETWORK revoke blocks synthetic
  send (zero sink calls), ARMED revoke PENDING, UNKNOWN holds budget and lease
  until verified synthetic late ACK, then complete once.
- W24-owned `authority-persistence-audit.test.mjs`: **4/4 test assertions
  PASS**, but **two deliberately reproduce P0 vulnerabilities**:
  1. W44 grant SQLite survives reopen, while fresh W24 IdentityConsent
     loses all prior account/Peer/Consent authority and fails closed.
  2. Direct legacy W24 revoke changes Consent despite existing W44 PENDING
     barrier; forced failure inside `finalizeMutationFence` rolls back SQLite
     but cannot roll back W24 RAM invalidation.
  It also proves scope-specific CONTACT vs GLOBAL freeze, and a real
  two-independent-OS-process W44 mutation request CAS: 1 accepted, 1
  MUTATION_ALREADY_PENDING, reopened SQLite retains barrier.

`node --test` exits 0 on these **diagnostic assertions** because it is
correctly observing the bug. It is **NOT** P0 SECURITY PASS. P0 gate = RED.
Different categories and evidence MUST NOT be added together as a single
release-pass numerator.

Reproduce audit:
```powershell
$env:YANCE_W44_ROOT='C:\Users\1\Documents\YanceV2\Worktrees\W44_GRANT_CUSTODY_BUDGET_ISSUE8_20261025'
node --test services/api/src/domains/identity-consent/authority-persistence-audit.test.mjs
```

## 5. Owner split and HOLD

- W44 DB Owner: own migration, native transactional authority repository,
  persisted generation read, idempotent pending status and safe CAS finalization.
- W24 Domain Owner: once supplied, adapt original six mutable identity/consent
  entrypoints and HUMAN takeover to use ONLY those durable ports, with
  original GET→POST→GET unchanged.
- W25: independently verify W44 ARM is required at its single irreversible
  boundary and test two-worker/UNKNOWN terminal reconciliation against joined SHA.
- W46: no code rework; preserve existing confirmed complete version fields and
  UI real user-edit-only semantics.
- W09-2: integration SHA must include actual W44 approved DB change plus W24
  typed port and independently reproducible test/review. Existing 82/82 and
  seven CI jobs are inherited reports, NOT new verification on this change.

**Release state: P0 RED / no merge to production / no real social account,
live send, paid model, or deployment.**
