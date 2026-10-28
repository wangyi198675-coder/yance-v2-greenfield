W43 Issue #77 -- Original Agno 3.1.10 Tools / Run / Trace read contract
2026-10-27 | W43 services/agentos/** original Owner only | no UI/W47 changes

NATIVE PYTHON BOUNDARY, FOR W47 CURRENT VERIFIED PRIVATE CONTEXT
Re-use original W43NativePrivateBrainPort with the SAME per-user Agno SqliteDb.
1. port.native_tools(trusted_context): SDK directory: 252 original StableIDs with each businessExecutable false, THREE actual registered SDK Tools with requiresApproval/canInvoke/readOnly flags. Registered tools: describe_yance_capability (real native read-only, not upstream business success), synthetic_source_lookup (fixture-only), review_synthetic_draft (fixture-only, @approval requires_confirmation).
2. port.native_runs(trusted_context,thread_id="personal",limit=25): same-user and same-thread original Agno get_runs. Returns Run IDs, native status, original model/provider, counts of Tools, approval status, no sending.
3. port.native_run(trusted_context,thread_id="personal",run_id=EXACT_ID): original persisted RunOutput and ToolExecution details. Tool success requires exact persisted assistant function_call id+name, ToolExecution id+name/result and tool-role message id/result within the SAME COMPLETED original Agno Run. StableID catalogue result can be viewed; arbitrary provider tool output is hidden until original owner performs safe projection, to avoid credential leaks. APPROVAL PAUSED remains WAITING_USER_APPROVAL, no auto-approval or resume.
4. port.native_trace(trusted_context,thread_id="personal",run_id=EXACT_ID): actual get_traces filtered by run/user/session/agent, then actual get_spans for each scoped trace. Returns native trace IDs, statuses, durationMs, span IDs/names/types/durations, NO raw trace attributes/system prompt/secret data. Absent trace => NATIVE_TRACE_NOT_FOUND with zero real spans.
All methods require original current W47 session / same per-user PRIVATE scope, revalidate after reading. Default no W47 session => 503 SEALED; invalid params 422, foreign or nonexistent Run => scoped 404; no model configured is OK for reading preexisting history/Run/Tools/Trace. This is no new HTTP server.

W47 HTTP SUGGESTED, NOT W43 IMPLEMENTED:
GET /api/v2/private-brain/tools
GET /api/v2/private-brain/runs?threadId=personal&limit=25
GET /api/v2/private-brain/runs/:runId?threadId=personal
GET /api/v2/private-brain/runs/:runId/trace?threadId=personal
W47 original Owner must add these four dispatcher methods to existing native Python child and same-origin authenticated HTTP paths. W46 original Owner must wire true Tools/Run/Trace TASKS UI to returned API, not static text. W43 has NO authority to change W46/W47 source or override 44767.

TRUE PREEXISTING LOCAL REAL QWEN3 AGNO SDK PROOF, NEW INDEPENDENT DATA READ:
Native Run c5be45a1-921b-431e-9b3b-d1453691e0dc status COMPLETED, local model qwen3:8b, original Session w43-private-session-b9d5416270f672eb0d32ef6f7d160fb136d25664e52561867d0f744d791c064f.
Original assistant function_call describe_yance_capability("A01"), actual tool_call_id kvCEtVzGQSn2P1W8aKacA7g22NKAnFUN. Native persisted ToolExecution and tool-role message agree, result DECLARED_NOT_AUTHORIZED_FOR_EXECUTION. This is one LEGITIMATE READ-ONLY catalogue Tool execution, NOT an upstream business operation.
Native original Trace 20a19f8e70e7f00567258b0f7a29036f, status OK, totalSpans 4, durationMs 28442.01. Real spans original OpenAIChat.invoke / describe_yance_capability / OpenAIChat.invoke / original parent Agent.run. SDK current read did NOT initialize an LLM. Original old trace parent display name Synthetic_Private_Brain.run reflects the historic persisted run BEFORE display-name correction, NOT a second agent. eval_issue77_native_inspection.py returned exit0.
Temporary fake run/trace/approval test fixtures are expressly distinct from this actual persisted Qwen3 result; no fake paid call, social sender, simulated business SUCCESS or trace fabrication.

PERSONA OWNER PRECISION:
In current combined V2 source, apps/web/evidence/W46_R4_CANDIDATE_STABLE252.json explicitly marks Persona entries W43_Agno_Learning_Memory|PersonaOwner_ApprovalAPI_PENDING. The checked V2 services/api/** and services/agentos/** have NO signed independent Persona learning approval/rollback/version native DB/API owner. W43 owns generic Agno SDK Memory and History, not a separate Persona approval/version subsystem. W09-2 must identify and authorize precise Persona Owner SHA/contract; W46 is UI owner, W47 is API thin integration owner. Do not invent Persona success or duplicate W43 Memory as Persona.
No pending owner approval automatically passed. No main merge, no replacement of current user fixed web 44767, no new Agent, DB, sender, paid API call or platform account use.
