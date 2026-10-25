# W43 | Existing Yance Local AI Assistant → Official Agno 3.1.10

Owner: W43, `services/agentos/**` ONLY. Standalone synthetic M1 development, not a production service.

## Active model source (2026-10-25 user correction)

**Default:** `NativeAgnoRuntime(db_file)` → the EXISTING authenticated llama.cpp process, `http://127.0.0.1:11605/v1`, model `qwen3:8b`, official Agno `OpenAIChat` local protocol adapter. The protocol name is not a cloud OpenAI API call. The SDK model is never allowed to change the existing server's process, port, bind address, authorization or model. No subprocess starts a model server. No Ollama invocation occurs in this evaluator.

**Authentication:** backend-only `YANCE_W43_LOCAL_KEY_FILE` must point to the already protected local API key file or `local_key_file=...` must be provided explicitly. Do not save, log, publish, transmit to browser or commit the key. Missing/unreadable key must fail closed. Requests use only the pinned loopback server and approved model ID; anonymous `/v1/models` must return 401.

**Purpose:** `HEALTHCHECK` by default. The Qwen3 8B model supports actual SDK connectivity and synthetic quality evaluation (opt in to `purpose="QUALITY_EVAL"`); it is not yet certified for automatic human-facing replies. Earlier 1.5B remains explicit legacy rollback, not default. Provenance carries `quality_qualified=false` and `outbound=DISABLED`. Candidate count remains 0 at the W43 layer. Do not offer real automatic reply, paid fallback, production authorization or social account sending.

The previous PR #26 contains optional Qwen3/Ollama model code and quality policy tests; the active engine is now the **same** original llama.cpp service with already-installed Qwen3 8B GGUF. No inference is routed to Ollama, no new paid model or permanent second server. Manual rollback scripts preserve the original 1.5B configuration. Any future switch requires new approval.

## Exact reuse surface

- `Scope("SYNTHETIC_TEST_ONLY", "fixture-account-1", "CONTACT", "FB_PERSONAL", "fake-peer-001", 1)` computes full synthetic canonical K, user ID and session ID. A PRIVATE scope is separately isolated.
- `NativeAgnoRuntime(db_file, local_key_file=...)` constructs native official Agno `Agent`, `Team`, `AgentOS` (in-process only), `SqliteDb`, Tools and Memory.
- `runtime.run(scope, "fake-<prompt>", thread="default")` calls **actual** SDK `Agent.run` or `Team.run`; returns `status, sdk_pin, provider, model_id, purpose, quality_qualified, space, user_id, run_id, session_id, original_response, token_usage, provenance, suggestions=[], outbound=DISABLED`. Errors contain no secrets and return zero suggestions.
- `runtime.attest_contact_run(scope, prompt, receipt, thread="default")` verifies an untampered receipt issued by the **same in-process W43 runtime** for exact synthetic scope, prompt and thread. NEVER treat this as W24 effective grant or cross-process authorization. An authenticated cross-service bridge needs W24 owner's endpoint and independent security signoff; no AgentOS HTTP serving.
- `runtime.remember_synthetic` and `runtime.read_synthetic_memories`: persisted Agno SDK SQLite memory with canonical scope isolation.
- `runtime.read_trace_receipts(scope, run_id)`: native Agno Trace query. A real trace exists only when Agno tracing has been initialized by `runtime.get_unserved_app()`, and this must NOT be bound to a public socket.
- `runtime.run_for_w45` remains a **separate, explicit `purpose="QUALITY_EVAL"`** strong-model-only synthetic contract. Current Qwen3 8B can be selected by the same llama.cpp adapter for evaluation, but source evidence does not certify its conversational quality or mint W24 grants. W45 alone owns 0–3 candidates, and cross-process attestation remains HOLD.

W45's current `w43-contact-bridge.mjs` matches provider `LLAMACPP_LOCAL_NO_PAID_API` and model ID `qwen3:8b`; the same-runtime Python attestation cannot be called from Node without a future authorized binding. Cross-process Attestation and W24 grants: **HOLD**. Translation and 0–3 suggestions are W45-owned; W46 owns draft-only Composer, W25 alone sends through authorized MessageDelivery.

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

The prior 1.5B smoke results are historical, NOT evidence for this new 8B default. Exact new-model evidence must be read from the separate 8B upgrade receipt and test logs. The active W43 runtime now checks the existing protected localhost `/v1/models` alias before every run; if the operator rolls back to 1.5B without a matching model setting, W43 returns `HOLD_LOCAL_MODEL_ID_AUTH_OR_SERVER_MISMATCH` with zero suggestions. It never queries Ollama in the active llama.cpp backend. Four-language connectivity, Tool registration and SQL persistence are still **not** translation-quality or 200-tool certification.

**2026-10-25 Owner correction:** the earlier two-session failure was incorrectly labelled model concurrency/transport failure. Reproduction with full SDK state shows `PAUSED` on **six of six** simple-greeting Runs, both before and after transport/timeout negatives: the model selected a confirmation-required tool. No approval was resumed or executed. The native Agno adapter now distinguishes `AGNO_RUN_PAUSED_REQUIRES_APPROVAL` from real `LOCAL_MODEL_UNAVAILABLE_OR_RUN_FAILED`; paused results return **zero candidates** and `outbound=DISABLED`, and never become an attested completed reply. The evaluator uses an explicit no-tool greeting for its narrow concurrent inference check and distinguishes unexpected Approval PAUSE from transport/concurrency failures. A separate real two-session run with a read-only greeting passed 2/2; this does not establish sustained multi-contact throughput or quality. **HOLD:** multi-contact stress/concurrent AUTO throughput certification; investigate unintended tool selection quality independently. Also HOLD: supervised Approval resume, full AgentOS API/Trace control-plane authorization, W24/W44 identity/grants/budget, W45 real translation & qualified candidates, W46 Composer handoff, W25 outbound, real-person data, production deployment, any cloud/paid model. No actual social contact send.
