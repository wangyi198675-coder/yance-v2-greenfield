# W45 — People / Translation / Reply (nonproduction)

Owner scope: services/api/src/domains/people-translation-reply/** (Issue #6). No other code or provider credentials.

Run locally with Node 20+:

    node --test services/api/src/domains/people-translation-reply/index.test.mjs

Exports in index.mjs:
- assertFullK / fullKKey: full tenant/account/channel/peer/binding DTO; only SYNTHETIC_TEST_ONLY data. Structural validation is NOT W24 binding authorization.
- createPeopleTranslationReplyService({translator,attestAgnoRun}): ingestInbound, getMessage, retryTranslation, acceptAgnoRun, draftCandidate. All results include MID/K, exact original, source hash, translation provenance, 0–3 genuine Run-supplied candidates, and delivery=NOT_REQUESTED.
- createLoopbackLibreTranslateAdapter({endpoint,fetchImpl}): REST /translate using loopback-only HTTP with no network/cloud fallback. Integration tests use a fake HTTP response to validate protocol; actual LibreTranslate model execution on the machine has NOT been verified.

Required W43 Run adapter contract to consume, never synthesize: {engine:'OFFICIAL_AGNO_SDK',status:'COMPLETED',identity:<full K>,sourceMid:<fake MID>,originalSha256:<hash of original>,translationRequestId:<translation provenance request_id>,runId,sessionId,agentId,candidates:[{id,text,sources:[{mid,part:'ORIGINAL'|'TRANSLATION'}]}]}. The trusted verifier function attestAgnoRun MUST be wired by W43 to genuine SDK execution; without it, the service rejects all Runs and returns zero candidates. Fixture attestors in tests do NOT prove the SDK is installed.

Translation with provenance.kind=LOCAL_ENGINE (live local LibreTranslate transport) is TRANSLATED; an input supplied by a synthetic fixture MUST be provenance.kind=SYNTHETIC_FIXTURE and status FIXTURE_ONLY. Missing/failed engine remains UNAVAILABLE/FAILED and is retryable; no fake zh, fake suggestions, or auto send.

All interfaces are API-domain functions, not an HTTP server. W24 must own authoritative K/revocation, W43 SDK execution/trace, W46 Composer call, and W25 sole MessageDelivery. Do not wire live credentials, account login, production DB, paid AI or real sends. Do not mistake M0 mock fixture / local HTTP transport tests for end-to-end native M1.

HOLD: official W43 SDK attest+Run integration, real local LibreTranslate engine process/execution proof, W24 canonical K issue/revocation, W46 actual UI bridge, W25/44 authorization/delivery, production/runtime tests. No releases.
