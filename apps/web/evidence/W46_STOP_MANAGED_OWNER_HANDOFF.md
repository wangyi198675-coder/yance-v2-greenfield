# W46 — original B+C minimal STOP managed authorization UI (2026-10-25)

## Accurate independent source pins
- W09-2 original native combined SHA: `1588975118141af0d8b6033310f410a786faf9b0`
- W44 STOP safety Owner SHA: `66a70a15af885274b74c0124d0e914924579bebf`
- W24 durable Consent/Identity Owner SHA: `1459268eebe4a1a1585e4a7f61bd45adcba7ca8c`
- W25 sole delivery Owner SHA: `7f6fabd9f35d3cf3c27bd661d9627db731ec9ae7`
- W46 previous latest SHA: `88f6c30094a3d6217491c3d1f410a040d91ab3f0`
- Original selected B+C source baseline: `34467cf10c0e9457c2a22dee5a37d1e05dd2ed8b`

## What W46 owns and changed
Original B+C `App.vue` had NO actual stop button. W46 ONLY adds `apps/web/src/BCManagedStop.vue` and `managed-stop.mjs`, integrated in the ORIGINAL B+C chat header next to the existing private brain button through W46 existing build-only `vite.w46.config.mjs`; no new page, reply panel, Agent, database, Outbox, background worker or delivery. Non-B+C experimental routes unchanged. Existing unique CONTACT Composer preserved.

The header offers **停止此联系人** (CONTACT, exact full K) and **停止当前账号** (GLOBAL, exact tenant/account/channel). The Vue client supplies ONLY its selected identity/scope; actor, proof, W44 generation and idempotency are server-derived. It does not trust a local checkbox or Agent active flag. W44 native authority read for this exact K+scope reports ACTIVE, UNQUALIFIED, PENDING or COMMITTED. PENDING shows **停止中**, COMMITTED only after independent W44 mutationResult readback shows **已停止**. Network failure/409/missing authority => **无法确认/接口未接入**, no green success. The original selected contact header/list mode comes from W44 authority status when W46 has a verified read; other unrelated accounts remain as their original frozen synthetic fixture display. All send UI remains disabled.

## Real executed proof on DESKTOP-029FH47
- W46: `node --test apps/web/tests/*.test.mjs`: **53/53 PASS / 0 FAIL / 0 SKIP**, including **10 new managed stop UI and pure client-gate tests** (real W24/W45 Owner module imports still present). B+C original 15/15 PASS. Vue SFC compiler and full Vite build **2661 transformed modules PASS**.
- **Real installed Google Chrome against the compiled ORIGINAL B+C page, not a fabricated rendering** with W46 test-only same-origin proxy and ORIGINAL W44 managed REVOKE_GRANT native code imported from exact W09 combined source. The test lab uses a **single existing temporary W44 SQLite file** in the existing W46 synthetic server harness, strict durable identity, trusted *fake* actor `fake-owner-1`, no second product database. That actor fixture is NOT production authentication.
- Contact A stopped => native `requestMutationFence(REVOKE_GRANT, scope=CONTACT)`, then `finalizeMutationFence`, `mutationResult`, original W44 qualification readback; **COMMITTED** and UI **已停止**. Same-account contact B unchanged **ACTIVE/AUTO**, other-account C unchanged. Browser refresh re-reads **COMMITTED**; original contact list/header labels also update.
- Current-account GLOBAL stopped from peer B => W44 **COMMITTED** for same tenant/account/channel peers, different account/channel C remains ACTIVE. Browser reload persists.
- Pre-existing synthetic **PRE_NETWORK ARMED** lease on P => W44 native returns **PENDING** until original W25 evidence; browser displays **停止中**, no success, durable `requestId` remains same after refresh. This is a fake W44 lease safety test, **not a real W25 Provider send/late ACK proof**.
- **9 physical Chrome viewport widths** (360,430,720,920,950,1050,1100,1101,1360) with one CONTACT Composer, usable stop popover, styled light/dark, no scroll overflow. Preview UI screenshot physically inspected: popup color contrast and selected contact row status corrected.
- `apps/web/evidence/W46_STOP_REAL_BROWSER_UAT.json`, `W46_STOP_RESPONSIVE_UAT.json`; real Chrome PNGs `W46_STOP_CONTACT_COMMITTED_CHROME.png`, `W46_STOP_ACCOUNT_COMMITTED_CHROME.png`, `W46_STOP_PENDING_CHROME.png`, `W46_STOP_MOBILE_360_CHROME.png`.

## CRITICAL honest interface HOLD
**W09 `1588975` has NO actual trusted authenticated web/Windows IPC stop endpoint invoking W44 managed mutation.** The only running HTTP endpoint used by these screenshots is explicitly `/w46-native-test/managed-stop`, injected ONLY with `W46_STOP_TEST_LAB=SYNTHETIC_ONLY` and loopback on an ephemeral test process; it is NOT production auth, and is disabled by default. The actual W46 client `createManagedStopController()` with no verified port refuses to claim stopped and displays **停止托管服务端接口未接入**.

W09's legitimate next ownership is to implement its existing **authenticated app handler** (NO extra service), derive Actor and the allowed full K + account/channel from trusted session, read W44 `readIdentityAuthority/readMutationFence`, original persisted `requestMutationFence(REVOKE_GRANT, grantScope===scope)`, verify W25 ARMED/UNKNOWN terminal truth, `finalizeMutationFence`, `mutationResult` authoritative GET after reload. Only then inject that authenticated stop-port into W46. Do not let frontend headers, Actor or request IDs substitute for source authority.

Remaining P0 release HOLD: absent authenticated route + CSRF/session source, W25 UNKNOWN/ARMED live interop and independent SEC; P1 installed Windows WebView2 UAT. No production deploy, private social accounts or actual provider sends. W09's stated 188/188 and CI 7/7 belong to the upstream SHA, NOT this W46 private UI integration SHA.

## Commands
Run existing W46 tests with env `YANCE_W24_NATIVE_DIR` pointing to W24 source and `YANCE_W44_NATIVE_DIR` to the current W09 grant-custody-budget source, `YANCE_W24_MODULE`, `YANCE_W45_MODULE`, `YANCE_W45_BRIDGE_MODULE` to actual original Owner modules.
Build: `node design/nonproduction/approved-clickable-abc-bc/node_modules/vite/bin/vite.js build --config apps/web/vite.w46.config.mjs`
Real Chrome: set `W46_STOP_TEST_LAB=SYNTHETIC_ONLY` **only for existing isolated synthetic server harness**; run `node apps/web/tests/w46-local-integration-server.mjs`, start local Vite preview at 4174, `node apps/web/tests/w46-browser-managed-stop.cjs`, `node apps/web/tests/w46-stop-responsive.cjs`; then terminate both temporary ports. No real service authorization is produced by the lab flags.
