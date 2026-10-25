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
