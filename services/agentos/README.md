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


## 2026-10-26 W43 PRIVATE native ChatHistory delta — NOT WEB RELEASED

W43 reuses the already registered NativeAgnoRuntime.agents["PRIVATE"] in official Agno 3.1.10 + AgentOS, the SAME native Agno SqliteDb and the existing localhost llama.cpp model adapter. No duplicate Brain, Sender, Outbox, ChatHistory DB design, model server or HTTP port is created.

New interface: runtime.read_private_chat_history(scope, thread="default") requires PRIVATE-only Scope and exact derived private scoped user/session; verifies session.user_id and agent_id; uses NATIVE db.get_runs(session_id,user_id,agent_id) in run-index order. Agno keeps session metadata and run bodies in separate SQLite tables; relying only on db.get_session().runs can silently miss persisted runs. Returns status, session_id, run_count, complete_turn_count and all real user/assistant/tool role messages with Run ID/status. Excludes system instructions. A failed SDK Run containing only the user's actual text is NEVER counted as an AI reply.

PRIVATE needs no Facebook, WhatsApp or contact account. But current W43 PRIVATE Scope is explicitly SYNTHETIC_TEST_ONLY, not a W47-signed local human principal. W43 must not issue a browser Session or accept arbitrary self-claimed local identity.

Proposed minimal W47/W46 owner contract; NOT IMPLEMENTED in live 47182:
1. POST /api/v2/private-brain/turn. W47 authenticates server-issued HttpOnly SameSite Session, exact Origin, CSRF, current native user and AppLocalData identity. Request JSON: {threadId,text,requestId}. No channel K or peer. Server derives canonical PRIVATE context, then calls the EXISTING Agno PRIVATE Agent.run with user_id/session_id. Only real SDK COMPLETED plus nonempty answer returns {status,threadId,runId,sessionId,modelProvider,modelId,assistantText,qualityQualified:false}. Errors use explicit MODEL_UNAVAILABLE, SESSION_REQUIRED, CAPACITY_BUSY; never fabricate answer or do outbound.
2. GET /api/v2/private-brain/history?threadId=... after the SAME W47 server session. W47 calls read_private_chat_history; returns {sessionId,messages,runCount,completeTurnCount}, no-store. Browser cannot choose arbitrary OS SID, dbPath, account or userId. Different local user/context gets 401/403 and zero history.
3. W46 owns the existing sole PRIVATE Brain workspace and apps/web/src/BCProductWorkspaceCandidate.vue BRAIN slot, never creates another assistant. apps/web/src/BCNativeComposer.vue remains the existing CONTACT draft-only route.

This is a proposed contract requiring separate W47 and W46 OWNER ACK, not a signed route. W47 trusted pairing callback is still null. The actually running old API at 47182 returns local-session/status HTTP404, and health trustedSession=false. Fixed Web 44751 only returns static HTTP200. Origin/localhost/fake cookies are NOT authorization.

Actual current live failure evidence:
- Operator-scripted natural Chinese questions went through EXISTING Agno PRIVATE Agent twice. SDK returned ERROR Connection error for both, since existing llama.cpp 127.0.0.1:11605 is NOT listening now. Both real SDK Run IDs exist only as failed runs; no qualified model answer.
- Native Agno SQLite persisted both user messages. A fresh Runtime read found 2 persisted Run records, 2 user messages, 0 assistant messages, complete_turn_count=0; other fixture private account gets HISTORY_NOT_FOUND. This is actual native DB input persistence, NOT successful two-turn dialogue.
- eval_private_multiturn.py now checks 11605 before invocation. It produces HOLD_EXISTING_LOCAL_MODEL_UNREACHABLE, exit 2, 0 valid model turns; when the existing service is available it exercises two real Qwen3 responses followed by a NEW Python process cold restart and will never fake PASS.
- tests/test_w43_private_chat_history.py uses clearly labeled FAKE RunOutput fixture messages to validate the native DB contract, tool role recovery, restart, account/thread/contact isolation and fail-closed SDK error. Fixture PASS is not model quality PASS.
- No 200+ tool catalog/approval or real W47/46 integration signed. No new model provider, deployment, social account login or真人 sending.

W47 trusted native pairing and local principal + W54 per-user AppLocalData, W46 sole UI binding, actual running Qwen3 model, qualified complete natural human conversation and independent language quality, and tool/cross-owner authorization remain HOLD. W25 remains ONLY sending owner.
