# W43 | Unified existing local Qwen3 8B llama.cpp + official Agno 3.1.10

Nonproduction source Owner: W43, **services/agentos/** only. This is an incremental reconciliation of PR #36 HEAD \`d0987e9c64b937c923b3d32bda7bd05f86a638ba\` and PR #39 HEAD \`2a566e1385f0cae1fdea1d5b8983ea25fb862b1e\`, NOT an automatic merge or overwrite of either Owner branch. Base is PR #36; PR #39 provides the protected real-model alias preflight and strong defaults. Historical 42, 43 and 48 test receipts are retained as independent historical proof, NOT added to current test totals.

## ONLY native V2 model

Existing Yance Local AI Assistant llama.cpp server **127.0.0.1:11605**, model \`qwen3:8b\`, user-protected local key file. No model download, duplicate server, GUI/source/launcher/rollback edit, user account login, cloud API charge or outbound platform messages. Official Agno \`OpenAIChat\` is used **only** as localhost OpenAI-compatible transport; it is NOT OpenAI cloud.

- One formal model adapter entry: \`NativeAgnoRuntime(db_file, backend="llamacpp", purpose="QUALITY_EVAL", local_key_file=existing_protected_path)\`. Backend defaults to \`llamacpp\`, host fixed to loopback \`http://127.0.0.1:11605\`, model defaults to \`qwen3:8b\`. The default \`purpose\` is conservative \`HEALTHCHECK\`; real evaluation callers must explicitly choose \`QUALITY_EVAL\`.
- \`LLAMACPP_LOCAL_QWEN3_8B_FREE\` is the **Qwen3** provider token used by the current W45 PR #16; \`LLAMACPP_LOCAL_NO_PAID_API\` remains solely for historical Qwen2.5 1.5B HEALTHCHECK. This distinction is not a separate backend.
- Qwen2.5 1.5B cannot be used for \`QUALITY_EVAL\`; \`backend="qwen3"\`, \`backend="ollama"\`, and \`backend="qwen3_llamacpp"\` now all fail closed. The obsolete \`_local_model\` testing shim also fails closed. No use of 11434 or alternate/paid provider.
- Each \`run(scope, "fake-...", thread="default", team=False)\` validates fixture-only full identity K, expected exact local \`/v1/models\` alias and protected auth; then invokes official Agno \`Agent.run\` or \`Team.run\`. Only actual SDK COMPLETED with a **nonempty visible response** returns \`AGNO_RUN_COMPLETED\`. Missing/changed alias gives \`HOLD_LOCAL_MODEL_ID_AUTH_OR_SERVER_MISMATCH\` with no model Run ID or candidates.
- Successful receipt: \`engine="OFFICIAL_AGNO_SDK",sdk_pin="3.1.10",status,provider,model_id,purpose,run_id,session_id,user_id,original_response,token_usage,provenance,quality_qualified=false,suggestions=[],outbound="DISABLED"\`.
- No real identity consent is issued by W43 synthetic Scope. No public AgentOS server, paid API, durable signed W24 grant, external authorization or MessageDelivery exists here.

## Two independent Agno Sessions / existing CPU single slot

Server is untouched (\`--parallel 1\`). W43 \`run()\` uses \`w43_capacity.one_slot()\`, a bounded 90s **global thread + cooperative cross-process Windows file lock** for requests through this W43 adapter, with guaranteed release in \`finally\`. Two isolated synthetic K/SDK Sessions therefore do not simultaneously enter the W43 model call. Lock wait timeout or failure returns \`HOLD_LOCAL_MODEL_CAPACITY_BUSY\`, no fabricated Run ID, no extra candidate and no outbound. We do NOT control independent requests from the local GUI, other uncoordinated processes, or remote clients; overload/sustained traffic remains HOLD. The lock contains **no key, prompt, user ID or model output**.

The PR #39 two-session evaluator had a RED but an independent same-day targeted probe later got 2/2 PASS without qualifying sustained concurrent traffic. The current unified capacity patch demonstrates explicit serialization; this does not prove production fairness/throughput, multi-worker deployment, GPU utilization or SLA.

## W45 authoritative consumption contract

Read-only comparison was made with W45 PR #16 SHA \`643e90c2eb97fb44b522423878e544e5e3ee7eff\`. W45's \`w43-contact-bridge.mjs\` expects Qwen3 provider \`LLAMACPP_LOCAL_QWEN3_8B_FREE\`, model \`qwen3:8b\`, \`purpose=QUALITY_EVAL\`, the full synthetic Scope-derived user/session IDs, and exact Agno Run provenance. W43 keeps these shapes.

\`Scope("SYNTHETIC_TEST_ONLY", account, "CONTACT",channel,"fake-peer",binding_revision)\`, \`run(scope, synthetic_prompt)\` and \`attest_contact_run(scope,prompt,receipt,thread="default")\` bind full K, prompt, thread and receipt to the **SAME PYTHON RUNTIME PROCESS**. \`run_for_w45(scope,source_mid,original,translation_request_id,synthetic_prompt)\` additionally emits a real-model-bound \`engine,status,identity,sourceMid,originalSha256,translationRequestId,runId,sessionId,agentId,modelProvider,modelId,purpose,provenance,candidates=[]\` envelope; \`attest_w45_same_runtime(envelope)\` is also strictly in-process. \`quality_qualified=false\` remains in the native Run and provenance.

**W45 must update its hard-coded W43 \`sourceSHA\` and obtain W24-secured replay/actor/K/epoch proof before a real cross-process attestation bridge.** Never modify W45 source under W43 Owner authority or claim cross-process acceptance. W45 alone owns genuine translation semantics, 0-3 sourced, natural language replies and sole Composer draft handoff.

## Tests and exact gates

Use the pre-existing Agno 3.1.10 Python environment; do not install or start any new model runtime. On the authorized machine:

    $env:YANCE_W43_LOCAL_KEY_FILE = '<path-to-existing-protected-local-key-file>'
    Remove-Item Env:OPENAI_API_KEY,Env:OLLAMA_API_KEY -ErrorAction SilentlyContinue
    python -m pytest -q -m 'not local_model' --basetemp='<private-writable-dir>' services/agentos/tests
    python services/agentos/eval_unified_two_sessions.py
    python services/agentos/eval_unified_w45_trace.py
    python services/agentos/eval_qwen3_8b.py  # optional broader real EN/DE/PL/ZH + Tool smoke

Unit tests include scope isolation, W45 source/attestation rejection, model mismatch, non-cloud host limits, no external keys, genuine Agno object registration, cross-thread/cross-process lock, time-limited capacity rejection, error-path unlock and model/source/purpose invariants. Real synthetic Run/Trace/Memory logs are separate; smoke output is not proof of language *fidelity*. Existing \`eval_existing_llamacpp.py\` retains broader historical capability probes, now explicitly marks concurrency RED unless both real Runs finish.

## Unclosed qualification

- \`quality_qualified=false\` at all times until separately proven by qualified W45 + independent reviewers. Chinese-character presence, actual Run ID, tools or token usage are NOT translation correctness or human naturalness scores.
- Native Approval **resume**, real use of a 200+ tool catalog, real W45 0-3 proposals, cross-process authorized attestation, multi-worker admission limits, external GUI contention, sustained load, GPU VRAM/performance and production SLA remain HOLD.
- W24 identity/grants/epoch/revocation, W44 budget, W25 unique MessageDelivery, W46 sole B+C Composer integration are separate Owner gates. No production deployment, live channel login, external sending or paid model calls.
