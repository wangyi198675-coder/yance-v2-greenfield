# W43 Official Agno / AgentOS — Model Policy Correction 2026-10-25

Source Owner: W43, services/agentos/** only. Nonproduction, synthetic test-only. No live account, real send, paid API, production change, or second agent engine.

## Decided model strategy

1. Qwen2.5 1.5B: **HEALTHCHECK ONLY**. The existing local llama.cpp listener 127.0.0.1:11605 and its protected key file are reused only for Agno connectivity and actual Run/Team/session/trace health checks. The Agno OpenAIChat class is an OpenAI-compatible HTTP format, NOT OpenAI cloud, and no fee is incurred.
2. Qwen3 8B: preferred free LOCAL quality-test model. Default NativeAgnoRuntime chooses official Agno Ollama adapter with qwen3:8b at localhost:11434. It checks the actual installed model list, and fails closed when missing. It never falls back to a small model or paid provider. Actual model-quality acceptance needs completed install and successful real SDK inference.
3. ChatGPT plan SIWC: the preferred eventual cloud option IF the V2 application is a confirmed participating app and the current user separately authorizes plan sharing, native grant scope and applicable allowance. Subscription login is NOT API eligibility. V2 authoritative proof is currently HOLD, and the W43 policy always denies a cloud call pending W24/W44 native attestation.
4. Other authorized providers: must be explicitly selected, authorized, and billed only after approval; W43 cannot authorize them and never automatically switches to paid use.

Agno 3.1.10 SDK/AgentOS remains the **sole agent engine**, and providers are SDK Model adapters. Upstream https://github.com/agno-agi/agno (Apache-2.0), https://docs.agno.com/models/compatibility, https://docs.agno.com/agent-os/introduction.

## Actual interfaces

- Scope: SYNTHETIC_TEST_ONLY, fake full canonical K, separate PRIVATE/CONTACT user/session digests, no mixed memory.
- NativeAgnoRuntime(db_file,backend="qwen3",purpose="QUALITY_EVAL"): official Agent, Team, Agno SqliteDb and AgentOS. Missing qwen3:8b produces explicit HOLD, zero suggestions, no outbound.
- NativeAgnoRuntime(db_file,backend="llamacpp",local_key_file=<path>,purpose="HEALTHCHECK"): pinned 127.0.0.1:11605 Qwen2.5 1.5B healthcheck only. The protected key never enters Git.
- run(): actual official SDK invocation; only native RunStatus.COMPLETED with nonempty response is success. SDK ERROR, returned Run ID and Trace never mean successful inference. No fake candidate padding, no sender.
- remember_synthetic/read_synthetic_memories/read_trace_receipts: real Agno persisted SQLite memory, full-K isolation and Trace. Tool and Approval SDK objects are registered; actual Qwen3 model-selected tool execution and admin approval resume are still HOLD.
- run_for_w45(): after a genuine strong Qwen3 completion provides W45 expected full-K, fake MID, original SHA, translation request ID, real Run ID, Session ID, Agent ID, provenance and zero draft-only default candidates. Local attest_w45_same_runtime() verifies only in-process runs. A separately authorized cross-process bridge must be implemented before W45 accepts it. W45 alone owns 0-3 real provenance-linked candidates.
- get_unserved_app(): native AgentOS FastAPI object for LOCAL INSPECTION ONLY. It must NEVER be network served until W24 supplies authenticated identity, consent and revocation/RBAC.

## Historical ChatGPT SIWC formal results inherited (NOT copied)

Read MasterController W512_20261019_CHATGPT_PLAN_NATIVE_SIWC_DA424_REAL_THREE_FORMAL_GO.md.

Old Web SHA 7d1d858eccd804700c714a72702198283051f4a2; old API SHA da4242b7b56fbab76a6a1463444b5d885e277b61. Historical results: native first-party SIWC authorized reply candidate HTTP 200, 3 visible reply suggestions, 166 PASS, zero real outgoing messages. Historical security negative cases distinguish completed reasoning metadata + required assistant output_text from forbidden function calls, empty tool results, agentless unauthorized paths, invalid/revoked grants. These are source contracts to inherit via the responsible V2 native Owners, not authorization proof for V2. Old credentials and user messages MUST NOT be read, copied or replayed.

Official SIWC scope/usage reference https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites.
ChatGPT subscriptions and API are independently billed https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform.

V2 current ChatGPT plan-sharing participation, exact grant scope, per-feature rights and remaining allowance: **HOLD_NOT_VERIFIED**. No paid API fallback or extra mandatory API purchase.

## Tests and actual model quality results

Install requirements-test.txt into independent Python 3.12 venv. Never use a production process.

PowerShell, from repo root:
    $env:YANCE_W43_LOCAL_KEY_FILE = "<authorized protected local key file path>"
    Remove-Item Env:OPENAI_API_KEY,Env:OLLAMA_API_KEY -ErrorAction SilentlyContinue
    python -m pytest -q --basetemp="<separate writable private test temp>" services/agentos/tests

W43 tests as of 2026-10-25: 38 PASS, 0 FAIL. Qwen2.5 1.5B REAL SDK Agent/Team/Trace healthcheck and native memory/session persistence succeeded. This is not a quality score. Model-provider policy, cloud denial and simulated W45 DTO shape tests also passed; these latter tests do not call Qwen3 or a cloud model.

Qwen3 test script:
    python services/agentos/eval_qwen3_8b.py

2026-10-25 result: HOLD_MODEL_NOT_INSTALLED, exit code 2, inference_tests_run=0. This script must not fallback. After actual installation, it will exercise four original EN/DE/PL/ZH prompts and one actual model-selected native tool call, reporting per-case SDK status. Even passing script is only an engineering language smoke; full translation semantics and reply style require W45 review.

W45 current separate owned branch cc70468bc82bd2d9c7a0fd9dc0e4499cc670cbd8: read-only tests 18/18 PASS. Its LibreTranslate loopback HTTP response is MOCKED, so real multilingual translation and actual 0-3 strong-model suggestions remain pending.

## Owner dependencies and remaining blocks

P0 W24/W44: V2 real authorized SIWC participation, share scope, quota, revocation and exact effective grant. W43 NEVER accepts login or caller-supplied flags as authorization.
P0 W43: Qwen3 8B completed installation, real inference, tool invocation and human approval continuation are not yet verified.
P1 W45: real EN/DE/PL/Chinese translation engine, real provenance, 0-3 candidates and cross-process W43 attestation.
P1 W46: unique B+C Composer draft handoff. W25: sole synthetic Outbox/ACK/UNKNOWN, no alternative sender.
P0 hosted AgentOS/Control Plane: no network hosting before authorized W24 gateway and security review.

The source ACK remains in GitHub Issue #5. An independent human legal/security signoff is separate.
