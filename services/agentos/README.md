# W43 | Existing Yance Local AI Assistant → Official Agno 3.1.10

Owner: W43, `services/agentos/**` ONLY. Standalone synthetic M1 development, not a production service.

## Active model source (2026-10-25 user correction)

**Default:** `NativeAgnoRuntime(db_file)` → the EXISTING authenticated llama.cpp process, `http://127.0.0.1:11605/v1`, model `qwen2.5:1.5b`, official Agno `OpenAIChat` local protocol adapter. The protocol name is not a cloud OpenAI API call. The SDK model is never allowed to change the existing server's process, port, bind address, authorization or model. No subprocess starts a model server. No Ollama invocation occurs in this evaluator.

**Authentication:** backend-only `YANCE_W43_LOCAL_KEY_FILE` must point to the already protected local API key file or `local_key_file=...` must be provided explicitly. Do not save, log, publish, transmit to browser or commit the key. Missing/unreadable key must fail closed. Requests use only the pinned loopback server and approved model ID; anonymous `/v1/models` must return 401.

**Purpose:** `HEALTHCHECK`. This 1.5B model supports real SDK connectivity, small synthetic conversation runs, tools and DB isolation experiments, not strong-model or human conversation quality certification. Provenance carries `quality_qualified=false` and `outbound=DISABLED`. Candidate count remains 0 at the W43 layer. Do not offer real automatic reply, paid fallback, production authorization or social account sending.

**2026-10-25 addendum:** PR #36 retains its already-proven 1.5B HEALTHCHECK contract without pretending it proves quality. Qwen3 8B has now been tested using the **existing installed llama.cpp executable and downloaded model weight** on the authorized local device. W43 adds only an official Agno Model-adapter selection (no new agent system or production service). See the Qwen3 section below for exact qualified smoke evidence and HOLD boundaries.

## Exact reuse surface

- `Scope("SYNTHETIC_TEST_ONLY", "fixture-account-1", "CONTACT", "FB_PERSONAL", "fake-peer-001", 1)` computes full synthetic canonical K, user ID and session ID. A PRIVATE scope is separately isolated.
- `NativeAgnoRuntime(db_file, local_key_file=...)` constructs native official Agno `Agent`, `Team`, `AgentOS` (in-process only), `SqliteDb`, Tools and Memory.
- `runtime.run(scope, "fake-<prompt>", thread="default")` calls **actual** SDK `Agent.run` or `Team.run`; returns `status, sdk_pin, provider, model_id, purpose, quality_qualified, space, user_id, run_id, session_id, original_response, token_usage, provenance, suggestions=[], outbound=DISABLED`. Errors contain no secrets and return zero suggestions.
- `runtime.attest_contact_run(scope, prompt, receipt, thread="default")` verifies an untampered receipt issued by the **same in-process W43 runtime** for exact synthetic scope, prompt and thread. NEVER treat this as W24 effective grant or cross-process authorization. An authenticated cross-service bridge needs W24 owner's endpoint and independent security signoff; no AgentOS HTTP serving.
- `runtime.remember_synthetic` and `runtime.read_synthetic_memories`: persisted Agno SDK SQLite memory with canonical scope isolation.
- `runtime.read_trace_receipts(scope, run_id)`: native Agno Trace query. A real trace exists only when Agno tracing has been initialized by `runtime.get_unserved_app()`, and this must NOT be bound to a public socket.
- `runtime.run_for_w45` remains a **separate** strong-model-only legacy evaluation contract; the active 1.5B model cannot pass that gate. W45 can consume the genuine `runtime.run` receipt in synthetic tests, but must not promote unqualified candidates or remove its authorization/attestation controls.

W45's current `w43-contact-bridge.mjs` matches provider `LLAMACPP_LOCAL_NO_PAID_API` and model ID `qwen2.5:1.5b`; the same-runtime Python attestation cannot be called from Node without a future authorized binding. Cross-process Attestation and W24 grants: **HOLD**. Translation and 0–3 suggestions are W45-owned; W46 owns draft-only Composer, W25 alone sends through authorized MessageDelivery.

## Reproduce on DESKTOP-029FH47

Use the existing independent Python 3.12 venv with `agno==3.1.10`. Do not install/start Ollama or another model.

```powershell
$env:YANCE_W43_LOCAL_KEY_FILE = '<authorized-protected-existing-key-file>'
$env:PYTHONIOENCODING = 'utf-8'
Remove-Item Env:OPENAI_API_KEY,Env:OLLAMA_API_KEY -ErrorAction SilentlyContinue
& '<existing-W43-venv>\Scripts\python.exe' -m pytest -q services/agentos/tests
& '<existing-W43-venv>\Scripts\python.exe' -u services/agentos/eval_existing_llamacpp.py
```

Evaluator writes synthetic-only, public-safe Run IDs/provenance, timing, model status and short fictional response previews; never the API key. The real-service tests require the user-authorized local machine, and ordinary CI must not invent local-server PASS.

The Agno 3.1.10 model adapter uses OpenAI-compatible loopback HTTP; this is not OpenAI cloud. Agents and Teams use only synthetic fixture context; approved real users and providers are not connected.

## Status and independent gates

Direct evidence: real four-language ZH/EN/DE/PL Agno Run; Team Run; SQLite Session restart and full-K isolation; native Memory and Trace; one model-selected synthetic Tool; native structured-output schema; expected 401 invalid credential, local transport failure, SDK timeout and concurrent synthetic sessions. See W43's same-day sanitized evaluator log and COORD_AGGREGATE receipt for case-by-case results. Polish naturalness is imperfect. These are engineering connectivity smokes, **not** translation quality, Tool breadth, 200 capabilities or conversational acceptance.

**HOLD:** supervised Approval resume, full AgentOS API/Trace control-plane authorization, W24/W44 identity/grants/budget, W45 real translation & qualified candidates, W46 Composer handoff, W25 outbound, real-person data, production deployment, any cloud/paid model. No actual social contact send.


## W43 incremental Qwen3 8B actual SDK verification (2026-10-25)

This section supersedes earlier 1.5B-only wording for **new real Qwen3 tests**, without changing historical PR #36 healthcheck findings. No new agent service is developed; the existing local model execution program and weights are reused, in an owner-authorized localhost process. The Qwen3 model at 127.0.0.1:11605 is loaded by an external existing test process with --reasoning off; W43 did not restart or modify that other view's process. An exploratory temporary port 11606 launched by this W43 turn was stopped after its evidence and is NOT a runtime dependency.

Actual W43 SDK entrypoint:
- NativeAgnoRuntime(db_file, backend="qwen3_llamacpp", purpose="QUALITY_EVAL", local_key_file=<existing private path>).
- Exact model: qwen3:8b (5,225,374,496-byte already downloaded GGUF); exact provider LLAMACPP_LOCAL_QWEN3_8B_FREE, OpenAIChat is ONLY the official Agno localhost HTTP protocol adapter.
- The Agno adapter disables Qwen3 thinking in the llama.cpp chat template to return actual answer text (not just RunStatus.COMPLETED with an empty result). This is engineering output control, not a translation or style score.
- The older Ollama qwen3 backend remains fail-closed on that machine because its executable runner is missing. Never relabel the broken Ollama run as model PASS, and never auto-select paid APIs.
- All contact runs carry native sdk_pin, user/session isolation, provider, model, full Run ID, token counts and same-runtime scope/prompt/receipt attestation. Native Trace/Memory/Team remain existing SDK, no synthetic additional actor or message sender.
- A native run may be COMPLETED yet return empty text. Only AGNO_RUN_COMPLETED with nonempty original_response and provenance is a usable response.
- W45 handoff: run_for_w45(scope, source_mid, original, translation_request_id, synthetic_prompt) returns a genuine Qwen3 Run-bound envelope (full K, MID, original SHA, translation request ID, SDK Run/Session/Agent IDs, model provider and zero default candidates); attest_w45_same_runtime verifies this envelope ONLY in process. Cross-process HTTP/Node authorization and candidate generation are W24/W45-owned. No W43 generated 0-3 suggestions and no Composer insert claims.

Actual sanitized evidence on DESKTOP-029FH47:
- EN -> ZH Run 5e30a28c-da16-4c09-b26c-a947fbb16dc9, COMPLETED + Chinese text.
- DE -> ZH Run 2f34e2a0-bb3c-4150-8c03-b72f1437ed76, COMPLETED + Chinese text.
- PL -> ZH Run bcf41b72-07ed-4aec-9936-2a058b8a521b, COMPLETED + Chinese text.
- ZH synthetic short reply Run 939974ff-df53-4bea-bf8f-c9366375648f, COMPLETED + Chinese text.
- True model-selected official synthetic_source_lookup tool Run c333b328-806b-4bed-beff-99a42ece278b: COMPLETED and tool returned SYNTHETIC_SOURCE_ONLY:fake-test.
- W45 envelope Run d6ef5e9b-ea45-4656-a945-a32f3c3a4726, actual SDK COMPLETED, same-runtime attestation TRUE, candidates=[].
- All above were 6 REAL local Qwen3 SDK calls. The evaluator reports SDK_SMOKE_PASS_HUMAN_QUALITY_HOLD and exit 0; it checks native completion, model source, nonempty appropriate script output, real tool result and native receipt. It is **NOT** independent semantic translation quality, naturalness, style quality, tool catalog breadth, human approval-resume or production acceptance.

Reproduce on the currently authorized local machine (no new download or server start by script):
  $env:YANCE_W43_LOCAL_KEY_FILE = "<existing protected local key file path>"
  Remove-Item Env:OPENAI_API_KEY,Env:OLLAMA_API_KEY -ErrorAction SilentlyContinue
  python services/agentos/eval_qwen3_8b.py
  python -m pytest -q --basetemp="<private writable test dir>" services/agentos/tests

Unit + synthetic suite at this SHA: **48 PASS / 1 SKIP / 0 FAIL** on the currently Qwen3-loaded machine. The one skip is the old 1.5B live healthcheck requiring qwen2.5:1.5b to be currently advertised at the same 11605 port; PR #36 historical real 1.5B evidence is preserved rather than falsely retested against Qwen3. Do NOT convert the skip to PASS.

Current P0/P1 cross-Owner holds: W24 authenticated actor/K/epoch/revocation; W45 translation semantics (EN/DE/PL/ZH), true 0-3 sourced draft replies, a sanctioned cross-process attested Agno Run bridge; W46 real B+C Composer insertion and manual takeover; W44/W25 grant, budget, single MessageDelivery/Outbox; Agno Approval RESUME and expanded tools untested. Do not log in a real account, send a real message, charge a cloud API, expose AgentOS HTTP or deploy.
