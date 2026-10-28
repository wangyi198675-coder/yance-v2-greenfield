# YANCE V2 W27 — Pancake synthetic FB Page adapter / Issue #11

**Status:** nonproduction synthetic contract only. Source owner: W27, allowed path: `connectors/pancake/**`. Product direction: B+C fixed. No real account, no SaaS HTTP connection, no token, no actual send, no automatic failover, no deployment, no paid model calls.

## Run
Requires Node >=20, no external packages.

```powershell
node --test connectors/pancake/adapter.test.mjs
```

## Actual exported interfaces (`adapter.mjs`)

| Interface | Purpose and truth boundary |
|---|---|
| `fullK(identity)` | Validate W24-shaped synthetic `tenant/account/channel/peer_id/binding_revision`; never create identity or grant |
| `requirePageBinding(identity,binding)` | Reject account/peer/binding version and fake-Page mismatches; no token lookup |
| `createSyntheticPancakeInboundAdapter().ingest(...)` | Accept only explicitly marked synthetic fixture events; normalize fake MID and original text to canonical K; idempotence + conversation version; translation left NOT_RUN |
| `prepareSyntheticProviderAttempt(...)` | Pure DTO check of simulated **W25** owner epoch, intent, eligibility and pre-send fence. Returns PREPARED_NOT_SUBMITTED; performs **zero** send calls |
| `classifySyntheticPancakeResponse(...)` | Distinguish HTTP200 success:false, provider accepted but Meta unverified, timeout/429 UNKNOWN. Cross-SaaS retry never recommended |
| `assessSyntheticChatwootStandby(...)` | Fail-closed readiness only; separate existing/missing conversation proofs, explicit approval, current routing, both Apps and no UNKNOWN. Returns `switched:false`; **W25 alone** may CAS owner |
| `reconcileSyntheticMetaReceipt(...)` | Reject late/misbound/foreign-epoch fake receipt. Never label any fixture as verified real Meta ACK |

None of these exports creates a provider request, sender, Outbox, DB migration, access token, verification key, credential store or webhook listener. Any `synthetic=true` / `W25_SYNTHETIC_FENCE` evidence is a **test artifact**, NOT an authentication factor. Production must verify the origin independently, enforce auth and atomic fencing in W24/W25, and provide durable encrypted storage and replay controls.

## Official public Pancake contract pin

`PUBLIC_CONTRACT_PIN.json` fixes the two REST / Webhook OpenAPI **public document snapshots** taken 2026-10-24 on DESKTOP-029FH47:

- REST `https://developer.pancake.biz/openapi/openapi.yaml`, 176520 bytes, SHA256 `ab2e2a9fadd2f170aba2921e459a2d349b42c2675c5883f27f8bbbd052f7130c`
- Webhook `https://developer.pancake.biz/openapi/webhook.yaml`, 38933 bytes, SHA256 `ab327fea1a398553351edde68a992f96c66dbc6fc4a93045d1d23e03f8d0e09d`

Original raw YAML evidence lives in the P2 audit directory `INDEPENDENT_REVIEW_RECEIPTS/NATIVE_FB_PAGE_CANDIDATE/evidence` on the authorized desktop; it is deliberately **not** vendored into the product branch and these public YAML SHA values are **not server commit IDs or a signed commercial protocol version**.

Pancake POST `/pages/{page_id}/conversations/{conversation_id}/messages` returns `200` with `success:false` on some failures; `success:true`/provider `id` is not independently verified Meta delivered/read. Public webhook YAML does **not** give a sufficient signed-header/HMAC verification schema, and `messaging` does not require `request_id`; this adapter cannot accept production webhooks. Conversation `version` may reject stale updates. The docs describe per-Page REST limit 5 requests/s and webhook suspension when >80% failures and >=300 failed within 30 minutes; recovery requires independent reconciliation. These are documentation facts, **not** signed SLA.

## Chatwoot controlled standby boundary

Chatwoot Cloud is only a limited Facebook Page Messenger backup. A **real** Chatwoot Facebook Inbox is not equivalent to a generic Chatwoot API inbox. Existing conversation handover requires same Meta Page/PSID, Inbox and routing proof. Missing conversation requires explicit verified Messenger cold-start permission and window evidence: simply issuing API Channel Create Conversation is not sufficient. The synthetic readiness DTO does not move any ownership or send messages. Pending UNKNOWN always blocks cross-provider redelivery. Production routes and sender epoch CAS belong exclusively to W25, identity/consent to W24. Chatwoot Cloud version, DPA/SLA, Webhook HMAC proof and Meta Conversation Routing remain unverified.

## P0/P1 still open

- **P0** Pancake production Webhook origin authentication, replay windows, duplicate/late events, tamper verification; public YAML unspecified; documented Chatwoot HMAC is not Cloud tenant proof.
- **P0** Real Meta MID mapping to Pancake and Chatwoot IDs, delivery/read evidence, identity rebind and late ACK reconciliation.
- **P0** Atomic W25 Page owner lease/epoch fencing/UNKNOWN quarantine; simultaneous worker and cross-Provider retry.
- **P0** Actual Facebook Page Conversation Routing, both App permissions, existing/missing Chatwoot conversation in lawful controlled test Page, Meta policy and W24 revocation.
- **P0** Pancake/Chatwoot SaaS terms, API entitlement, signed DPA, SLA and qualified commercial permission.
- **P1** Signed upstream schema version/changes, provider token semantics and rate-limit operational conformance; webhook suspension gap reconciliation.
- **Integration dependency** W24 true canonical IdentityConsent K; W25 true durable MessageDelivery Outbox/fence. M0 mock Ports and synthetic event proofs do not close M1 native chain.

Negative tests assert spoofed page/account/binding, stale epoch, no proof/UNKNOWN, duplicate/missing request ID, fake-only MID, HTTP200 success:false, spoofed receipt and both Chatwoot conversation modes. Node tests are **synthetic tests**, not live Page/UAT or legal release acceptance.
