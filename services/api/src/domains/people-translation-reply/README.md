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

## 2026-10-25 W45 exact native llama.cpp migration: STOP Ollama test dependency

**Chosen test-only W43 native source:** PR #36 SHA `d0987e9c64b937c923b3d32bda7bd05f86a638ba`; W43's official Agno 3.1.10 adapter `NativeAgnoRuntime(..., backend='qwen3_llamacpp', purpose='QUALITY_EVAL')` and provider `LLAMACPP_LOCAL_QWEN3_8B_FREE`, `qwen3:8b` at the ORIGINAL authenticated localhost listener `127.0.0.1:11605`. This source is read-only from W45. PR #39 SHA `2a566e1385f0cae1fdea1d5b8983ea25fb862b1e` is an independent divergent W43 implementation, pending W09/Owner reconciliation. W45 does not combine the two or claim formal sole-owner merger.

**W45 changes:** The production-facing `createW43ContactBridge` now rejects obsolete Ollama/paid/other-provider receipts, checks exact 8B Provider+purpose, W43 synthetic full-K-derived user/session, source MID, current translation request, SHA, original W43 SDK Run provenance, and caller-supplied trusted attestor. Model text is strictly parsed as 0..3 actual-source JSON candidates; malformed, mismatched-language, original/translation echo, literal placeholder, stale and replayed Qwen3 Run yield **zero**. Every candidate retains `quality_qualified=false`. No provider send; W46 receives only `EXISTING_BC_COMPOSER`/`INSERT_DRAFT_ONLY` data, not an independent sender.

**Real local verification (LAB ONLY):** `w43-native-eval.py` imports pinned PR #36's existing W43 class and invokes actual `native.run` for one translation (its separate native `translation` session) and one reply (`default` session), verifying both with `attest_contact_run` before returning a sanitized receipt. The real translation includes Run ID, provider, SHA256 source input, source MID and exact target language; the reply includes separate W43 Run ID/session/SDK/provenance and raw model text. `w43-live-synthetic-lab.mjs` runs this subprocess with fake K/MID in four locales, passes the output through the actual W45 translation/Agno DTOs and measures 0..3 sourced drafts. This executable is **not** a W24-authenticated cross-process RPC. It requires `W45_NONPROD_LAB=I_ACCEPT_SYNTHETIC_ONLY`, a pinned W43 owner source, the already protected local key FILE PATH, and an installed W43 3.1.10 Python interpreter. Never print/copy the key's value or expose this path/port to the public.

**Test evidence:** Original 33 Node cases preserved and expanded for llama.cpp source, obsolete Ollama provider negative, Qwen3 model/purpose pair, original/translation echo, wrong language, placeholders, stale Run ID, cross-account K/session and lab opt-in. `node --test services/api/src/domains/people-translation-reply/*.test.mjs` now returns 42 PASS / 0 FAIL. Contract PASS does NOT imply native semantic quality PASS.

**Four language actual 8B run / quality observations:** Repeat each current lab fixture under pinned W43 to capture actual source-text, translation text, two native Run IDs and raw reply. Translation semantic correctness and human-like naturalness require independent human linguistic review; W45 reports any invalid model-JSON, wrong-language reply or echo as 0 suggestions, without padding to three. Previous real runs did produce plausible translations but often generated copied/incorrectly-languaged replies; no general model quality certification issued.

**P0/P1 HOLD:** W43 PR #36 vs #39 formal single-adapter owner/base reconciliation; W24 actual authenticated cross-process proof/Consent epoch, tenant authorization and revocation; W46 physical sole Composer wiring; reliable full-length prompts beyond W43 200-character cap and reproducible multi-contact load; human-reviewed bilingual translation and reply quality; W25/W44 atomic irreversible send boundary. No real account login, external messages, cloud usage charges, local model process modifications or production deployment.

## 2026-10-26 W09-2 Cloud/Local provenance compatibility — W45 P0 DELTA

Supersedes the older *local-only Provider whitelist for Cloud*, without overriding any local Qwen3 real-run history. New `run-source-authority.mjs` and the existing service accept an arbitrarily user-selected native W43 Cloud model **only when** server-injected official W43 persisted Agno Run verification AND W24 current epoch identity verification both succeed. No client-selected provider/model string, bearer data, UI fixture, `attestAgnoRun:()=>true`, cost claim or browser JSON can issue that authority. A valid Cloud selection does **not** require local Qwen3 installation.

New W45 translation `AGNO_NATIVE_TRANSLATION` requires separately verified W43 persisted translation Run and current W24 authority, binding full K, original MID/SHA, translated text SHA, SDK Run/Session IDs, selected Provider/Model/Request ID, billing scope approval, time-limited expiry, and epoch. Missing/invalid source fails with no displayed verified translation and no candidates. Synthetic fixtures continue to report `FIXTURE_ONLY`, not real translation.

Cloud candidates remain exactly 0..3 actual W43 parsed/source-tagged suggestions and B+C `INSERT_DRAFT_ONLY`, `delivery:NOT_REQUESTED`. Run IDs are single-use, candidate original/translation hash locked; expired or W24-revoked Cloud drafts are denied on retrieval. The existing single-person/MID fixture constraints remain until W24 explicitly signs real identity admission. No cloud API/key access in W45.

At test time W43 git HEAD `3d3992c80d16e5e4431db53c6f2072d99a9f0f33` does **not** include a formally signed Cloud Run provenance contract. The W43 source worktree contains **uncommitted** OpenRouter/OpenAI native SDK adapter edits, so this W45 verifier interface is an Owner-to-Owner **proposed trusted port**, not an activated or security-signed Cloud Run. Only W43/W24 may finalize the actual server attestor and epoch mapping; W09-2 must not mark cloud E2E as PASS or update port 44751.

Regression: `node --test services/api/src/domains/people-translation-reply/*.test.mjs` 59/59 PASS (42 inherited, 17 new). New Cloud tests use synthetic native-owner proof callbacks and no real SDK paid calls. See `W45_CLOUD_LOCAL_NATIVE_RUN_OWNER_ACK_20261026.md` for exact fields, RED/HOLD and needed signed W43 source. Original `w43-native-eval.py` remains nonproduction llama.cpp local smoke, not a cloud test.
