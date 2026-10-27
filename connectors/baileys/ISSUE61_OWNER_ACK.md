# W28 / Issue #61 actual upstream Baileys owner handoff (2026-10-26)

Owner: W28 / WhatsApp Personal; contributor Git identity `wangyi198675-coder <wangyi198675@gmail.com>`; only `connectors/baileys/**`. Parent **actual W09-2 joined source** `bb1be7bf070ceff39681b081b04754a4b4e34cc3`. Highest execution rule and issue #61 latest full-autonomy amendment reviewed. No V1 code or credentials, no second MessageDelivery, no authorization bypass or production/44751 replacement.

## Source and executable evidence

1. Real original npm module `baileys@7.0.0-rc14` installed using an exact version with `package-lock.json`; also `pino@9.9.5` and `qrcode@1.5.4`.
2. npm tarball integrity (`baileys`) `sha512-pewtrljhWx5JTUBvvkXZz1fL3JPiwzjBsnhx/DWf2LWBx1cZNH7J/sF22xDehba5mySWUQU4a1Pwt7lWARUxaA==`; upstream tag object `dbede1fb64c774e4f9a2e93a44221c4139973f52`, tag commit `7e7b0757e3f9f3c7789fb1cfd2f241d5002a199a`. Upstream license MIT as reported by npm registry. Separate WhatsApp platform authorization remains HOLD.
3. Real installed executable JavaScript SDK binary module `node_modules/baileys/lib/index.js` SHA256 `ae8f926f878243d04ec989c0031a3b1ffdf2810f7ae472b864f7bbca811c774c` at time of installation. To reproduce `cd connectors/baileys; npm ci --ignore-scripts; node sdk-smoke.mjs; npm test`.
4. Native SDK smoke actual Windows Node PID **35452** output: `realSdkModuleLoaded:true`, `realSocketOpened:false`, `realAccountConnected:false`, `state:WAITING_USER_AUTH`, `canSend:false`, `contacts:0`. It starts official SDK in its actual Node process; it **does not create an authenticated network Socket** before user agreement.
5. Node 24.18.0 / npm 11.16.0. `npm test` final **28/28 PASS** (9 native-shape SDK injected-socket tests, 3 locally verified QR rendering and viewer-authorization tests, original 16 synthetic adapter tests preserved). `npm audit --omit=dev` **0 known vulnerabilities** at test time; this does NOT certify all transitive OSS licenses or authorize platform usage.
6. Only `connectors/baileys/**` files created; existing `synthetic-adapter.mjs` unchanged. `native-worker.mjs` uses actual installed SDK makeWASocket, native Baileys event emitter, creds.update, QR, log-out, JID/LID normalization, inbound MID and raw receipt source. SDK socket factory is gated behind injected proven W47 session, W24 binding/Peer, lawful platform use, encrypted auth store; no second provider send method.
7. `native-pairing-port.mjs` renders Baileys-generated QR with pinned OSS `qrcode` into the **existing W46 Accounts UI callback** only after trusted W47 viewer check. No standalone login/chat UI or QR logs/trace persisted.

## What is NOT signed / exact owner dependencies

- Real user WhatsApp login, QR scan, restoration of removed V1 account, real contacts, actual MID/Provider ACK/true sending and restart restoration are **NOT_RUN / WAITING_USER_AUTH / PLATFORM_LICENSE_HOLD**. SDK import+factory behind W47 is **not** a connected Socket.
- **W47 / W54**: real first-party signed native session and a caller-only protected QR display/Pair button API; user action must be bound to existing installed application, no localhost-only authorization.
- **W24 / W44**: verified actual platform ChannelAccount, user Principal, Peer ownership, binding_revision/accountRevocationEpoch/Consent/Grant; strong `authorizeStart/assertCurrent/resolveAccount/resolvePeer` ports; do not use W28 old JSON-string fake `canonicalK` as authority. Real K generated/validated by W24.
- **W55 / credential store original Owner**: durable encrypted Baileys Signal auth state `{creds,keys:{get,set}}` + `saveCreds/revoke`, OS isolation, revocation and no reopening removed account. Existing model API key Vault alone does **not** implement mutable WhatsApp auth keys.
- **W25**: only authorized provider send and receipt correlation/UNKNOWN idempotency, W24+W44 admission and PRE_NETWORK fences. W28 has only callback ports for inbound & raw native receipts; no physical sender or second Outbox. If W25 requires a real Baileys sink, original W25 Owner must wrap this Worker under its own irreversible-send authorization (W28 must not send from a separate UI route).
- **W45/W43/W46 / W09-2**: W09 must connect the existing inbound pipeline to translation, Agno and one Composer. W46 Accounts uses the ready QR/status bridge; currently there is no W46 in-app route signed by this W28 source alone.
- **Independent SEC/LEGAL**: WhatsApp Personal unofficial automation platform terms, OSS transitive licensing, proof/epoch race, live recovery, real ACK, Windows installed UI and network behavior must be tested under explicit user approval.

Current status: **SOURCE_PASS candidate for real library installation + gated native source; PROVIDER_AUTH_BINDING_HOLD / WAITING_USER_AUTH / NO_DEPLOY**. Do not claim INTEGRATED_STAGING_PASS or USER_DELIVERED without actual W47/W55/W24/W25/W46 integration and live user-approved provider evidence.
