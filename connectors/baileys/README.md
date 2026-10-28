# W28 WhatsApp Personal — synthetic Baileys protocol adapter (Issue #12)

**Status: executable nonproduction adapter only. No real Baileys runtime, credentials, QR, socket, WhatsApp send, provider ACK, or platform license.**  This directory is the only source owned by W28 in this PR.

## Run

```powershell
node --test connectors/baileys/synthetic-adapter.test.mjs
```

Works with Node 24; uses only built-in test runner and standard JavaScript. No npm install, internet, paid models, real data or WhatsApp session. The upstream pin is **documentary**, not a runtime Baileys dependency.

## Inbound contract (W24/W45 integration target)

`createSyntheticBaileysAdapter({ account, peers, deliveryPort, replayPort? })` accepts a synthetic account in the **full canonical K namespace**: `tenant=SYNTHETIC_TEST_ONLY`, `account=fake-*`, `channel=WHATSAPP_PERSONAL`, `binding_revision` positive integer or `fake-*`. Verified peer mapping requires `peer_id=fake-*`, `jid=fake-*@s.whatsapp.net`, optional `lid=fake-*@lid`. Same peer display names have no authority. Each adapter instance binds an account; other accounts, stale bindings, unknown JIDs, group IDs and real-looking WhatsApp identifiers are rejected.

`connectSynthetic({format:'ENCRYPTED_SESSION_REF_V1',synthetic:true,account:'fake-*',binding_revision:1,key_version:'fake-*',ciphertext_ref:'synthetic://vault/fake-*',revoked:false})` merely increments a **fake epoch**. Never reads the referenced vault bytes, never calls Baileys APIs, never connects or scans QR. `disconnectSynthetic()` only changes local state; `revokeSynthetic()` fences the instance and prevents reconnection. There is no `sendMessage` or queue method.

`ingestSynthetic()` accepts a **bounded synthetic Baileys-shaped fixture**, not actual provider frames. `messages.upsert` must have exactly one incoming `key:{remoteJid,id:'fake-*',fromMe:false}`, `message:{conversation:string}`, and wrapper `{synthetic:true,channel_account,binding_revision,worker_epoch,event_id:'fake-*'}`. Adapter validates identity and passes to **W25-owned** `deliveryPort.acceptInbound({identity,canonical_k,original,provider_mid,provider_key,event_id,provenance,synthetic,delivery_status:'NOT_SENT'})`. This retains unmodified original text and `MID`; the actual identity, translation and Agno chain is owned by W24/W45/W43 respectively. No translation or suggestion is fabricated inside this connector.

`messages.update` / `message-receipt.update` fixtures additionally carry `updates:[{key:{remoteJid,id,fromMe:true},attempt_id:'fake-*',receipt:{kind}}]`. Only four artificial kinds are supported: `accepted`→`PROVIDER_ACCEPTED_NOT_DELIVERED`, `timeout`→`UNKNOWN`, `delivered`→`ACK_DELIVERED`, `read`→`ACK_READ`. These are **simulation labels**, not real WhatsApp delivery evidence. Each event becomes `deliveryPort.recordReceipt(...)`; **W25 alone** correlates attempts, quarantines stale/late ACK and decides authoritative Outbox status. A timeout causes no retry.

`replayPort` is optionally injected **from W25** as `reserve(eventKey)`, `commit(eventKey)`, `release(eventKey)`, with durable atomic semantics supplied externally. Runtime duplicates are coalesced. Failed W25 callbacks release the provisional claim for retry. A restart receives a new adapter instance; W25 must enforce durable dedupe, full K, account revision and sender/revocation fence. This adapter neither persists events nor sends, nor claims exactly-once actual provider delivery.

## Source and permissions

Pinned public **candidate**: [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys) `v7.0.0-rc14`; dereferenced commit `7e7b0757e3f9f3c7789fb1cfd2f241d5002a199a`, inherited from W20 LEGAL-01 review. Baileys itself is MIT candidate. This commit is **not** this application's git HEAD, does **not** mean its package is installed, or grant WhatsApp Personal automation rights. Upstream release candidate, transitive licensing (e.g. signal library), dependency lock/SBOM and official WhatsApp ToS remain independent P0 gates. See `upstream-pin.json`.

## Pending cross-Owner integration / failure gates

- **W24 IdentityConsent:** authoritative current `tenant/account/channel/peer/binding_revision`, consent, epoch and revoked account, not fake config.
- **W25 MessageDelivery:** sole SendIntent/Outbox/provider attempt/physical-peer lock/idempotency, durable replay guard, ACK/UNKNOWN ledger, irreversible boundary grant/budget/custody revalidation. This adapter intentionally has **no sending method**.
- **W23 FileAttachment:** asset ACL, encryption, revocation and metadata; this connector handles only text fixtures and makes no media claims.
- **W43/W45/W46:** Agno Run/translation/provenance/0–3 suggestions/unique B+C Composer beyond this connector's identity+raw original event.
- **LEGAL/SEC:** official platform permission for nonofficial client and continuous personal auto-chat, full MIT/transitive license scan, exact dependency version integrity and real peer consent. Nothing in this PR authorizes QR or platform tests.

Known P0: platform automation permission not verified; no real runtime/auth encryption/QR/reconnect; no actual delivery receipts; no durable W25 deployed; no security runtime signoff. P1: fixture event format is deliberately minimal and must be compared with an **exact pinned Baileys release** before attempting a real Worker. M0 mock tests and this synthetic adapter must never be reported as production-connected M1/M2.

Tests include 16 standalone cases for full K, account isolation, JID/LID aliasing, spoof/rebind rejection, reconnect/epoch, session DTO, revocation race, duplicate and concurrent inbound, W25 refusal/retry, reservation release, accepted vs UNKNOWN vs late ACK and replay after worker restart. All tests use artificial `fake-*` data.
