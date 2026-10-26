# W25 → W26–W29/W24/W44/W09-2 | Native inbound MID owner glue (Issue #61)

The existing W25 `MessageDelivery` is the **only** Outbox and provider-send authority. In this W25 Owner change we ONLY add `createW25NativeInboundPort` to its **same existing SQLite database** for durable inbound MID recording. No second sender, new application database, app login, native transport or fake ACK.

## Running code / provider Owner contract

Export: `services/api/src/domains/message-delivery/index.mjs` reexports
`createW25NativeInboundPort({delivery,verifyNativeSource,readW24Identity})`.
`delivery` must be a real existing `MessageDelivery` instance with the same `DatabaseSync`.
`const inbound=createW25NativeInboundPort({...})` returns
`await inbound.acceptInbound({k,source,sourceEventId,providerMid,original,synthetic:false})` and **session/authority-gated** `await inbound.getInbound({id:receiptId,nativePrincipalId:serverAuthenticatedPrincipal})`. Each read rechecks the original W24 current K and epochs before returning private text; a naked receipt ID never grants read access.

- `k` uses existing W25 five-part `{tenantId,accountId,channel,peerId,bindingRevision:string}`, **not** a client-provided Actor.
- Source literal by verified account: `FB_PERSONAL=mautrix-meta`, `FB_PAGE=pancake`, `WHATSAPP_PERSONAL=baileys`, `TELEGRAM_PERSONAL=tdlib-json`.
- `verifyNativeSource(event)` MUST come from the actual W26–W29 verified native transport/official signed webhook or authorized SDK account, returning independent source/tenant/account/peer/binding/current principal + epoch evidence. This callback must be **private server/SDK owned**, never return true just because client submitted `isNative`, header/Origin, fake IDs or sample DTO. The source refuses simulated events and mismatched identity.
- `readW24Identity` must be the actual `createW24NativeInboundIdentityPort(...).readW24Identity` using W24 strict identity+W44 durable versions; no trusting an event to mint identity or Consent.
- The only new table `inbound_messages` is in W25's existing WAL/FULL Outbox DB, with unique account/channel/peer/source/MID and account/channel/source/eventId keys. Provider replay, swapped MID under same source event, stale binding revision, spoofed source, wrong account, changed text/epoch are rejected; restart and parallel SQLite instances see the same persisted row. Does **not** create a SendIntent.
- `original` is retained as local message data. **Real user content persistence / disk encryption / legal consent remain P0 integration gates**; do not feed live private data until actual user approves and security/data-at-rest path is reviewed. The current code uses existing W25 plaintext SQLite storage behavior; it is not claimed as a secure native vault. W45 translation and W43/Composer content delivery must go through the single authorized W09 runtime, NOT direct public HTTP from this helper.

## Outbound W25 boundary unchanged — critical exact security finding

The original `MessageDelivery` constructor at `index.mjs` accepts only `SyntheticConnectorSink`. It cannot physically transmit via actual SDK. Do **not** bypass its constructor or install another sender in W26–W29.

To enable real sending once native trusted session/legitimate platform grant are available, the W25 source Owner must extend **the same existing** `dispatchOne` sink boundary to a verified upstream SDK transport, preserving W25 receipt/UNKNOWN/custody/budget checks. **W44's current `createW25SettlementVerifier` only accepts `ACKED_SYNTHETIC/DELIVERED_SYNTHETIC/READ_SYNTHETIC` and `VERIFIED_SYNTHETIC_RECEIPT`; these are not genuine provider receipts.** W25+W44 must agree independently authenticated provider receipt provenance, native state names and W44 settle behavior before this extension is activated. A HTTP200/SDK acceptance or Telegram quick ACK is NOT delivery/read; UNKNOWN never causes automatic retry. Page Pancake↔Chatwoot fallback cannot produce a second physical send.

## Repro and actual test classification

- Windows Node24 existing W25 `node --test services/api/src/domains/message-delivery/*.test.mjs`: **40/40 PASS** (28 existing + 6 original native/outbox extras + 6 new native ingress tests). All new verifier callbacks are explicitly artificial test fixtures, **NOT real upstream SDK events or authorized social users**.
- Cross-owner actual W24 + W44 + W25 source-denial test separately PASS (1/1) when W24 Owner new module is supplied via `YANCE_W24_ROOT` and W44 via `YANCE_PR32_ROOT`; for integration replay the test fixture is staged at:
  `DISPATCH/P2_AUDIT_ONLY_20261024/COORD_AGGREGATE/W24_W25_NATIVE_OWNER_JOIN_REQUIRE_EXACT_W24_ROOT_20261026.test.mjs`. Do not add to isolated W25 GitHub CI before W09 merges the new W24 source.
- Existing W24 original+strict suite **70/70 PASS**, including source-shaped real K denied by W24/W44. No native upstream SDK was connected, no logged-in account, no real MID/ACK receipt and **zero physical sends**.

## Exact minimum W09/channel-owner task

W26–W29 shall run the approved upstream SDK/bridge in their own Owner worktrees and provide its native verified source callback and outbound SDK send port to the **one** W25 Outbox, plus real credentials handled by the approved native W54/W55 host. W09 joins those modules in its separate integration branch, without modifying W24/W25 Owner source and without substituting synthetic adapters. Re-qualify W24 real K + W44 true actor/consent/grant with minimal Owner modifications after they have valid authorization. An authenticated local application session is necessary but NOT evidence of social account ownership or peer consent.

**Current four-channel true USER_DELIVERED status: WAITING_USER_AUTH plus NATIVE_SDK_RUNTIME_HOLD. No 44751 redeploy, no real provider send, no claim of ACK.**

## 2026-10-26 4fc924b4 native Owner callback mapping
New native-channel-owners.mjs + tests accepts original W27 official readback (deliverToExistingInbound), W28 native Baileys messages.upsert (acceptInbound), W29 TDLib updateNewMessage (onAuthorizedInbound), and verified W26 native Matrix bridge event (onNativeBridgeInbound). K is mapped to original W25 five-part wire, MID/event namespace stable, W25 verifyNativeSource + readW24Identity + existing checkPrivateInboundConsent must all approve before any private text persistence. W28 and W29 receipt callback deliberately return PENDING_W25_PROOF and cannot mark provider ACK, because native W25 physical send + W44 settlement are not yet authenticated for real receipts. No new sender, no logged-in accounts, no private user data. These are owner-contract tests with explicitly injected nonproduction verifiers, not a real provider positive.
