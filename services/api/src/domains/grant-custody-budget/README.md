# W44 | Grant / Custody / Budget — Issue #8

Status: **native runnable synthetic NONPRODUCTION module; not production-certified**.

Node 24 built-in node:sqlite; SQLite WAL plus BEGIN IMMEDIATE transactions. Domain path is isolated; no paid model, real login, real delivery, provider SDK or production DB migration.

## Ports

    import {openEligibilityStore,canonicalK} from './index.mjs';
    const store=openEligibilityStore({
      path: '/isolated/nonprod.sqlite',
      verifyIdentity: (K) => W24_AUTHORITATIVE_REVALIDATION(K),
      authorizeMutation: ({actor,action,identity}) => W24_OWNER_PERMISSION(actor,action,identity),
      now: () => Date.now()
    });

These W24 callbacks are REQUIRED dependencies **not yet integrated**. The authoritative identity validator must return an object with valid:true, binding_revision equal to K, positive identity_epoch and consent_epoch. It must check tenant, account, channel, peer, binding, consent, agent status and revocation; never trust the request's own verified flag.

Synthetic only: tenant SYNTHETIC_TEST_ONLY, fixture-* account, fake-* peer, fake-* operator, fake-* intentId. Domain stores grant/custody/reservation facts only: **no duplicate W24 identity database**. Budget units are fictional test units, not model tokens or currency.

## Interfaces

| Export | Contract |
|---|---|
| grant({identity,scope,actor,enabled,expiresAt,budgetUnits,expectedEpoch}) | GLOBAL account/channel or CONTACT full K; compare-and-swap epoch |
| revoke({identity,scope,actor,expectedEpoch}) | Creates DENY tombstone if absent at expectedEpoch=0; otherwise revokes and increments epoch |
| setCustody({identity,mode,action,actor,expectedEpoch}) | HUMAN only USER_EDIT, AUTO only EXPLICIT_RESUME; focus is not an action |
| qualify(identity,units) | W24 validation + grant/custody/budget eligibility |
| reserve({identity,intentId,units,ttlMs}) | Atomic, durable, full-K idempotent budget reservation |
| checkForSend({identity,intentId}) | Check current W24 identity/consent epochs, grant epoch, custody and expiry |
| finish({identity,intentId,action,actualUnits}) | COMMIT only on valid fence; RELEASE for proven noncharges |
| inspection(identity), close() | W24-gated synthetic scope snapshot and resource close |

Effective grant policy: denied/expired GLOBAL blocks all contacts of that account+channel; an absent GLOBAL permits explicit valid CONTACT grants. Denied/expired CONTACT blocks only that contact, never falls back to GLOBAL. A user edit for A changes A custody alone; B/C continue AUTO.

## W25 single delivery-queue integration contract

W25 alone accepts SendIntent, owns Outbox/provider ACK/UNKNOWN and avoids duplicate sends. Before mock sink it must validate full K via W24, call reserve with fictional intentId and run checkForSend AND its own W24 final pre-send revalidation. The caller must not treat a repeated reserved intent as permission to send again.

W25 calls finish COMMIT only for a confirmed fictional charge, or RELEASE only when there can have been no charge. UNKNOWN / timeout / crash may imply a charge: **no blind retry, no automatic refund** until reconciliation. W44 never creates an Outbox or performs sending.

## Remaining gates

- W24 real signature/consent contract and epoch callback are not yet integrated or independently attested.
- W25 real native sole Outbox/ACK/UNKNOWN integration and inter-service atomicity remain HOLD.
- The isolated SQLite transaction is atomic within W44 only; W24 + W25 final-send interlock needs joint verified implementation.
- Expired unresolved reservations stay reserved until safe W25 reconciliation; recovery policy and budget reclamation are P1.
- No HTTP API/production auth/real billing or external provider acceptance is claimed.

## Run real local tests

    node --test services/api/src/domains/grant-custody-budget/index.test.mjs

Tests use temporary local SQLite, run cross-process budget contention, and do not access the network.

## Cross-Owner native adapters (available in native-bridges.mjs)

- createW24IdentityPorts requires the ACTUAL W24 IdentityConsentService.assertCurrent and separate current consent epoch and operator RBAC callbacks. It does not invent W24 durable consent or an authenticated caller.
- createW24GrantAuthority provides W24's grantAuthority.evaluate synchronous contract using W44 inspection and an injected authoritative W43 agent state port.
- createW25EligibilityPort provides W25 MessageDelivery.eligibility.check; translates W25 camelCase full-K to W24 original full-K, reserves one budget unit on ADMISSION, checks original reservation plus W24 epoch on PRE_NETWORK, and supplies frozen account/grant/custody/route/agent versions. W25's one durable Outbox is always the only sink. HUMAN/manual, media and unproved route/agent are fail-closed.
- W25 businessMessageId must be a stable fake-* ID for synthetic admission and the same ID must be used to reconcile W44's reservation; no blind new intent on duplicate.

For explicit **native cross-owner synthetic smoke** (requires both separate Owner files checked out):

    node services/api/src/domains/grant-custody-budget/interop.native.mjs <absolute-W24-identity-consent.mjs> <absolute-W25-message-delivery-index.mjs>

The smoke uses the actual W24 IdentityConsentService, the actual W44 SQLite service and the actual W25 MessageDelivery native Outbox with a SyntheticConnectorSink. It verifies fixture ACK, reservation COMMIT and revoke denial. The agent, route, consent epoch and operator permission callbacks are **synthetic test authorities**; there are no production owner bindings or real provider receipts.

This smoke is intentionally explicit rather than silently importing missing siblings on main. The three domain branches must be merged/accepted by their respective authorized Owners before a shared continuous integration test can replace it. P0 cross-domain atomicity/final network send race remains unresolved.

## Post PR #32: grant epoch and irreversible-boundary safety delta

Fixed prior defect: a renewal reset spent/reserved to zero and revoke zeroed reserved, potentially hiding old unsettled attempts. W44 now preserves both spent and unsettled reservations across renewal, revoke and regrant, with exact epoch invalidation. Proven pre-boundary RELEASE can clear old held units; unresolved/UNKNOWN state cannot.

The actual W25 native dispatch invokes PRE_NETWORK twice: before its durable IN_FLIGHT attempt and immediately before its synthetic sink. W44's existing eligibility adapter invokes enterBoundary for both passes: the first marks the EXISTING budget reservation BOUNDARY_ENTERED, repeat is idempotent with freshly validated W24/W44 epochs and no new reservation or sender. Version changes between checks fail closed.

For BOUNDARY_ENTERED, legacy finish RELEASE returns BOUNDARY_UNCERTAIN_HOLD, and finish COMMIT returns W25_SETTLEMENT_PROOF_REQUIRED. W44 settleBoundary needs a separately provided trusted evidence-verification callback. The new createW25SettlementVerifier with injected read-only W25 MessageDelivery ledger looks up current full K/business ID, actual W25 attempt and audit: SYNTHETIC ACK can settle a fictional unit, authoritative FINAL_BOUNDARY_DENIED_NO_SEND or REJECTED_NO_SEND can release, while UNKNOWN, unverified receipt and mere timeout remain held. Late verified charge after revoke/regrant is still counted once. This is **not real model billing**.

W44 target test suite: 19 PASS / 0 FAIL (original 13 retained plus six version, race and settlement cases). New W24/W44/W25 synthetic interop: ACK budget COMMIT and revoke between two W25 PRE_NETWORK checks yields DENIED, zero sink calls, then explicit proven-no-send settlement releases held units. No real provider network calls.

P0 remains OPEN: W24 in-memory authority, W44 budget SQLite and W25 outbox SQLite do not have an atomic transaction spanning final eligibility and irreversible external effects. Real credential/authorization ownership, route, actual provider receipts, paid model usage, multihost persistence and deployment remain unverified/HOLD. Do not enable live sending.
