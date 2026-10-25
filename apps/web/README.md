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
