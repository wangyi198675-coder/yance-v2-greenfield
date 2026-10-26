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

## W43 / 2026-10-26 / Real PRIVATE principal consumer (W47 producer not yet signed)

This scoped delta to PR #54 e20c2c3 retains official Agno 3.1.10, its original PRIVATE Agent and SqliteDb, Qwen3 8B through the existing authenticated llama.cpp 127.0.0.1:11605, and W09-2's previously signed two real Chinese runs and fresh-process database restore. It adds no alternative Agent, no model service, no web server, no sender and no chat database architecture.

Native W43 entry: W43NativePrivateBrainPort(resolve_current=W47_TRUSTED_SERVER_RESOLVER, local_key_file=EXISTING_PROTECTED_PATH), methods turn(serverContext,thread_id,text,request_id) and history(serverContext,thread_id). Without a resolver both fail 503 W47_TRUSTED_PRINCIPAL_NOT_CONNECTED. The W47 resolver is an authenticated, server-private verification callback, NOT a browser-supplied claim, arbitrary JSON blob or authority issued by the Python dataclass.

W47 must supply a VERIFIED current principal object with stable principal_ref across legitimate re-pairing, installation_ref, short-lived session_ref, session_revision, revocation_generation, expires_at_ms and W54-authoritative per-user app_local_data_root. Actual W47 SHA 42f659372fc0d8746da517a563ce4c03f60488ab currently stores only csrf, expiresAt and rev in its local Session; it does not have the required trusted stable principalRef, protected native request binding or W54 mapping. Therefore cross-owner real join and formal W47 signature stay HOLD.

Private scope canonical identity is LOCAL_VERIFIED_PRIVATE/installationRef/principalRef/PRIVATE; stable native Agno scoped user ID and per-thread session ID are derived internally with SHA256 and never depend on rotating Cookie. Per-user native SQLite filename is under the verified W54 AppLocalData path/YanceV2/Agno/private/hashed-partition/agno-native.sqlite; W43 rejects any linked/junction path segment. This is the EXISTING native Agno SQLite provider, not a second ChatHistory system. W54/W55 owner ACL and encryption qualification for real sensitive data remain HOLD.

W43 turn requires W47 verifyCurrent before SDK and after, enforces one-slot model capacity, checks actual SDK RunStatus COMPLETED, nonempty answer, real Run ID and exact same Session ID. Expired/revoked/changed-session results are NEVER returned. W43 history checks W47 principal both before and after native Agno get_runs and only returns user/assistant/tool items of the same private principal/thread; ERROR and PAUSED assistant/tool items are not displayed as completed content. All output qualityQualified=false, canSend=false. Only synthetic tools remain available; 200+ qualified actions remain HOLD.

Proposed W47-only HTTP routes (NOT currently deployed): POST /api/v2/private-brain/turn with exact-Origin verified Session Cookie and X-Yance-CSRF, bounded JSON {threadId,text,requestId}, server-side principal mapping; GET /api/v2/private-brain/history?threadId=... with same current verified W47 Session, Cache-Control:no-store. W47 must recheck session immediately before HTTP response write. Browser must never send principalRef, SID, OS user, account, dbPath, tenant or W47 token as self-proving authorization. W47 must own durable requestId replay handling: W43 currently only validates requestId syntax, so unknown completed Run must not be blindly retried.

HTTP/status contract: 200 only from completed nonempty official Agno output or same user's real history; 401 missing/expired/revoked local Session; 403 cross-person/Origin/CSRF per W47; 409 sessionRevision/revocationGeneration changes mid-operation; 422 invalid thread/text/requestId; 503 missing trusted W47 principal producer, lost W54 storage, absent model, failed native DB or capacity timeout. No real W47 source ACK currently exists. Distinct user, thread and per-user database isolation is covered in fixture testing; no claimed real Windows two-OS-user blackbox proof.

W47 must authenticate the user before any call; PRIVATE chat requires no Facebook/WhatsApp/Telegram account, but local Session does not authorize Provider or W25 sending. W46 alone owns unique PRIVATE BRAIN UI, no second assistant. W09-2 and SEC must independently sign the interprocess boundary before 44751/47182 controlled release.

W43 test producer is explicitly a FAKE server-side W47 resolver. Those tests prove safe consumer semantics, NOT genuine local human authentication, native IPC, Web GET/POST or HTTP CSRF. Historical model and ChatHistory qualified evidence remains separate. No main, live web, paid API, real account or outbound change.


## W43 ↔ W47 exact PRIVATE HTTP/native DTO reconciliation / 2026-10-26

This is a SOURCE-only incremental response to W09-2 3-Owner RED handoff BD3AC95. It reads the exact W47 original Owner source 18cb424bb61ac4ebcd4424a0ff3706ba66bbd2e9 in services/api/runtime/private-brain-http.mjs and adopts its EXISTING HTTP names rather than requiring frontend or W46 field guesses.

CURRENT W47 HTTP contract (unchanged by W43):
- POST /api/v2/private-brain/turn accepts JSON {message: string, thread?: string}; W47 validates same-origin, current local Session and x-yance-csrf; W47 currently allocates requestId=randomUUID itself. Do not pretend that UUID is durable idempotency.
- GET /api/v2/private-brain/history?thread=personal; W47 validates current local Session, rejects other query keys and sends Cache-Control:no-store.
- The W47 server-only agnoBridge calls are runPrivateTurn({profile,thread,message,requestId}) and readNativeHistory({profile,thread}); these are NOT production-authorized today. A W54 profile object {source,verified,profileRef,appDataRef} is NOT directly equivalent to the W43VerifiedPrincipal containing trusted installationRef+stable principalRef+revocationGeneration+W54 server-authoritative per-user Path. Browser JSON can never be a trusted profile.
- New W43 w47_private_dto.W43W47PrivateBridge exposes the EXACT above camelCase method names and emits precisely W47 expected NATIVE response fields: runPrivateTurn -> {status:'AGNO_RUN_COMPLETED',original_response,run_id,session_id,provenance:{type:'AGNO_RUN_RESULT',sdk_pin:'3.1.10',run_id,session_id,source:'LLAMACPP_LOCAL_QWEN3_8B_FREE',model_id:'qwen3:8b',purpose:'QUALITY_EVAL',quality_qualified:false},outbound:'DISABLED'}; readNativeHistory -> {status,messages:[{role,content,run_id,run_status}],run_count,complete_turn_count,source:'W43_NATIVE_AGNO_CHAT_HISTORY',quality_qualified:false,outbound:'DISABLED'}.
- To prevent provenance fabrication, W43 original private_principal_port.turn now checks native Agno SDK COMPLETED+visible answer+exact derived Session ID and then reads the persisted RunOutput from existing SqliteDb.get_runs(session_id,user_id,agent_id), matching stored original run_id, user_id, session_id, agent_id, RunStatus.COMPLETED and exact answer bytes. If missing/wrong/ambiguous => 503 AGNO_NATIVE_PERSISTED_RUN_UNVERIFIED with no client answer/provenance. After DB proof W43 rechecks W47 current session once more. THIS does not certify model answer quality: quality_qualified=false and no W25 sender.
- SECURITY: A W47 JavaScript call runPrivateTurn(args) cannot itself be considered a trusted Python call. The W43 bridge requires an additional SERVER-ONLY trusted_request_context bound to a genuinely W54-backed, W47-authenticated live request, and the original W43 port also requires resolve_current(context,op). When either is absent, W43 returns SEALED 503, no fake context. The current W47 source calls agnoBridge.runPrivateTurn(args) without such binding, and W54 W47 secure IPC is not signed. W47 Owner must modify ONLY its own services/api/runtime bridge to pass a securely bound context, not attach an extra fake JSON attribute or trust profile.
- W47 must revalidate current session immediately before HTTP response commit. W43 checks again before returning native result. If revoked/expired or session revision changes mid-model run, no completed answer is disclosed (HTTP 401/409). A model run may have reached SQLite before revocation is observed; no later access without fresh lawful user pairing, and any post-revocation persisted-run suppression/deletion and durable idempotent unknown-run recovery remain joint W47/SEC HOLD.
- W47 trusted profile storage must use a genuine W54 verified current-user path; do not parse appDataRef as a path supplied through HTTP. The per-principal existing Agno SqliteDb partition remains unchanged. W47 must supply stable principalRef across a legitimately renewed local Cookie and monotonic revocation generation.
- W47 expected HTTP success currently maps result to {ok:true,status:'AGNO_RUN_COMPLETED',thread,answer,runId,sessionId,provenance,canSend:false,providerAuthorized:false}, and history to {ok:true,status,thread,messages,runCount,completeTurnCount,source:'W43_NATIVE_AGNO_CHAT_HISTORY',canSend:false,providerAuthorized:false}. W43 does not generate a second HTTP response/route.

New tests are FAKE W47 server principal and FAKE SDK RunOutput persisted in original REAL Agno SqliteDb (not a genuine newly generated model answer). They verify sealed/default 503, exact W47 DTO source and provenance from stored runs, native history counts, reject wrong client field aliases, reject a SDK-shaped but absent DB Run, and revoke in the middle of Agno. No actual 44751 user positive flow or trusted Windows two-user IPC claim.


## W43 | 2026-10-26 | Canonical W47 dc56b63 + original Agno native request ledger

CANONICAL W47 HTTP: POST /api/v2/private-brain/turn body {threadId?,text,requestId}; GET /api/v2/private-brain/history?threadId=personal. The older W43 w47_private_dto.py module is historical fixture compatibility ONLY, NOT wired by W47 dc56. The current W47 server invokes original W43NativePrivateBrainPort via private-python-port.mjs and w47-w43-private-child.py. Do not introduce alternate transport or Agent.

New private_request_identity.py derives a deterministic original Agno run_id and metadata from fully scoped authenticated PRIVATE identity, thread and requestId, plus SHA256 prompt digest. Original Agno 3.1.10 Agent.run receives those values; never fabricate model output.

New private_request_ledger.py uses one small w43_private_request_fence TABLE in the SAME existing Agno SqliteDb file per already W54-authorized private principal. No second DB, reply store, Agent, model, sender or Outbox. sqlite3 BEGIN IMMEDIATE serializes claims across actors and processes. claim(...) returns CLAIMED only once and IN_PROGRESS for duplicates, CONFLICT on changed prompt, UNKNOWN on uncertain execution; COMPLETED replay only from verified native Agno completed RunOutput. begin_execute(...) changes the single durable claim IN_PROGRESS -> EXECUTING atomically; original W43 Port.turn now REQUIRES that transition BEFORE Agno Agent.run and rejects unclaimed or duplicate requests (409) without model execution. A timeout/crash cannot silently retry the model. mark_unknown(...) records unknown without calling the model. reconcile(...) validates actual Agno get_runs scoped by user_id/session_id/agent_id, deterministic run ID, matching metadata and nonempty model reply, then finish(...) commits COMPLETED durably. Replay reconstructs answer from native RunOutput, not from caller-supplied receipt or fabricated provenance. No secret, raw prompt or duplicate reply archive is stored in the request fence.

W47 Owner W47 dc56 still expects Node requestLedger claim({key,payloadHash,context}), finish({key,payloadHash,receipt}), markUnknown({key,payloadHash}), while W43 trusted native ledger methods require verified context plus thread_id,request_id,text to reconstruct the original Run identity. W47 Original Owner MUST wire the authoritative W43 ledger through protected server-only Node-to-Python transport and agree one ledger of record; server-supplied key/payload SHA or W54 profile JSON is not verified Principal by itself. Current W47 production ledger is NULL; no native W54 trusted current OS-user resolver or protected AppData root was signed yet. Thus all real PRIVATE POST stays SEALED/503. The W43 native ledger source is NOT the completed HTTP P0 until that Owner-to-Owner wiring and final response recheck are separately verified. Do not introduce a parallel production ledger.

W43 fixtures prove claim concurrency, persistent same-native-Agno-SQLite state, new Python process reading persisted completion, request ID/text conflict, unknown no automatic rerun, one atomic EXECUTING winner, incomplete native result rejection, final native Run provenance, revoked user, and separate users/threads. All W47 resolver and new RunOutput fixtures are FAKE for tests, no new actual model call. W47 prior 27 Node/13 Chrome and historical W43 2 real Qwen3 completions + cold ChatHistory remain inherited, not re-run. quality_qualified=false, canSend=false; no user delivery, real platform login, paid call, main merge or fixed 44751/47182 deployment.
