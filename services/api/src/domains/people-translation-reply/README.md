# W45 People / Translation / Reply — nonproduction native DTO

Issue #6. W45 source scope: only services/api/src/domains/people-translation-reply/**. Node 24 currently tested; runtime never handles live accounts, paid API calls or real provider sends.

Run all contract tests in an independent W45 worktree:

    node --test services/api/src/domains/people-translation-reply/*.test.mjs

## Actual interfaces delivered

- index.mjs: assertFullK / fullKKey, createPeopleTranslationReplyService({translator,attestAgnoRun}), ingestInbound / getMessage / retryTranslation / acceptAgnoRun / clearCandidates / draftCandidate, and createLoopbackLibreTranslateAdapter({endpoint,fetchImpl}).
- w43-contact-bridge.mjs: w43ScopedIds, w43ReplyPrompt, parseW43Candidates, createW43ContactBridge({service,runW43,attestNativeReceipt,thread}).
- Four explicitly supported requested translation languages: zh-CN, en, de, pl. Source auto-detection is metadata supplied by the running translator, not proof of quality.
- Original full K/MID/text and original SHA-256 remain unchanged. Translation must include source language, selected target language, provider, request ID, source MID and input SHA. Unavailable/failed returns null translation with retryable error. No fixed sample text in production output.
- Fixture translation has kind=SYNTHETIC_FIXTURE, status=FIXTURE_ONLY; local LibreTranslate response kind=LOCAL_ENGINE, status=TRANSLATED. Local HTTP adapter is loopback-only, blocks redirects and external cloud fallback.
- W43 is the sole native Agno/AgentOS owner. W45 only consumes a W43 native Run receipt after a trusted attestation port provided by W43. Requires SDK pin, provider/model, full-K-derived unique scoped user/session, actual run ID, original hash, current translation attempt ID and sourced 0–3 candidates. Invalid JSON, model failure, missing attestor, mismatched scope or paid provider fails closed.
- Zero, one, two or three genuine model-supplied candidates are allowed. No formulaic templates, auto-padding or language-independent fabricated cards. Each suggestion source is ORIGINAL and/or TRANSLATION from the exact same MID. Displaying a source ID means referenced input, NOT a third-party factual citation or model quality verification.
- Only existing B+C Composer INSERT_DRAFT_ONLY, delivery=NOT_REQUESTED; W25 alone implements SendIntent/Outbox. Old reply candidates are cleared before a subsequent Run to avoid stale drafts.

## W43 native adapter constraints (observed from source SHA 9d09121b8ba41ae73de82ec4d01add2b23e70df7)

- W43 NativeAgnoRuntime.run is real Agno 3.1.10; result fields include sdk_pin, provider, model_id, run_id, scoped user/session IDs, original_response and outbound=DISABLED.
- W43 returns no suggestions. W45 parses ONLY a complete JSON object shaped {"suggestions":[{"text":"...","sources":["ORIGINAL"]}]} from the real model run. Unstructured outputs yield zero, not a fabricated suggestion.
- W43 currently restricts 200-character inputs; short bilingual synthetic messages can pass, longer messages explicitly fail W43_PROMPT_200_CHAR_CAP (no silent truncation). W43 should expand safely before realistic M1 long messages.
- W43 currently pins qwen2.5:1.5b on existing localhost llama.cpp. This model is HEALTH CHECK ONLY under the current product decision; no final reply-quality PASS. Qwen3 8B download/runtime/SDK adaptation, real multi-language quality measurement and true model-selected tools are W43/W45 next gates.
- W45's attestation and Run fixtures in tests do not count as proof of real W43 SDK inference. Genuine SDK proof is independently in W43 draft PR #26; a joint real Run -> W45 candidate -> W46 Composer has NOT occurred yet.

## Cloud eligibility and no-extra-charge rule

Old SIWC legacy DA424 actually produced three candidates and 166 prior tests, as recorded in W512_20261019_CHATGPT_PLAN_NATIVE_SIWC_DA424_REAL_THREE_FORMAL_GO.md. This is NOT permission to reuse old tokens, paste secrets or mark V2 ChatGPT subscription sharing eligible. V2 has no independently verified SIWC subscription-sharing grant/scope/quota. Identity sign-in is not usage delegation; ChatGPT membership does not imply free API access. W43/authorization owner must verify user consent + participation + budget before any new cloud route. No automatic paid OpenRouter or alternate-provider fallback. No W45 provider router implemented.

## Quality and release evidence (2026-10-25)

| Locale | Synthetic DTO/loopback transport tests | Qwen3 8B actual translation | Qwen3 8B natural 0-3 reply rating |
| --- | --- | --- | --- |
| zh-CN | PASS, fixture/stub only | NOT_RUN | NOT_RUN |
| en | PASS, fixture/stub only | NOT_RUN | NOT_RUN |
| de | PASS, fixture/stub only | NOT_RUN | NOT_RUN |
| pl | PASS, fixture/stub only | NOT_RUN | NOT_RUN |

A model downloaded ≠ model installed ≠ a verified actual Agno inference ≠ a linguistically acceptable reply. No invented scores. W24 signed identity/grants, W43 actual Qwen3 8B SDK and model provider eligibility, W46 actual Composer integration, W44/W25 durable authorization and sole sender, and real translation model execution remain HOLD. No production deployment.

## W09 increment — W45 Qwen3 real Run integration, 2026-10-25

- W43 pinned source: PR #36, SHA 6ecb8bcf15b7863f132c60d3dce42a871f2c89f9; W43 source unchanged.
- Provider+model+purpose contract: OLLAMA_LOCAL_QWEN3_8B_FREE / qwen3:8b / QUALITY_EVAL only; 1.5B llama.cpp is HEALTHCHECK_ONLY. Paid/cloud/mismatched combinations denied. quality_qualified=false is preserved until independent linguistic evaluation.
- w43-native-eval.py is opt-in nonproduction synthetic diagnostic, not a hosted gateway. It imports W43 native runtime from the pinned W43 source, runs actual Agno SDK and verifies attest_contact_run in the SAME Python process. Missing or failed SDK Run produces 0 candidates. No token or live social identity is read.
- On this device ollama list showed qwen3:8b installed (5.2GB). Actual official Agno / Ollama Qwen3 8B Run attempted with fake tenant/account/peer/MID, but Ollama returned HTTP 500: error starting llama-server: llama-server binary not found. Actual native_same_process_attested=false, receipt=null, candidates=[]; no real 8B Run ID. This is NOT a quality PASS.
- W45 initial fixture translation provenance remained SYNTHETIC_FIXTURE; no actual multilingual translation accuracy established. The old LibreTranslate HTTP port was also only stub-tested. Do not expose these as natural real translations.
- node --test services/api/src/domains/people-translation-reply/*.test.mjs: 33 PASS / 0 FAIL, contract fixtures; extra tests strong Qwen3 provider pair, source/Run quality marking, stale candidates and failing model. NOT real Agno/model tests.
- After W43 actual Qwen3 Run becomes available, W45 createW43ContactBridge takes the trusted execution and attestNativeReceipt owner ports. Only actual structured Run-supplied 0-3 candidates with MID and ORIGINAL/TRANSLATION sources are eligible. Non-JSON or failed Run gives zero. draftCandidate targets existing B+C Composer (INSERT_DRAFT_ONLY), delivery NOT_REQUESTED.
- P0 W43 Ollama 8B runtime recovery; W24-authorized cross-process attestation and identity; actual translation model. P1 actual quality rating for Chinese/English/German/Polish, native sourced candidates, W46 Composer UI hook. All real accounts, paid inference, sends and production deployment remain HOLD.
