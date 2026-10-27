# W47 local operator-approved pairing contract (P0, source-only)
Scope: `services/api/runtime/**`. Product is a personal **single-user, local-first** application. No new Yance login/password, enterprise Identity/IPC service, social account credential or second Sender/Agent.

## Trusted local action — actual interactive operator terminal, NOT browser-provided identity
- Only when the local application owner starts the **installed-mode API in a directly controlled local terminal** with `YANCE_W47_OPERATOR_PAIRING=console` may the operator issue the command `pair` **into that API process's standard input**. This is a genuine explicit local operator action, not an HTTP endpoint, and is disabled by default. The old W54 Tauri `session_status`/native proof is **not** faked or used as an API Principal.
- The API prints a random **32-byte (64 lowercase hex) CSPRNG code** to that local terminal's stderr, with a maximum **90-second** redemption window. It stores only a SHA-256 digest of one outstanding code. Code is atomic one-use and pending codes are invalidated by replacement, `cancel`, `revoke`, operator terminal close or API process exit. Commands: `help`, `pair`, `cancel`, `revoke`. `revoke` also calls the existing server-owned `localSessionAuthority.revokeAll()`.
- No GET/POST/public Header/Origin/actor/session/cookie can **mint** operator pairing codes. The browser may only **redeem** a code already printed after a local operator command. Password manager/browser autocomplete, screenshots, JS logs and URLs must NOT retain the code; it is returned on stderr to the owning terminal, never in health JSON.
- Operator startup is available only with `YANCE_W47_RUNTIME_MODE=installed`. The first installation and signed native-launcher workflow must be audited by W09/W54; do not treat a scripted test `pair` as proof that a human physically approved the UI. Residual risk: an adversary controlling the same OS user, terminal standard input, process or clipboard may impersonate the operator. This lightweight feature DOES NOT claim resistance to compromised local OS.

## Startup, Web same-origin and API contract
```powershell
# Executed in a locally controlled terminal only, after W09's installed-mode
# runtime-build.json and web-origin/port installation configuration are in place:
$env:YANCE_W47_RUNTIME_MODE='installed'
$env:YANCE_W47_API_PORT='0'
$env:YANCE_W47_WEB_ORIGIN='http://127.0.0.1:<actual W09 frontend port>'
$env:YANCE_W47_OPERATOR_PAIRING='console'
node services/api/runtime/server.mjs

# When W47_LOCAL_OPERATOR_CONSOLE_READY appears, type:
pair
# Type the printed ephemeral code into the authenticated frontend UI
# (frontend field/UI belongs to W09 owner; current 44751 is NOT modified).
# Browser sends JSON to POST /api/v2/local-session/redeem through a
# SAME-ORIGIN reverse proxy, then GET /status. Browser shows only real readback.
# To revoke all redeemed sessions:
revoke
```
- Local API must be exposed through the permitted Web origin's **same-origin** `/api/v2/` proxy, forwarding Host and Origin correctly. Cookie is HttpOnly SameSite=Strict and cannot be set/read as localStorage Bearer. Browser-only Origin/localhost never authorizes. The published **44751 static site has no wired pairing UI or proxy in this Owner SHA**; W09 owns exact-front-end route integration and real release gates.
- Existing `local-session.mjs` handles 5-minute default TTL, HttpOnly SameSite cookie, CSRF, logout, server-side revokeAll; no second token or login logic. A shorter **1–300 seconds** session TTL may be requested by the trusted app's startup environment via `YANCE_W47_LOCAL_SESSION_TTL_MS` strictly for test/lifecycle configuration, never more than five minutes. The Cookie Max-Age matches the configured TTL. This environment is server-startup-controlled, not readable or writable by unauthenticated browsers.
- GET `/api/v2/local-session/status` remains HTTP200 with authoritative paired=false without a verified server session. POST `/redeem` without console issuer stays 503, invalid code 401, wrong Origin 403; on one-use success paired:true and session cookie issued. POST `/logout` requires the legitimate cookie, current CSRF, exact Origin and JSON {}; past cookies cannot regain status. `revoke` kills active session without needing browser cooperation.
- A paired local Session is **not** W24 authorized ChannelAccount/Peer K, W44 global/contact Grant or W25 send qualification. On successful LOCAL pairing the global health stays `trustedSession:false`, `canSend:false`, `externalEffects:false`, connected accounts/contacts=0, original W24/STOP GET401 and send403. No actual social account connection, paid models, agent run or messages.

## Acceptance and remaining release owners
- Independent W47 tests include console issue/consume/replay/cancel/revoke/TTL, inherited Session/CSRF/Host/Origin/dual-process safety. Actual Chrome must use a TEST-ONLY copy of exact W09 `B_88DED` static files and a local same-origin proxy; never touch 44751 current release or 47182 old API. Test command `pair` is explicitly initiated by the authorized remote operator in the **test terminal**, not via any HTTP request. Record Chrome status, cookie isolation, logout, real timer expiry, process restart, cross-origin and cross-account unauthorised 401/403.
- W09 owns real 44751 front-end user-visible pairing dialog, Vite/runtime proxy, version update/rollback source and UI acceptance; W54 only if a native Tauri button is later preferred. W47 continues sole runtime-session source. W09 must publish only after exact new SHA CI/SEC and user approval.
- Current isolated test with controlled operator command is **not** a second-user Windows installation proof, and does not test W24 legitimate account authorization, W44 STOP, W25 irrevocable send or user-delivered app. Keep those HOLD.
