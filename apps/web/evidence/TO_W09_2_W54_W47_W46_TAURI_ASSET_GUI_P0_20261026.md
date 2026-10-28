# W46 → W09-2 / W54 / W47 | 2026-10-26 | P0 Windows Tauri B+C blank screen source gate

**W46_ASSET_HOST_SECURITY_PRESERVING_SOURCE_BUILD_CHROME_PASS / INSTALLED_WEBVIEW2_POSITIVE_HOLD / W47_TRUSTED_SESSION_HOLD / FOUR_CHANNEL_AUTH_HOLD / NO_44751_DEPLOY**

## Exact diagnosis and authorization

- Original W09-2 joint SHA: `894c25643cdde8af2307c8d8396dad96c39471eb`, staged Web 44766 / API 48191, installed-mode W47 runtime. Formal user Web 44751 remains `C_8EB7314`.
- W54 actual isolated NSIS WebView2 previously loaded `http://tauri.localhost/` with JS `LOOPBACK_ONLY`, #app rootChildren=0. This is an actual installed WebView2 **RED**, not a Browser issue.
- This W46 Owner isolated worktree `C:\Users\1\Documents\YanceV2\Worktrees\W46_894_TAURI_LOOPBACK_OWNER_20261026`, branch `w46/p0-tauri-no-synthetic-guard-20261026`. Delta only W46 authorized `apps/web/vite.w46.config.mjs` plus new `apps/web/tests` and `apps/web/evidence`. No old Vue source, no protocol SDK, no Agno/W25/other Owner code changed.

## Minimal source fix (no broad trust bypass)

- Existing B+C transformation instantiated `createLoopbackTakeoverPort({baseUrl:window.location.origin})` and `createLoopbackManagedStopPort(...)` **unconditionally during Vue setup**, even when W46 productDraft hid the synthetic offline Composer. Those test-only constructors correctly threw on the official Tauri static asset origin `http://tauri.localhost/`, blanking the entire Vue app.
- New strict static UI origin `window.location.protocol==='http:' && window.location.hostname==='tauri.localhost'` enables the W46 existing product workspace, **not authentication, Actor, paywall, send or W47 native privileges**. All test-only lab ports instantiate **only** when original B+C offline lab is active on exact `localhost/127.0.0.1/::1`; on productDraft or Tauri asset origin both are `null`. Synthetic W45 lab message watch similarly exits before any HTTP GET in a real product renderer.
- W47 original Host/Origin and trustedSession checks remain unchanged. Tauri static shell cannot mint W47 Session, bypass W54 OS/current-WebView identity or call W25. No `tauri-plugin-localhost` wildcard added and no remote host is treated as a trusted principal.
- Original B+C unique Composer/Private Brain/Channel account buttons, Reka UI, five themes and 252 StableID mapping unchanged. No duplicate agent or sender.

## Actual tests and evidence

- On authorized Windows desktop with Node24, exact inherited runtime modules: `node --test apps/web/tests/*.test.mjs` **116/116 PASS, 0 fail, 0 skip**; original frozen B+C `npm test` **15/15 PASS**.
- Real Vite 7.3.7 W46 candidate build: **2679 modules PASS** (nonproduction `apps/web/.w46-test-dist`; different scope from W09 originally cited 2675 modules).
- Installed Windows **Chrome**, explicitly emulating the *exact installed Tauri asset origin* via `--host-resolver-rules=MAP tauri.localhost 127.0.0.1`, tested `http://tauri.localhost:4189/` at **1360×900, 950×620, 430×850, 320×680** + original product `http://127.0.0.1:4189/?arm=CHAT-BC-FUSION&productDraft=1` at 1360×900. **5/5 PASS**, Vue `#app` rootChildren>=1, 1 product/1 live CHAT, 0 fictional contact DOM, 0 synthetic `/w46-native-test` GET/POST, 0 POST, 0 browser JS exceptions, 0 fake/paid models, 0 real social sends. Actual clicks into four-channel account controls, status and official setup request, unique Brain, then CHAT; original W47 routes respond as actually authorized/unavailable, no QR invented; Brain send remains disabled.
- Real browser JSON `apps/web/evidence/W46_TAURI_LOOPBACK_ASSET_CHROME_UAT.json`. Real remote Chrome screenshots `W46_TAURI_HOST_{320,430,950,1360}_CHROME.png`, `W46_LOOPBACK_PRODUCT_1360_CHROME.png`; test runner `apps/web/tests/w46-tauri-asset-host-real-chrome.cjs`.
- W47 staged API 48191 actually returned runtime health200 (`trustedSession:false`), contacts401, public model catalog200. Never promote public models/OS-user to authorized access.
- **Important truth:** This test uses genuine Windows Chrome with Tauri hostname emulation, **not a rebuilt and installed Windows WebView2**. W54 remains the sole Tauri/NSIS Owner; existing installed W54 candidate with old assets remains RED until W54 packages this exact new W46 Vue build and physically installs/starts it, checks CDP #app children and both cold starts. Do not cite Chrome proof as installed WebView PASS.

## Exact remaining parallel native handoffs

1. W09-2 import this W46 Owner delta into separate joint branch; update and review W47 `apps/web/runtime/vite.w47.config.mjs` exact pinned W46 owner blob/hash because a previous SHA is hardcoded. Build/review bundled JS SHA. Do not weaken source pin or set `W47_R4_ISOLATED_PREVIEW` bypass.
2. W54 isolated `W54_BC_LOOPBACK_FIX_NSIS_QA_20261026` currently has uncommitted Tauri packaging and official NSIS candidate assets; *do not overwrite this other Owner's worktree*. W54 should rebuild own isolated user NSIS from new reviewed W46 bytes using official Tauri built-in `tauri.localhost` (no broad localhost IPC plugin necessary), install into separate app ID, and capture actual WebView2 CDP error=0, rootChildren>=1, BRAIN/ACCOUNTS/CHAT click and restart. Reuse latest W54 signed boot `a7044a5e...` separately as approved; browser proof alone cannot certify it.
3. W47 current joint server still denies trusted Session/Channel auth without signed W54 child. W47 latest separate native WebView lease code from Owner `1ebab0ed...` must be reviewed/real process joined with W54 current-user OS/installation/renderer and invalidation; no generic localhost privileged POST. W55 native protected Key remains SEALED until user-specific enrollment + payment and signed Executor lease.
4. Four channel W26–29 Owner real SDK statuses must pass W47 existing native `/providers/*/status|setup` front door. No signed user platform login/QR, actual inbound MID or private read, W24 full K, W25 irreversible outbound, W43 model Paid Turn present; this is **WAITING_USER_AUTH / NATIVE_INTEGRATION_HOLD**, not USER_DELIVERED.
5. No real social account login, old revoked account recovery, unapproved private-data read, real social sends, charged model, user Key intake or production 44751 switch executed.

**W46 P0 judgment: static asset host startup defect source CLOSED with original safety checks preserved. INSTALLED_WEBVIEW2_E2E, trusted login and actual Agno/user channels remain HOLD pending W54/W47 separate signed native work.**
