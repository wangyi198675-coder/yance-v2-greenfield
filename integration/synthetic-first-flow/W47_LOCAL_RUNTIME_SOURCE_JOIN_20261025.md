# W09-2 | 2026-10-25 | W47 local V2 Web/API transport actual source join

## Provenance and exact boundaries
- W09 integration source parent: `5bc11f2a75d616b55459131e34e501eb58d79400`.
- Original W47 owner worktree: `W47_V2_LOCAL_RUNTIME_20261025`, complete source HEAD `86a16e57e92722ec11a95c22d364071a33c8a5cb`, clean; all FOUR native commits cherry-picked in chronological order into the existing isolated W09 integration branch:
  `2d859a45ebff41910ae95bae4341c0aecc0debdd`,
  `3d481275449bf0a8d2886999de9080728b822233`,
  `1e76abdb65a63597abdcf10d1c1ee79392a3c5dc`,
  `86a16e57e92722ec11a95c22d364071a33c8a5cb`.
- Scoped to three new files ONLY: `services/api/runtime/server.mjs`, `services/api/runtime/server.test.mjs`, `apps/web/runtime/vite.w47.config.mjs`. No edit to W24/W25/W43/W44/W45/W46 original Owner sources, no extra Outbox/Agent/login/credential DB.
- ONE integration-only path fix in W09 Vite adapter: import `apps/web/vite.w46.config.mjs` from its **own checkout** instead of `../W46_BC_NATIVE_20261025/...` sibling worktree. The original W46 source/content is already in W09; without this fix a clean Git checkout would not have a sibling Owner worktree.

## Real test evidence on DESKTOP-029FH47
- W09 original selected B+C `node --test tests/reproducible.cjs`: **15/15 PASS**.
- W09 W46 `node --test apps/web/tests/*.test.mjs` with actual W24/W44/W45 owner module env: **53/53 PASS**, zero skipped.
- W09 native APIs and synthetic-first-flow Node tests: **201/201 PASS** with `YANCE_PR32_ROOT`, `YANCE_W25_ROOT`, **`YANCE_W46_ROOT`** referencing actual original W46 Owner worktree. First environment-only attempt lacked `YANCE_W46_ROOT` and was RED; rerun set correct owner path without changing any test/source assertions.
- W09 `node --check` runtime source and W47 47182 running server `node --test services/api/runtime/server.test.mjs`: **5/5 PASS** (real loopback server on W47 owner source). Does **not** independently prove W09 process served API; actual live health/runtime SHA at testing was W47 `86a16e57...`.
- W09 independent B+C+W47 no-provider runtime Vite build **2657 modules transformed PASS**, output in `W09_LIGHTWEIGHT_STATIC_STAGE_20261025/releases/w09-w47-integrated-check`. Existing legal Owner NPM dependencies temporarily linked as a junction and removed after; clean owner package lock unchanged. W09 built immutable JS `assets/index-BykQzizF.js` SHA256 `75d73704069d06dcaf58c759812f9bcc7e003770a2b68f57acc481e2f1233a73` is BYTE-IDENTICAL to actual live W47 r4 SHA from `http://127.0.0.1:4399/version.json`.
- W47 Owner's independent Chrome 156 real CDP: actual origin `http://127.0.0.1:4399/`, local API `127.0.0.1:47182`; r4 normal/hard refresh/new browser context real app and JS verified; 0 active Service Workers, empty CacheStorage, no unexpected JS errors. W47 original saved evidence: `W09_LIGHTWEIGHT_STATIC_STAGE_20261025/evidence/W47_20261025_SCREENSHOT_LAB_REMAINS_FIXED_R4_RUNTIME_NATIVE_AUTH_HOLD.md`, `w47_integrated_browser.json`, `w47-runtime-r4_fresh_context.json` and PNG.
- Actual `GET /api/v2/runtime/health` HTTP 200, `GET /api/v2/runtime/capabilities` HTTP 200, `GET /api/v2/contacts` 200 authoritative empty no fixtures; no API account bound. `GET /api/v2/managed-stop` HTTP 401, attempted W24/W44 actions 401; origin/missing permission denied. `trustedSession:false`, `canSend:false`, `externalEffects:false`.
- Do NOT label successful read-only API transport a real W24/W44 integration or an approved user release.

## Status and next owner boundaries
- `SOURCE_PASS` for these original W47 modules / exact W09 source join and synthetic regressions; CI exact new W09 SHA remains to be verified after push.
- `STATIC_WEB_DELIVERY_PASS` inherited W09 fixed V2 update/rollback proof; W47 r4 staging same URL currently active. W09 new independently built identical JS was not separately switched into live stage, do not claim separate W09 browser process.
- `INTEGRATED_STAGING_PASS: HOLD`: full real account/channel authorization, binding/full K, W24 HUMAN, W44 CONTACT/GLOBAL persistent STOP, verified W25 send fence and real W43/W45 model/translation still NOT connected. There is no native desktop OS session or real platform credential; do not invent Yance app registration/login or use W44 synthetic fixture identity as real account.
- `USER_DELIVERED: HOLD`: currently only loopback temporary preview, not persistent installed Windows app, publicly accessible Web deployment or real signed delivery.
- Keep four-platform adapters and 252 Stable ID requirements; W37/W42 separate UX/high-fidelity design tracks must NOT be blocked by W09 local runtime join. W09 and actual credential/connector Owner must later compose legitimate per-platform user-authorized identity without enabling irreversible sends.
- No V1 chat data/credentials are migrated; no real provider is connected; no actual recipient send; no paid-model call; no main merge/production deploy.
