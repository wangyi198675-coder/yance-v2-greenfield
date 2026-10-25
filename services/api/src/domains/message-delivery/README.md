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
