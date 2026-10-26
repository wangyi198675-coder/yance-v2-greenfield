# W25 — native MessageDelivery (Issue #7)

**Status:** runnable NONPRODUCTION SYNTHETIC-ONLY domain implementation. No real login, provider, HTTP routes, paid models or production connection. W25 owns only this folder. UI and Identity/Grant integration belong to other Owners.

## Run tests

Requires Windows Node.js v24.18.0 or other Node runtime with built-in node:sqlite.

    node --test services/api/src/domains/message-delivery/*.test.mjs

No dependencies need to be installed. Tests create temporary SQLite databases in the OS temp directory and remove them; provider connectors are synthetic-only.

## Actual exported service contract

    import { MessageDelivery, SyntheticConnectorSink } from './index.mjs';
    const delivery = new MessageDelivery({
      databasePath: '/temporary/nonprod/delivery.sqlite',
      eligibility: { async check({ k, mode, phase, intentId }) {
        // W24 canonical K + W44 Grant/Custody/Budget are authoritative.
        // Must return the CURRENT eligibility proof for each call.
      }},
      sink: new SyntheticConnectorSink(),
      receiptVerifier: async event => ({ verified: false })
    });
    // await submitIntent({k,businessMessageId,payload:{text},mode,actorId,sessionId})
    // await dispatchOne(intentId)
    // getIntent(id), getAttempt(id), getAudit(id), listReceipts(id)
    // recoverInterrupted({olderThanMs:60000})
    // await recordVerifiedReceipt(event), close()

Mandatory canonical K: tenantId, accountId, channel (FB_PERSONAL|FB_PAGE|WHATSAPP_PERSONAL|TELEGRAM_PERSONAL), peerId, bindingRevision. The durable unique logical business ID across Actor/Session/request ID is distinct from message text; legitimate duplicate words can still be sent when they are independent authorized messages. Reusing a business ID with mutated payload or binding revision fails closed.

submitIntent() is admission, not sending. dispatchOne() performs an additional authoritative W24/W44 check against frozen version fields and invokes only SyntheticConnectorSink after persisting an IN_FLIGHT attempt. ACKED_SYNTHETIC is a fixture result, never true Meta/WhatsApp/Telegram delivered or read evidence. Recipient-scoped lease permits B/C while A is slow; each recipient gets a persistent monotonically increasing fence. After ambiguous network outcome or crash past boundary, UNKNOWN is durable with no automatic resend; a verified fixture event updates the original intent. recoverInterrupted only reclaims stale attempts and must run under a coordinated single recovery authority, not across actively healthy workers.

## Remaining P0/P1 and external dependencies

- P0: W24 Identity and W44 Grant/Custody/Budget have not provided one atomic cross-domain pre-network eligibility transaction. Port checks and network I/O leave a TOCTOU window. This synthetic demonstration is NOT production-safe.
- P0: no authenticated provider events. receiptVerifier here is injected by test; W26-W29 must provide truly signed or authoritative provider provenance/MID mapping. HTTP2xx does not imply delivery or read.
- P0: no real channel provider or externally exposed HTTP/RBAC route. Exported internal domain interface is callable only by trusted service code; future API must authorization-gate all reads/commands.
- P0: Page cross-SaaS Routing and existing/missing Chatwoot conversation takeover remain W27/LEGAL/SEC-owned holds. Only a supplied Page epoch/route proof can enable the synthetic sink.
- P1: SQLite is used for no-dependency nonproduction durability only; real multi-node PgSQL migrations, encrypted persisted payload, operational backups and performance evidence require separate authorization.
- P1: W44 fee reservation settlement/refund after evidence and W23 asset ACL/IdentityConsent revocation integration not ready; nonempty asset lists fail closed.
- PR #3 M0 integration/synthetic-first-flow remains MOCK. This is a real durable MessageDelivery domain API; the full native M1 vertical user journey has not been completed by this PR.

## Covered negative cases

Actor/Session/request ID idempotency, two independent OS processes, account/tenant K isolation, payload mutation, grant revoke/epoch/expiry, budget, agent inactive, A/B/C independent contacts, Page send owner fence, UNKNOWN/late ACK/replay, restart unknown recovery. No test performs actual social-channel delivery, login, production installation or paid inference.

## PR #3 M0 send Port compatibility (native ledger replacing the mock Send function)

M0 uses snake_case tenant/account/channel/peer_id/binding_revision; W25 uses structured tenantId/accountId/channel/peerId/bindingRevision. The pure bridge in m0-port.mjs exports canonicalKFromM0SyntheticContact(contact) and createM0SyntheticSendPort({delivery,contacts}). It only accepts the 120 fictional-contact fixture tenant SYNTHETIC_TEST_ONLY and fake-* business IDs. Repeated M0 sends call one durable native intent (not W09's local mock attempts Map) and return only synthetic ACK/UNKNOWN to the existing M0 harness. Real contact IDs, login and send remain rejected. W09 can wire the returned send callback into PR #3 harness without changing W25's sole sender; native W24/W44 service eligibility must replace fixture checks before authentic M1/M2 can claim integration.

## W09 PR #32 205-case native synthetic baseline: W25 narrow P0 delta (2026-10-25)

This branch inherits W09's already verified native-source integration commit 1590952a4ff2d118820576a0815f5f9e8fdbb495, rather than duplicating W24 or W44. Its shared-native baseline uses W24 IdentityConsentService, W44 openEligibilityStore and createW25EligibilityPort; all real user/provider operations remain prohibited.

Two targeted fixes in W25 only:

- **Post-ARM current grant check:** After persisting an Outbox attempt and before handing work to the synthetic sink, dispatchOne calls the SAME W44 eligibility.check PRE_NETWORK contract again. If W24 identity, W44 grant/budget/custody or route epochs change, it durably marks the attempt NOT_SENT_AUTHORITY_DENIED and the intent DENIED, drops the recipient lease, and never calls the sink. The extra state is evidence of definite non-send, not a Provider UNKNOWN; it does not provide atomic cross-SQLite transaction safety.
- **Receipt replay conflict:** one signed synthetic sourceEventId may only replay with the same original intent, attempt, kind, provider MID and verified source; attempted ACK-to-READ mutation under the same event ID is rejected.

Targeted runnable tests:

    node --test services/api/src/domains/message-delivery/*.test.mjs

Native external-domain regression with the ALREADY existing owner worktrees (no code copies) on DESKTOP-029FH47:

    node services/api/src/domains/message-delivery/native-authority-regression.mjs ABSOLUTE_W24_IDENTITY_CONSENT_MJS ABSOLUTE_W44_NATIVE_BRIDGES_MJS

That script imports native W24 and W44 own code, uses W44's real SQLite reservation and GET/CAS send qualification, withdraws W44 authorization precisely between first PRE_NETWORK check and the final post-ARM check and asserts synthetic sink calls remain 0. It never sends a real message or spends actual model fees.

**Remaining P0:** two cross-service eligibility checks narrow, but do NOT eliminate the unavoidable TOCTOU window across W24 in-memory identity, W44 SQLite budget and W25 SQLite outbox. True atomic/fenced irreversible side-effect execution requires W24/W44/W25 coordinated transactional protocol and SEC owner review. **Remaining P1:** W44 reservation finalization/release for every definitive W25 outcome, UNKNOWN budget hold/reconcile, crash-aware recovery coordination and a production-grade Postgres storage/security architecture are not established. Current test sinks and ACKs are SYNTHETIC, never actual Provider ACK or Meta Delivered.

## W09-2 SQLite cold-start WAL concurrency delta (2026-10-25)

**Only SQLite initialization modified**: the two-process intermittent SQLITE_BUSY from PR #32 originates in simultaneous first-open PRAGMA journal_mode=WAL. Initialize with a 250ms SQLite startup busy timeout and at most 16 BUSY re-attempts separated by 40ms (applied ONLY to WAL PRAGMA and idempotent IF NOT EXISTS schema DDL), then restore the original 5000ms transactional busy timeout. The constructor closes the connection if init fails. Business operations, dispatchOne, W44 armSend / settlement, ACK, UNKNOWN, and crash-recovery behavior are unchanged; never retry UNKNOWN or a side-effecting send.

**Measured before patch**: original two-independent-worker cold-start test failed with "database is locked" at index.mjs:46 on round 7 of 24 (23 PASS / 1 FAIL).

**After final bounded retry**: 28/28 native W25 tests ×3 runs PASS. The new simultaneous-start test holds 6 independent OS workers behind one startup barrier, then releases them together against a fresh DB, validates one business SendIntent, one persisted Outbox attempt and one per-peer fence, and repeats this 12 times per suite; 36 verified cold starts / 216 subprocess workers across the final 3 runs. Separate test proves UNKNOWN persists through database close/reopen and two independent restarted workers never retransmit that intent. All are fake synthetic data, not real provider ACKs.

W44 exact native SHA 1509f4c44a49faf9a8a831d52b0a659ca6f3ddc1 interop script also PASS against this W25 code: persisted W25 attempt → W44 armSend, revoke/takeover fence, trusted settlement, UNKNOWN/late synthetic ACK preserved. PR #32 integration SHA 198d2530ba04625e4ab6ab8681ce3f6044dc78a5 is inherited; its historical 80-item suite was not redundantly rerun.

**Remaining HOLD**: no independent production security release; W24 memory-based authority and multiple SQLite DBs still require full across-process mutation closure, real provider irreversible-send controls, trusted signed provider receipts and a production-grade DB/storage/secret migration. No live sending allowed.

## Issue #61 W25 native upstream ingress owner delta (2026-10-26)

New native-ingress-port.mjs is a fail-closed thin ingress PORT for existing owners, NOT another sender, Outbox, message database or proof of connected channels. Existing MessageDelivery remains SyntheticConnectorSink-only and never sends to personal social accounts. No second message database created.

createNativeIngressPort requires (1) W24 strict durable identityService.isDurableIdentity true, assertCurrent(k), evaluate(READ_INBOUND); (2) W47 trusted local user principal, NOT caller-supplied JSON; (3) the actual W26/W27/W28/W29 SDK owner nativeOwner.connectionState(k) and nativeOwner.verifyInbound(event), which MUST authenticate signed/authoritative SDK data within the worker; (4) W47/W09 original messageRepository.insertOriginalIfAbsent(k+provider MID), atomic by full K+native MID across OS workers. No credential/token copying, no self-proclaimed provider event.

acceptInbound rejects SYNTHETIC_TEST_ONLY, fake identity, offline/revoked connection, unverified upstream source, stale canonical binding, W24 denial, reconnecting worker, missing persisted repository. It passes original text and provider MID unchanged to existing native messageRepository. The return is a repository acknowledgement, NOT a provider sending ACK. readiness(k) reports WAITING_USER_AUTH unless verified W24 binding and real worker are actually ONLINE.

All W25 domain tests: 34/34 PASS including 6 new ingress port contract negatives. These use controlled injected test owner functions; there is NO actually authenticated provider MID, SDK signed callback, live channel or UI claiming USER_DELIVERED.

Precise cross-Owner P0 BLOCKERS:
- W24/W44 strict existing identity still only allows SYNTHETIC_TEST_ONLY and fake-* K; must support authoritative actual local-account K before native record. Never trust raw social ID claims from Web/IPC.
- W26-W29 actual official upstream SDK instance, authorized current binding, real connectionState/verifyInbound + provider MID remain owner work. Current W09 bb1be7bf joined connector paths were synthetic. W28 in-progress SDK node_modules observed, but not actual logged-in account.
- W47/W09 current server returns contacts=[] and EFFECTS_DISABLED; no existing native messageRepository API was provided for W25 to call. No duplicate DB must be invented.
- W25 original receipt path still is ACKED_SYNTHETIC, not real Provider ACK. Real W25 single sink, W44 durable ARM including Agent disable coordination, trusted SDK receipts/settlement, end-to-end app auth and independent SEC review remain P0. Do not bypass them to get a green badge.
- No real social login, send, private content, fee or 44751 redeploy. Status for actual native vertical path: WAITING_USER_AUTH plus pending upstream owner runtime and source integration, NOT INTEGRATED_STAGING_PASS.
