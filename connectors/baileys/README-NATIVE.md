# W28 Issue #61 | actual Baileys SDK port | source-only release

This is additive to `synthetic-adapter.mjs` (untouched); **NOT** a second WhatsApp client, protocol stack, Outbox, custom auth server or user login.

## Reproducible native installation and runtime readiness

From `connectors/baileys` run `npm ci --ignore-scripts`; then `node sdk-smoke.mjs` and `npm test`.
`sdk-smoke` loads the **real installed npm Baileys module**, its Socket constructor, auth primitives and QR renderer in a clean Node process and returns the PID and `WAITING_USER_AUTH`. It deliberately opens **no network Socket**: actual `makeWASocket()` requires a user-initiated permitted account pairing and the existing secure W55/V2 native credential custody port.
Do not claim the smoke process is WhatsApp ONLINE.

Actual npm package: `baileys@7.0.0-rc14`, upstream tag object `dbede1fb64c774e4f9a2e93a44221c4139973f52` and dereferenced source commit `7e7b0757e3f9f3c7789fb1cfd2f241d5002a199a`; MIT license is the package license, **not a WhatsApp service license**. Actual tarball SHA512 integrity is in committed `package-lock.json`. Also pinned `pino` and `qrcode` for official socket logging and approved QR display.

## Real SDK thin adapter

`createNativeBaileysWorker({authorization,authStore,identity,inbound,observed})` directly calls `makeWASocket` from the real installed Baileys package; subscribes to the **upstream emitter**, uses upstream QR and `creds.update` events; handles `messages.upsert`, `messages.update`, `message-receipt.update`, `contacts.*`, `chats.*` and `messaging-history.set`. Original provider MID, sender key, original text and upstream status fields remain intact. No outbound method exists.

`worker.getStatus()` returns only state/counters/SDK version, and `canSend:false`; W47 can read this from the existing first-party local API without copying private account data.
`worker.start({userAction:'PAIR_OWN_ACCOUNT',accountLocator})` can run ONLY after W47/W24 inject an independent **verified** `authorization.authorizeStart` and `assertCurrent` for a signed local Principal, legal provider approval, account ownership, nonrevoked binding revision and current account epoch, plus `authStore.open` returning protected native Baileys `state:{creds,keys}` and `saveCreds`. No default allow, no auto recovery, no V1 import, no plain `useMultiFileAuthState`.
`worker.revoke()` immediately fences the SDK and calls the injected trusted credential Owner revoke. With `loggedOut`, no auto reconnect. Explicit approved restore is required even after restart.

**W46 existing UI integration**: `createBaileysPairingViewPort({assertAuthorizedLocalViewer,showImage,clearImage})` uses mature `qrcode` only on an actual authorized Baileys `connection.update.qr`, checks W47 signed first-party viewer at display time, renders an expiring in-memory image to the original Accounts area, never logs or stores QR. Original W46 UI displays `WAITING_USER_AUTH` before user action and maintains the only Composer; no alternate HTML chat page or web endpoint is created.

**W24/W44/identity integration**: injector must prove actual `principal → ChannelAccount → selfJid/selfLid → Peer → binding_revision/accountRevocationEpoch`, not trust a UI flag. `identity.resolveAccount/resolvePeer` are adapters to existing W24 and must reject old K and unauthorized Peer. W28 never issues Consent or Grant.
**W25** owns sole message admission/send, actual provider ACK verification/late ACK/UNKNOWN, durable dedupe and PRE_NETWORK checks. W28 only forwards raw native receipt and inbound events to injected Owner ports, cannot send or settle.
**W45/W43/W46** consume W24/W25-validated inbound event and act through existing translation, official Agno run, 0–3 provenance replies and unique B+C Composer; W28 does not create another brain or UI.

## Honest limits

Installed SDK and code tests are **SOURCE_PASS candidates**, not real platform online, WhatsApp QR scan, contacts, true MID or ACK, session restart, encryption at rest, native Windows UI click acceptance, nor `USER_DELIVERED`. Those require the user's explicit account authorization, platform use permission, and actual W47/W24/W55/W25 contracts. The existing W55 cloud-model credential vault does not automatically prove Signal auth state storage is implemented. If missing, add the smallest compatible Signal auth storage interface under the original credential Owner, do not duplicate a vault.

Security RED/HOLD: legal WhatsApp Personal unofficial client automation terms; signed local Principal; real proof, persistent Signal key version/epoch, cryptographic secured storage, sanitized no-QR logs, true W25 receipt correlation; independent SEC and installed Windows UAT. Do not use prior revoked V1 account secrets, override main or `44751`, send messages, or auto login.
