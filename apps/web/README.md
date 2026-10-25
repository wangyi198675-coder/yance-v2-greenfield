# W46: B+C single CONTACT Composer native integration seam

Status: **NONPRODUCTION / OWNER INTERFACE HOLD / NOT M1**. This code is on its own worktree based on selected B+C PR #2 SHA 119c7161774d25d724cb73fa3accceccee0bebff. It does not modify the historical prototype, create a fifth product UX, copy the old proprietary V1 application, or introduce another sender/agent runtime.

## Run the reproducible test suite

From the repository root: `node --test apps/web/tests/*.test.mjs`

- `src/composer-bridge.mjs`: canonical tenant/account/channel/peer_id/binding_revision K, synthetic-only allowlist, A/B isolated draft and quote, strict source K + MID + official Agno-run provenance for 0–3 cards, no default candidates.
- `src/native-takeover-port.mjs`: **disabled unless explicit enabled:true**, loopback only, native route names supplied by W24, no auto-credentials, no external network.
- `src/BCNativeComposer.vue`: proposed **replacement component for the unique selected B+C Composer** (not a second composer). Reuses the already approved V2 OSS Button/InputGroup primitives, inheriting parent theme. An unconfigured port shows UNAVAILABLE and disables send. Not yet mounted in the B+C user-facing app.

## Security behavior

Opening/focusing contacts only GETs authorization (if a real port is configured), never POSTs. A true human TYPE, IME_COMMIT, PASTE, ATTACH, DROP, VOICE or SEND_ATTEMPT action reads a server effective-state GET, conditionally POSTs takeover with expected epoch, then verifies HUMAN with a *fresh* GET and advancing epoch. Without valid identity, active account, permission, updated epoch or endpoint, the state is BLOCKED/UNAVAILABLE; draft text stays local and unsent. Independent contact tasks do not block each other; same-contact concurrent takeovers coalesce. No code path sends to people, calls paid AI or issues outbox ACK.

## Owner interfaces still missing, not implemented by W46

- W24 canonical IdentityConsent GET/POST routes, response fields, real binding/epoch/authorization schema, and signed authentication mechanism. The current interface here is provisional contract-only: get(identity) -> {identity,mode,epoch,accountActive,canTakeover}; post(identity,{expectedEpoch,action,intent}) -> {accepted}.
- W43 genuine official Agno SDK Run/AgentOS output + provenance. Local tests use only synthetic stub objects and do **not** execute Agno.
- W45 translation original/zh/provenance timeline DTO + native reply candidates mapped to source K/MID.
- W25 sole durable MessageDelivery/Outbox SendIntent and ACK/UNKNOWN (sending remains **disabled**); W44 grants/budget.
- Vue shell final extraction/build, end-to-end API integration, five-theme real viewport screenshots, Windows WebView2 UAT and independent security review are **HOLD**. Read-only synthetic component source is not a production build claim.

Authorized GitHub engineering ACK: [Issue #14](https://github.com/wangyi198675-coder/yance-v2-greenfield/issues/14#issuecomment-6391864502). Its recorded linked account is wangyi198675-coder; the bootstrap Git author is *not* legal source-owner signoff. No production deployment, actual platform login/send or paid model call.


## W46 2026-10-25 incremental B+C / W24 / W45 owner-source integration

W46 was rebased onto exact B+C test correction SHA 34467cf10c0e9457c2a22dee5a37d1e05dd2ed8b. Only apps/web is modified by W46. This inherits 15 reproducible source tests (not historical UAT).

Real existing Owner source files are directly imported at test time, not copied or reimplemented:
- W24 IdentityConsentService from services/api/src/domains/identity-consent/identity-consent.mjs, Owner SHA 30b188346729d858826b491daaca40cbc6ef5279. Its trusted server context performs assertCurrent + evaluate READ_INBOUND. No native HTTP GET/POST takeover route exists; createW24ReadOnlyPort intentionally has GET only with no fabricated HUMAN/AUTO mode, no post and no send.
- W45 createPeopleTranslationReplyService from services/api/src/domains/people-translation-reply/index.mjs, Owner SHA f16b4c466dbf245abdbf25ded89367cee0204237. readW45ForComposer checks complete W24 K, MID, original SHA/source, exact W45 message and NOT_REQUESTED status. Fixture zh and unqualified model/translator output are hidden. An actual qualified Qwen3 8B official Agno Run and trusted translation/model attestations are not yet supplied.
- BCNativeComposer.vue displays a sanitized nativeMessage DTO and preserves one CONTACT draft. W24's trustedContext MUST stay server-side; native-owner-bindings.mjs throws if imported in the browser. No modification or additional Composer was made to the separate design/nonproduction demo.

Reproducible Windows commands from W46 worktree root:
1) Set YANCE_W24_MODULE to the absolute current W24 Owner identity-consent.mjs path and YANCE_W45_MODULE to the absolute current W45 Owner index.mjs path.
2) Run: node --test apps/web/tests/*.test.mjs
3) Run: cd design/nonproduction/approved-clickable-abc-bc; npm test
If owner paths are missing, the cross-owner test is SKIPPED, not a PASS.

Remaining HARD HOLDS: W24 authenticated persistent effective state and real GET -> POST TAKEOVER -> GET HUMAN epoch; W43 verified Qwen3 8B Run + W45 genuine translator and qualified 0-3 candidate; W25/W44 sole irreversible send authorization; physical mounting into approved B+C product shell, real Chrome viewports/themes and Windows WebView2. No real login, provider send, paid cloud model, production deploy or source-owner independent signoff.


## W46 final W24 CAS snapshot correction (2026-10-25)

The targeted W24 HTTP 422 gap is closed **in the W46 Owner path only**. The existing composer-bridge.mjs now carries all four fields from the immediately preceding live W24 GET into its POST: expectedIdentityKey, expectedEpoch, expectedAccountRevocationEpoch and expectedConsentEpoch. POST is not accepted on accepted:true alone: identity K, mode HUMAN, incremented epoch, unchanged consent/account versions, confirmedByGet:true and canSend:false are checked, followed by W46's *own* fresh GET of the same K. 409/422, a failed or incomplete POST, changed epochs and W44 unsettled leases fail closed. Focus/switch/view and candidate adoption do not POST; independently entrusted AUTO contacts B/C remain AUTO. No SendIntent or sender exists in W46.

Actual existing W24 Owner SHA e10f9e17988fa19c4dc71ce927e5d9eaa01dbdc9; inherited selected B+C baseline SHA 34467cf10c0e9457c2a22dee5a37d1e05dd2ed8b. Existing W44 SQLite in W09-2 PR #32 is used read-only through its actual module; tests create temporary nonproduction SQLite files and remove them afterward. The owner modules are not copied or modified.

W46 tests (from existing independent Windows worktree):
Set YANCE_W24_NATIVE_DIR to the existing W24 services/api/src/domains/identity-consent directory, YANCE_W44_NATIVE_DIR to W09-2 existing services/api/src/domains/grant-custody-budget directory, YANCE_W24_MODULE to W24 identity-consent.mjs and YANCE_W45_MODULE to W45 index.mjs.
Run: node --test apps/web/tests/*.test.mjs
No owner path => explicit SKIP, not a purported real HTTP PASS. The actual nonproduction suite includes W46 contract/negative coverage, native W24/W45 source tests, and real loopback W24 HTTP + W44 SQLite integration. Existing W24 14/14 and W09-2 205/205 are inherited, not rebuilt or falsely counted as new tests.

Remaining HOLD: backend trusted app/IPC session resolver with real auth; independently reviewed authorization/CSRF and browser-click UAT; formal W44/W25 cross-worker in-flight send-versus-takeover settlement and production-readiness; W45/W43 natural suggestions and real translations. No production deploy, real account connection, paid inference or human delivery.


## 2026-10-25 W43/W45 source reception: sole B+C Composer physically mounted in approved page (W46)

Owner pin (read-only): W24 PR#17 e10f9e17988fa19c4dc71ce927e5d9eaa01dbdc9; W45 PR#16 ab059fc29584bcfee60dd793758beef2b2a3c643; W43 PR#36 d0987e9c64b937c923b3d32bda7bd05f86a638ba and PR#39 376cdb5359bb6e375b5a81167ca1ad2eca3df169 remain W09-only reconciliation; B+C original base 34467cf10c0e9457c2a22dee5a37d1e05dd2ed8b.

- The W46-only vite.w46.config.mjs compiles the EXACT approved original B+C App.vue in place, replaces only its B+C Composer/suggestion slot, and keeps other arms' original widgets. One CONTACT Composer in DOM; no design/** file edits, second UI, AgentOS, model adapter, Outbox, or sender. The original offline CSP defaults connect-src none; ONLY this explicit synthetic integration build substitutes connect-src self and proxies same-origin W24/W45 local test requests to loopback. NEVER deploy the test server/fixture trustedContext as production auth.
- W24 GET->POST complete four-field CAS->independent GET verification is still strict, and W44 actual SQLite preserves B/C AUTO after A human typing. Pending/revoked/409/422/active PRE_NETWORK boundary never report success.
- W45 native-owner-bindings.mjs now consumes ACTUAL W45 getMessage and draftCandidate(...) owner outputs; its candidate gate requires W43 official SDK provenance, the exact K/MID/SHA/Run/model/provider, independent trusted attestation with a future expiry, and carries quality_qualified=false / MODEL_QUALITY_UNREVIEWED. Vue uses ONLY INSERT_DRAFT_ONLY and preserves candidate_id/source_mid/run_id. Bad MID/K/language/expired Run/unsourced candidates yield ZERO, never fabricates three. The W45 prior real 8B lab Run ID was replayed as a *test DTO fixture* under explicit test-only callback, NOT a new verified live Agno inference or a production-grade signed cross-process receipt. The actual original B+C UAT W45 store deliberately has NO translator/Agno configured, so displays original source with zero verified recommendations and labels translation unavailable.
- Vue actual input, IME, text paste, attachment/drop, voice-ready event and Enter send-attempt qualify as edit intents; passive focus/switch, source quote and read-only inspection never POST. The send Button is always disabled. No W25 irreversible send authorization inferred.

Reproduce using EXISTING independent Owner source worktrees and temporary synthetic SQLite:
* Set YANCE_W24_NATIVE_DIR to existing W24 identity-consent directory, YANCE_W44_NATIVE_DIR to existing W09 integration's grant-custody-budget directory, YANCE_W24_MODULE to W24 identity-consent.mjs, YANCE_W45_MODULE to current W45 index.mjs, YANCE_W45_BRIDGE_MODULE to current W45 w43-contact-bridge.mjs. Then run: node --test apps/web/tests/*.test.mjs. Missing paths produce explicit SKIP, never a claimed integration PASS.
* Baseline unchanged: cd design/nonproduction/approved-clickable-abc-bc; npm ci --offline --no-audit --no-fund; npm test. W46 test-build from repo root: node design/nonproduction/approved-clickable-abc-bc/node_modules/vite/bin/vite.js build --config apps/web/vite.w46.config.mjs.
* Local browser UAT ONLY: start node apps/web/tests/w46-local-integration-server.mjs with those exact owner paths; start Vite preview from root via node design/nonproduction/approved-clickable-abc-bc/node_modules/vite/bin/vite.js preview --config apps/web/vite.w46.config.mjs (loopback 4174), then run node apps/web/tests/w46-browser-uat.cjs using the existing local Puppeteer package (set YANCE_PUPPETEER_PACKAGE to its resolved module path where required). Browser uses installed local Chrome, 0 human sends, no model, fake accounts. Stop both temporary servers after tests. Screenshots and machine-readable metrics are under apps/web/evidence/.
* B+C 9 widths: 360/430/720/920/950/1050/1100/1101/1360. All ten states across five themes and light/dark rendered by actual original theme controls. 8 true Chrome screenshots are committed; no fake Windows WebView2 screenshot.

Remaining P0 HOLD: real V2 authenticated principal/IPC context instead of synthetic loopback test resolver; W43 #36/#39 harmonization, truly signed cross-process W45 Run expiry and model receipts, W44/W25 cross-worker unknown-send boundary and final send qualification; independent SEC. P1 HOLD: genuine bilingual quality review, load/long-input/concurrency and native Windows WebView2 UAT. No deployment, live account login or actual send.

## W46 W09 b1b30 unified W43 reception (2026-10-25)
W09 aggregate `b1b30e839a33b3bab20b805d7babcdb359086831` updates W43 only, **not** W46/W45 source integration. Existing W46 sole original B+C Composer is revalidated against read-only W09 W44 SQLite and exact W24/W45 owner sources. Three EXTRA real Google Chrome **negative** scenarios (native W24 HTTP 409, 422 and deliberately synthetic 202/PENDING-shaped upstream hold) are in `apps/web/tests/w46-browser-negatives.cjs`. Source UI remains truthful, always non-sending. Full evidence and limitations: `apps/web/evidence/W46_B1B30_UI_RECHECK.md`; three new negative Chrome PNGs and JSON. Do not claim this test is a real Agno PAUSED Run, W43 candidate quality PASS, a merged PR, native Windows WebView2 UAT, or production account authority.

## 2026-10-25 W46 stop-managed minimal UI
Only one B+C Composer, original chat header control. Reuses W44 latest REVOKE_GRANT source; does not own or start a production server, Agent, DB or MessageDelivery. Latest full reproducible proof at apps/web/evidence/W46_STOP_MANAGED_OWNER_HANDOFF.md and four genuine Chrome screenshot PNGs. The W46 UI must remain **HOLD_NO_TRUSTED_STOP_HTTP_IPC** until W09 installs a real authenticated session-bound same-account/contact stop endpoint. Test-only stop endpoint under W46_STOP_TEST_LAB=SYNTHETIC_ONLY is NOT usable for real users. Full default fail-closed client tests and status readback in apps/web/tests/managed-stop.test.mjs.
