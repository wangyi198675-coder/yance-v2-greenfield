# W28 → W09-2｜Issue #77 WhatsApp Baileys Native Authorization OWNER ACK

Date: 2026-10-27. Owner: W28, ONLY `connectors/baileys/**`. This is incremental to existing genuine `baileys@7.0.0-rc14` and original `native-worker.mjs` from #62; **no reimplementation, no synthetic replacement, no W46/W47 edits**. No account login, QR scan or actual send occurred.

## Current W28 native authorization entrypoint (not yet mounted by W47)

- Factory: `createBaileysNativeSetupController({createWorker,verifyNativeSession})` exported by `native-authorization-setup.mjs`.
- Inject original Owner worker using `createWorker: observed => createNativeBaileysWorker({authorization,authStore,identity,inbound,observed})`. Do not instantiate two SDK sockets for a single signed ChannelAccount. `observed.onQr` is emitted by **real Baileys `connection.update.qr`** only, then `createBaileysPairingViewPort` renders it with pinned open-source `qrcode`; there is NO generated/sample QR in production code.
- `verifyNativeSession({nativeSession,operation,channel:'WHATSAPP_PERSONAL'})` must verify a **server-derived current W54 first-party native session** each call, returning `{verified:true,kind:'NATIVE_FIRST_PARTY',principalRef,installationRef,sessionRef,revocationGeneration}`. The original W47 resolver, not a browser-supplied header or request body, owns this.
- Methods: `readStatus({nativeSession})`, `beginPairing({nativeSession,accountLocator})`, `readQr({nativeSession})`, `disconnect({nativeSession})`, `revoke({nativeSession})`, `reconnect({nativeSession,accountLocator})`.
- Binding: W24/W44 `authorization.authorizeStart({userAction,accountLocator})` must issue verified principal/grant/consent/expected `tenantId,accountId,bindingRevision,accountRevocationEpoch` and `platformPermitted,userConsented,principalVerified` from original Owner signed proof. For first enrollment, use `enrollmentApproved:true` while `accountVerified:false` until actual SDK open and W24 verifies native self JID/LID. For reconnect, BOTH `restoreApproved:true` and `accountVerified:true` are mandatory. The original Owner must forbid old removed accounts. Actual `identity.resolveAccount` is verified **after** SDK `connection='open'` before `ONLINE`.
- W55 native protected Signal auth `authStore.open({binding,userAction})` must return persistent encrypted/Baileys-compatible `{state:{creds,keys:{get,set}},saveCreds}`, and `authStore.revoke({binding})` must destroy current protected account keys/reconnect grants. W28 does NOT store keys, plaintext session or `useMultiFileAuthState`.
- `revoke` immediately fences Worker, including concurrent `authorizeStart` and attempts after previous `disconnect`; no same-instance reconnect after revoke. `disconnect` clears QR and socket, preserves only a non-secret account binding reference so a later authenticated user **can still revoke** the existing protected keys. Cold restart always `WAITING_USER_AUTH`; explicit W47/W24/W55 approval required before new Socket.
- `readStatus` returns `state:WAITING_USER_AUTH/STARTING_NATIVE_SDK/WAITING_QR_SCAN/ONLINE/HOLD_IDENTITY/DISCONNECTED/REVOKED` based on real SDK events and current W24 eligibility; `account` with true native self JID/LID, ChannelAccount, revision and account epoch ONLY after native `open` + W24 account proof. Every response `canSend:false`; W25 sole Outbox and Send authority.
- `readQr` returns short-lived in-memory `imageDataUrl,expiresAt,generation`, ONLY when original SDK produced its native QR and current W54 principal/renderer agrees. Returns `SDK_QR_NOT_AVAILABLE` before SDK event, after expiry, disconnect or revoke. No fake data and no QR in status/log/files.

### Ready-to-mount ORIGINAL W47 HTTP adapter (not a new server)

`createBaileysNativeSetupHttpHandler({controller,resolveSignedNativeSession})` from `native-authorization-http.mjs`, with the existing W47 `req/res/url` interface; no `createServer()`, no new port, auth system or UI. **W47 must explicitly mount it** after its current first-party signed Session, Host/Origin/Same-Site/CSRF protections. `resolveSignedNativeSession({request,operation})` must return `{nativeSession,originVerified:true,csrfVerified:true,rendererVerified:true}` based on W47/W54 native server checks (not browser headers).

| Operation | W47-route to mount | Result |
| --- | --- | --- |
| GET current | `/api/v2/providers/whatsapp-personal/native/status` | Actual SDK status; no authenticated account => `WAITING_USER_AUTH`, `canSend:false` |
| POST connect button | `/api/v2/providers/whatsapp-personal/native/authorize` body `{accountLocator}` | W24 approved first enrollment → calls ORIGINAL Baileys `makeWASocket`; status `STARTING_NATIVE_SDK`, no fake QR |
| GET QR | `/api/v2/providers/whatsapp-personal/native/qr` | Actual native QR PNG only when real SDK emitted `connection.update.qr`, otherwise 409 |
| POST disconnect | `/api/v2/providers/whatsapp-personal/native/disconnect` | Close socket, preserve protected account for explicit future reconnect/revoke |
| POST revoke | `/api/v2/providers/whatsapp-personal/native/revoke` | Fence then W55 secret revoke, no auto recovery |
| POST reconnect | `/api/v2/providers/whatsapp-personal/native/reconnect` body `{accountLocator}` | Only signed explicit resume + W24 binding + W55 existing protected authority |

All responses are no-store JSON, fail closed without correct native W54 session, origin/CSRF/renderer proof and no user-supplied `authorized`, `principal`, `cookie` or `QR` accepted in body. The original W46 Accounts pane must call these six W47-mounted routes with user click/first-party session; W28 neither modifies W46/W47 nor claims existing `GET /setup` is a working native pairing route.

## Windows real tests and scope

- Actual installed Node 24.18.0, npm 11.16.0: `npm ci --ignore-scripts --no-audit --no-fund` passes with retained `package-lock.json` and official Baileys 7.0.0-rc14.
- `npm test`: **44 PASS, 0 FAIL** after explicit new real loopback route semantics and SourceSDK-injected Socket/event tests; original 16 fake regressions preserved. Includes: signed session and cross-principal/epoch checks, raw native SDK QR only, verifier-based JID/LID identity after open, cold restart with denied implicit resume, disconnect then revoke protected session, concurrent revoke during `authorizeStart` (zero sockets), second click cannot orphan QR, real HTTP GET/POST body and no-session denials.
- `node sdk-smoke.mjs` real module import = `realSdkModuleLoaded:true;realSocketOpened:false;realAccountConnected:false;state:WAITING_USER_AUTH;canSend:false`. **These tests are deterministic offline SDK/port tests**; they do not establish a platform connection, true QR, user-visible UI or actual account revocation from W55.

## W09-2 / W47 exact join, non-overlapping Owner work

W09-2 may import these W28 exports after independent W28 source review; only W47 mounts the handler and selects original trusted session+CSRF authorizer. Only W46 mounts existing Accounts click/QR renderer. W55 must implement/reuse a genuinely secure persisted Signal KeyStore; W24+W44 bind signed local Principal, legal account enrollment, live K/Peer and revocation epoch; W25 exclusively sends/settles native ACK and enforces PRE_NETWORK. No duplicate backend, Vault, Outbox or UI.

**Remaining**: actual WhatsApp/Meta platform legal permission; user's explicit new account pairing; W47+W54 actual first-party session mapping; W55 real protected Baileys mutable Signal store; W24+W44 current Principal/ChannelAccount/Peer proof; W47 route mount/W46 click; live Baileys Socket/QR/JID/LID/restart/ACK readback and independent SEC. No authority to restore removed accounts, send messages, turn on managed replies or overwrite 44767/44751.

**Status: `W28_NATIVE_SETUP_SOURCE_PASS` candidate / `REAL_USER_PAIRING_WAITING_USER_AUTH` / `W47_W46_MOUNT_HOLD` / `PROVIDER_AUTH_BINDING_HOLD` / `NO_DEPLOY`.** Avoid calling actual UI/online `USER_DELIVERED`.
