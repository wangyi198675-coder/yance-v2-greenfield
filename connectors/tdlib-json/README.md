# W29 — Telegram Personal: TDLib JSON synthetic inbound + receipt contract

**Issue:** [YANCE V2 #13](https://github.com/wangyi198675-coder/yance-v2-greenfield/issues/13)
**Scope:** only `connectors/tdlib-json/**`. NONPRODUCTION, user **has not authorized real Telegram login/sending**.

This is **working source code with executable tests** for a strictly synthetic protocol projection, not an installed TDLib native build, not a production Telegram client, not a backend route, and **not yet plugged into W09's M0 mock ports**. It consumes local TDLib-shaped JSON fixtures, never uses the network or native `td_send`. It does not own a send queue, outbox, idempotent physical delivery or authorization issuance.

## Run
```powershell
cd connectors/tdlib-json
npm test
npm run test:coverage
```
Uses Node's built-in test runner, no npm installation, env secrets or dependency resolution needed.

## Implemented (actual executable interface)

`createSyntheticTdlibJsonAdapter({ bindings, currentBinding, onEvent })`:
- `bindings` are preprovisioned fake route mappings, with **full K**: `{tenant,account,channel,peer_id,binding_revision}`, `tdlib_client_id`, `chat_id`. The only tenant is `SYNTHETIC_TEST_ONLY`. All accounts, peers, @extra and attempt ids must start `fake-`. A single TDLib client/account can have multiple chats; same chat ID in different accounts is isolated.
- `currentBinding(binding)` is a mandatory injected **W24-authoritative** function. Disabled/revoked/rebound/wrong account or revision fail closed and late receipts are quarantined. This is an in-process fake authority in current tests; W24 native interface not yet connected.
- `handleEnvelope(jsonOrObject)` maps TDLib `updateNewMessage` (synthetic text only) into `{kind:SYNTHETIC_INBOUND, k, chat_id, provider_message_id, original, provenance, translated:false, translation:null, simulated:true}`. Duplicates use K+chat+MID.
- `bindSyntheticAttempt(...)` **only registers correlations** for a W25-owned, synthetic attempt; has no sending effect. `@extra` + `@client_id` correlate a fake `message` response with temporary message id; optional pre-known temp id supports out-of-order updates.
- `updateMessageSendAcknowledged` → `SERVER_QUICK_ACK_NOT_SENT`, explicitly **not sent/delivered/read** (quick ACK means send request reached Telegram). `updateMessageSendSucceeded` remaps `old_message_id` to final `message.id` as `PROVIDER_SEND_CONFIRMED_NOT_READ`; `updateMessageSendFailed` maps to synthetic failure, without storing provider text. Duplicate and late events are bounded to original fake K.
- `markUnknown({td_extra})` records `DELIVERY_UNKNOWN_NO_RETRY`; a late success may reconcile that same attempt. Neither error nor timeout authorizes a second submission. All records are marked `simulated:true`.
- All downstream emitting occurs through injected `onEvent`, never direct TDLib, outbound delivery or W45 suggestion generation. W25 must persist the true outbox and own all physical-send eligibility; W45 translates only with genuine provenance later.

**Int53 rule:** TDLib JSON header describes `int53` numbers and `int64` strings. `chat_id`/message id are int53 and are serialized as exact decimal strings in our canonical DTO; unsafe JS integers, malformed IDs and non-synthetic inbound text are rejected.

## Official interface source pins (read-only, no vendored native code)

- TDLib official Git repository: https://github.com/tdlib/td
- Exact **observed** upstream master commit from `git ls-remote` on 2026-10-25: `ea3f69ce11aef458bfbb09869b809ede4447486f`
- `td/telegram/td_json_client.h` Git blob SHA1 `7ea78bf4c9d6028d543c5a62802fcedb646efe9d`, checked through GitHub at that commit.
- `td/generate/scheme/td_api.tl` Git blob SHA1 `2f70f0abe56da2a107dc857459640accd8751bc1`, checked through GitHub at that commit.
- `LICENSE_1_0.txt` Git blob SHA1 `36b7cd93cdfbac762f5be4c6ce276df2ea6305c2`.
- The blob hashes are **Git object IDs, not SHA256**. This is an API review reference, **not** a reviewed production build, approved tag, downloaded library, dependency lock/SBOM or hash-pinned native binary.
- TDLib JSON C API: `td_create_client_id`, `td_send`, `td_receive`, `td_execute` with `@client_id` / `@extra`. Official use notes single-threaded `td_receive` and ordered updates; none are invoked here.
- Official documentation: https://core.telegram.org/tdlib/docs/td__json__client_8h.html and https://core.telegram.org/tdlib/getting-started
- Native-send updates schema: https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1update_message_send_acknowledged.html , https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1update_message_send_succeeded.html , https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1update_message_send_failed.html

## HOLDs and deliberate gaps

- **P0:** Telegram API terms and content AI/data license obligations remain for LEGAL. User account authorization does **not** automatically authorize counterparties' content for ML, inference, long-term memory or AI delegation.
- **P0:** Source commit is research evidence only: no TDLib `tdjson` binary, build/ABI/hash/SBOM, legal `api_id`, auth state/login, real chat_id/MID/ACK or subscription. None are loaded or tested.
- **P0 dependency:** W24 current native canonical binding/consent contract, W25 sole SendIntent/outbox/replay-safe attempt correlation, and W45 people/translation path are not integrated here. Until merged, this adapter is a pure synthetic boundary.
- **P1:** Future receiver must be a single owner of TDLib event ordering/persistent cursor in W25's transaction model, with crash-safe event emission and close/reopen/revocation rollback; in-memory test maps here are not durable recovery evidence.
- TDLib may support secret chats, media, edits and calls; this adapter does **not** advertise those capabilities.
- No second sender, Telegram Bot API, alternate TDLib implementation, login, account reauthorization, model call, download of dependencies, or production deploy.

The code intentionally lacks any native/client transport; **passing tests does not mean a real Telegram account has received or sent a message**.

## 2026-10-27 R4 compact Smart Inbox: official native extension

The original Issue #13 text above documents ONLY the old synthetic adapter.
Official Windows TDLib JSON 1.8.69 was subsequently compiled from upstream
ea3f69ce11aef458bfbb09869b809ede4447486f; actual tdjson.dll SHA256:
ae286549e2abc071acf67a3423468e8a5a8b488b4cdc368d6f203b2bf1d355e0.
See evidence/ISSUE61_NATIVE_OWNER_HANDOFF.md and the Issue #77 owner evidence.

R4 SOURCE PORTS, NOT YET W47/W46 APP INTEGRATION:
- src/native-telegram-auth-flow.mjs: existing user-click official authorization and logout.
- src/native-tdjson.mjs: same official TDLib worker, now requestRead with
  correlated @extra native responses, W47 private session rechecks,
  native close/revocation cancellation, bounded timeout and no sendMessage.
- src/native-telegram-chat-data.mjs: createW29TelegramChatDataPort
  with listChats/getChats+getChat, listContacts/getContacts+getUser,
  readHistory/getChatHistory forwarded to original W25 persistence,
  readChatAvatar/getChat+downloadFile forwarded to original W47 asset consumer.
  Original W24 active ChannelAccount+Peer K and Consent are required.
  No new contacts store, timeline DB, public file URL or second sender.

New real native pre-login test proves all 5 private SDK reads are denied.
Other data tests use synthetic DTO fixtures and cannot prove real account
or real chat/avatar data. W47 and W46 own original API/UI and plus-menu wiring.
Real Telegram user consent, SDK QR, contacts, history and UI remain HOLD until
the account owner actually connects legally; no automatic V1 restoration.
