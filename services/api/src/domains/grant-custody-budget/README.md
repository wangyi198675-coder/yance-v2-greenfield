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
