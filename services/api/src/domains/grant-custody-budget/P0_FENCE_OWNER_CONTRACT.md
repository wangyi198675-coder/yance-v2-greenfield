# W44 / W25 / W24 P0 fencing handoff (NONPRODUCTION)

Owner: W44 Issue #8, original W44 branch/worktree only. This augments the EXISTING W44 SQLite budget schema and existing W25 sole MessageDelivery/Outbox. It does not create a second sender, message queue, identity/consent authority or live transport.

## Existing accepted baselines — inherited, NOT rerun here

W24 a8912962004f9c324157234356268acb7fc41e82.
W44 source at job request 8703781536564b476f4ebce452a7d6780595046e, with previously submitted W44 targeted budget hardening f9ce7ec14e11c0cb313517d6a73453bd4f3456cb inherited in this branch.
W25 58987b5ec2dbf803983bdea9ec280247599e3e0c.
W09-2 composition fce488bc65922bf9e8be4e06113ba30cdc5c2235.
Inherited 55/55 W09-2 directed tests and 7 CI jobs remain previous evidence; this incremental W44 branch adds its own tests.

## Proposed minimal linearizable synthetic send protocol

1. W25's existing admission stores only a synthetic SendIntent and creates W44's reservation through createW25EligibilityPort. W24 remains the unique source for account/consent epoch.
2. At W25's first PRE_NETWORK, W44 enters BOUNDARY_ENTERED; W25 writes its one IN_FLIGHT Outbox attempt. At W25's **second** PRE_NETWORK, W44 reads the ACTUAL W25 persisted intent, attempt and SYNTHETIC_BOUNDARY_ENTERED audit using createW25PersistedArmVerifier. Only then does armSend atomically create a durable per-full-K boundary lease in W44's existing SQLite. No W25 proof => no arm => no mock sink.
3. Every effective W24 consent revocation, binding rebind/account switch and every effective W44 grant revoke or HUMAN takeover MUST first write requestMutationFence (GLOBAL account+channel or CONTACT full K). Starting this marker is a short SQLite write transaction; it blocks new arms/reservations in the affected scope.
4. finalizeMutationFence commits a trusted **synchronous W24 authority mutation** only if no relevant active lease remains. If there is a lease, finalization returns ACTIVE_SEND_MUST_SETTLE_FIRST and the requested mutation is pending, **not effective yet**. If W24 mutation starts first, W25 fails closed on pending marker. If W25 arm linearizes first, the attempted revoke is pending until the existing attempt settles. This ordering is explicit, never represented as an already-effective revoke.
5. W25 owns the only sink, real recipient locks and provider ACK/UNKNOWN. W44's existing settleBoundary consumes ONLY trusted W25 persisted terminal evidence via createW25SettlementVerifier and releases the durable W44 lease while committing or releasing reserved fictional units. UNKNOWN/worker crash holds both reservation and lease; no expiry-based refund, no retry of the old provider attempt. W25 must supply a verified original-attempt receipt to settle a late ACK.
6. Per-contact leases are short SQLite transactions, not a lock held over slow async sink I/O. A may stay UNKNOWN while B/C continue under distinct K, unless account-wide mutation pending intentionally blocks that account+channel. A CONTACT takeover does not block B/C.
7. Across separate OS processes the ledger and lease are persisted on the SAME W44 SQLite database; a dead sender cannot make UNKNOWN or active leases disappear. Reconciliation must be evidence-based and may require operator assistance.

## Exact W44 additions

Within openEligibilityStore existing factory: verifyDeliveryArm callback; armSend({identity,intentId,w25IntentId}); leaseStatus(identity); requestMutationFence({identity,scope,actor,expectedGeneration}); finalizeMutationFence({identity,scope,actor,generation,kind,applyW24}).

Mutation kinds REVOKE_GRANT / REVOKE_ACCOUNT / REVOKE_CONSENT / HUMAN_TAKEOVER. Scope CONTACT or GLOBAL (tenant/account/channel). W44 finalize does not implement W24 identity; its applyW24 is a required trusted synchronous owner callback. Direct W44 grant/revoke/setCustody reject active relevant send leases. Full K is tenant/account/channel/peer/binding_revision.

In native-bridges.mjs: createW25PersistedArmVerifier({getDelivery}), createW25EligibilityPort({store,identityService,trustedContext,readAgentState,readRouteState,getDelivery}), createW25SettlementVerifier({getDelivery}).

W25 must wire getDelivery to its EXISTING MessageDelivery instance. Its PRE_NETWORK callback already runs twice in W25 SHA 58987b5 and therefore consumes the new W44 arm automatically. W25 must not bypass this mandatory eligibility port or create another Outbox. The second check and proof do not authorize any real sink, only SyntheticConnectorSink.

## Fail-closed contractual blockers (P0 remains OPEN)

- W24's native binding/consent authority is currently IN-MEMORY. Its **all** mutation entrypoints are not yet forced to pass this W44 request/finalize gate. Direct W24 mutation during W25's armed interval bypasses the gate. Cross-process W24 identity state can diverge after restart. Thus atomic real-authority closure is NOT PROVEN.
- There are separate W44 and W25 SQLite files; W25's sink cannot transactionally roll back provider delivery. The proposed protocol is a synthetic *linearization ordering* only once the complete W24 entrypoints and W25 sink boundary are enforced. It is not a production distributed transaction or a real external-provider guarantee.
- For a revoke requested after W25 armed its sink, the revoke is **PENDING** and not yet effective until W25's original attempt settles. If product requirement instead mandates instant effective revoke and cancellation of an already-armed attempt, this protocol is insufficient; W25 must provide a cancellable pre-sink handshake or hard-deny all sends until a redesigned approved cross-service coordinator exists.
- W24 needs a durable authoritative epoch or properly serializable owner mutation coordinator. W25 must independently certify it never invokes a provider sink except under an authorized W44 lease. Independent P0 security QA must prove the entire protocol. Until then real sender remains disabled.
- W44 cannot sign for W24 or W25. No real account/credential usage, production Postgres migration, paid AI or production deploy is authorized.

## Incremental reproducible evidence

Node v24+:
    node --test services/api/src/domains/grant-custody-budget/index.test.mjs

Explicit real native module smoke:
    node services/api/src/domains/grant-custody-budget/interop.native.mjs ABSOLUTE_W24_IDENTITY_CONSENT.MJS ABSOLUTE_W25_MESSAGE_DELIVERY_INDEX.MJS

Tests include: revoke before W25 arm blocks; contact HUMAN takeover waits active lease; GLOBAL account rebind pending; A slow and B/C independently eligible; 6-process budget contention; actual OS child killed after durable arm and recreated process sees it; W25 UNKNOWN not retried/refunded; late fixture verified ACK settles original once; trusted W24 account invalidate after boundary settlement.

These are real Node/SQLite synthetic executions, NOT live provider calls and NOT end-to-end multiowner P0 security signoff.
