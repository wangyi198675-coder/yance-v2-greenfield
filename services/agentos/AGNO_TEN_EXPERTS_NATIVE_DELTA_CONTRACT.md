# W43｜用户批准R4紧凑设计｜Agno十类专家最小原生资格/接口契约
2026-10-27 | One native Agent + original Agno3.1.10 + original SQLite/History/Run/Trace
Owner: services/agentos/** ONLY; W47 HTTP/API, W45 contact domain, W46 B+C UI

## Source decisions
Read COORD_AGGREGATE/DESIGN_APPROVED_20261027_R4_COMPACT_V1/00_START_HERE.md and 01_USER_APPROVED_CHANGELOG.md, and prior AGNO_TEN_EXPERTS_REAL_CAPABILITY_AUDIT.md. Ten names are USER-APPROVED DESIGN. This is not approval to mark them all INSTALLED. Preserve original W42 R4 compact approved Expert Center, Composer "＋→专家", BRAIN expert action. Do not rebuild the Agent, team, memory, composer or UI.

## Truthful ten expert qualifications

| expertId | approved R4 label | real original upstream prerequisite | W43 CURRENT |
|---|---|---|---|
| persona-natural-expression (provisional ID) | 人格与真人表达专家 | signed unified Persona/learning approval/version | CATALOG_ONLY / NOT_INSTALLED |
| german-natural-chat | 德国 WhatsApp 自然聊天专家 | W45 style evaluation and W24-authorized conversation source K/MID | CATALOG_ONLY / NOT_INSTALLED |
| europe-language-style | 欧洲语言文化专家 | W45 source-attested language style tool | CATALOG_ONLY / NOT_INSTALLED |
| relation-memory | 长期关系记忆专家 | W45 sourced contact facts and revoke/version | CATALOG_ONLY / NOT_INSTALLED |
| chat-goal-planner | 聊天目标规划专家 | W45/W44 persistent goal, K/MID grants | CATALOG_ONLY / NOT_INSTALLED |
| reply-quality-growth | 回复质量成长专家 | W45 quality source plus user-approved learning | CATALOG_ONLY / NOT_INSTALLED |
| media-conversation | 多媒体对话专家 | W23 native media/provider and consent | CATALOG_ONLY / NOT_INSTALLED |
| system-health | 系统健康安全专家 | W47 health probe wrapped as signed original native Agno tool | CATALOG_ONLY / NOT_INSTALLED |
| oss-discovery | 开源能力发现专家 | original Agno describe_yance_capability @tool | **REGISTERED/INSTALLED (READ_ONLY_STABLE252_INSPECTION ONLY)**. NOT MCP Registry/web discovery/install |
| safe-repair-upgrade | 安全修复升级专家 | actual isolated repair SDK/Owner approval | CATALOG_ONLY / NOT_INSTALLED |

Catalogued 10 / original runtime qualified + registered 1 / eligible user-invokable mode 1 / 9 unavailable; explicit canInvoke/installed/registered status in DTO. The category OSS-discovery is *partially* implemented; don't promote to full external OSS discovery. Not one of the above permits account login, paid API, social send or autopilot.

## Agno topology

                 [W46 unique B+C Composer "+ →专家" / original BRAIN]
                                        |
                          existing W47 same-origin private context
                                        |
            [W43NativePrivateBrainPort: ORIGINAL single Agno Agent]
                         |                         |
                native expert directory       native expert_turn (THIS_TASK)
                         |                         |
              same original SQLite           existing W43 request ledger
          w43_native_expert_preference                  |
       per *authenticated* original User ID         SAME Agent.run
                         |                              |
              enabled only if installed        native @tool read-only call
                                                        |
                                            Agno SqliteDb RunOutput+Trace
                                                        |
                                          W45 original suggestions/Composer
                                                        |
                                         W25 only, separate social permission

**Real upstream SDK Team proof:** Existing NativeAgnoRuntime.teams["PRIVATE"] is original Agno Team(mode=route) with one existing original Agent member. No second Agent or Team runtime built. Team.run delegated actual Qwen3 read-only task and native Tool, and original AgentOS DB stored actual member and Team Run+Trace. This proves SDK Team routing, not yet W47 product's connected expert-click/Team flow. For W47 first expert use same original W43 Port.expert_turn => original Agent.run + real @tool with original private requestId; this avoids a second unguarded Team spending boundary. W47 is not yet wired; do not state B+C USER_DELIVERED.

## Exact server-native W47 Python contract (NO NEW HTTP SERVER)
W43 original Owner class services/agentos/private_principal_port.py:W43NativePrivateBrainPort. All require W47 CURRENT server context; unauthenticated default 503, current-scope per-user original Agno AppData and SQLite. No browser OS username, userId, dbPath, API Key, sessionId/trace id accepted as identity.

1. expert_directory(context) -> {status:NATIVE_EXPERT_DIRECTORY_READ,agentId:w43-private-brain,cataloguedCount:10,registeredCount:1,installedReadOnlyCount:1,experts:[{expertId,label,registered,installed,enabled,revision,canInvoke,availableMode,qualification,upstreamOwner,supportsContactBinding:false}],canSend:false,qualityQualified:false}. Available even with no model configured.
2. expert_set_enabled(context,*,expert_id:str,enabled:bool) -> {status:NATIVE_EXPERT_PREFERENCE_UPDATED,expertId,enabled,revision,qualification,canSend:false}. Can only toggle an actually installed expert (oss-discovery limited mode). Original per-user SQLite table w43_native_expert_preference, no new db/authority. Disabled expert returns 409 and cannot invoke. Invalid/nonboolean 422. Separate user's state unaffected, survives restart.
3. expert_turn(context,*,thread_id,request_id,expert_id,stable_id,usage_scope="THIS_TASK") -> {status:COMPLETED_READ_ONLY_CATALOG_INSPECTION,expertId,usageScope,stableId,toolCallId,runId,sessionId,assistantText,modelProvider,modelId,businessExecuted:false,canSend:false,qualityQualified:false}. This is strictly oss-discovery read-only inspection of a registered StableID. It calls original NativePrivateRequestLedger.claim -> original W43NativePrivateBrainPort.turn -> SDK Agent.run -> inspect same persisted function_call + ToolExecution + tool role exact matching ID/result -> ledger.finish. Unknown/mismatched evidence or model not complete => 503 with NO fake success / no auto rerun. Unsupported expert 409, no model config 503. No arbitrary other tools are qualified by this interface. Client requestId is protected by the EXISTING private ledger on same SQLite.
4. Original native_tools / native_runs / native_run / native_trace remain intact, with verified Run ID/trace spans and original scoped user/session. The first real expert Run's Agno @tool result has status DECLARED_NOT_AUTHORIZED_FOR_EXECUTION meaning catalogue read completed, **NOT business executed**.

W47 original Owner should add ONLY thin existing Python child/HTTP method dispatches for 1-3, explicitly route GET Experts directory, POST enable/disable, POST expert-turn with {threadId,requestId,expertId,stableId,usageScope}, then GET original native Run/Trace. HTTP auth/replay/CORS remain W47-owned, no new server/platform. REQUESTS MUST be bound to current W47 local user. Default no model -> normal setting UI, not terminal pairing.

## W45 contact persistence and user-selected scope (NOT yet wired)
Approved UI conceptual scopes: THIS_TASK, THIS_CONTACT, GLOBAL_DEFAULT. Current W43 safe execution only THIS_TASK. Anything else rejects W45_CONTACT_SCOPE_BINDING_NOT_CONNECTED /503, not a blanket authorization. W45/W24 must supply actual scoped authoritative K=(tenant,account,channel,peer,binding_revision) and real sourceMID; user-selected expertId + scope + approved source context must persist in W45's EXISTING relationship/goal record (not a W43 shadow contact store). Expected minimum W45 binding receipt:
  {expertId,scope,taskId,contactK,sourceMid,bindingRevision,revision,revokedAt,expiresAt,personaPolicyVersion,sourceEvidenceId,agentRunId,sessionId}
Contact A new MID must be checked against the current per-contact/expert binding and grants, then original W43 expert execution may produce Draft/ReplyBrain suggestions through W45. Do not interrupt hosted contacts B/C because user viewed A, and do not send from Agno. W45 must differentiate Persona general policy/relationship facts from Agno ChatHistory. This is an interface ask, NOT implemented W45 data migration or production result.

## SDK bounds, approval and negative semantics
- Only one original Agent registered in AgentOS; original Team route uses the same Agent member; no second database, task scheduler, tool framework, Composer or sender.
- SDK Skills/Knowledge not mounted, MCP=false, update_memory_on_run=false, scheduler=false. No actual registry search, Persona learning/version, media synthesis, system repair, MCP installation. A failed category cannot turn enabled merely because P2 or R4 JSON exists.
- Synthetic review_synthetic_draft @approval remains PAUSED until the user approves; no automatic confirm or equivalent expert bypass.
- Native local Qwen3 originally user-installed existing llama-server.exe 127.0.0.1:11605; no restart or replacement. No cloud paid call or real platform account.
- User private API actual execution continues original requestId durable fences; ledger UNKNOWN is never blindly retried.

## Actual local native official Agno 3.1.10 verified execution

**Agno Team Qwen3 actual, synthetic authorized tool scope only**:
- Team Run d3b719f7-051b-4ec1-b279-0ae9e19e1394; original Team status COMPLETED; member Agent Run e892bef8-cf9d-4fdd-af87-3adaddbce6b1 COMPLETED, member tools describe_yance_capability.
- Team Trace 5a1f1de303a46862d323b7a0f158fa68, status OK, 7 native Spans; original SQLite qa-experts/team-real-f863c5be53484ae4a81210d39db7684e.sqlite; Team executed about 33.77s. The tool truthfully returned A01 not authorized for real business execution.
- Original registered catalogue count=10, qualified=1. The executable QE proof toggled oss-discovery false/true in the SAME DB before actual official Team SDK run; model completed. No social sends.

**Actual W43 PRIVATE Expert Port + same original request ledger** (fake W47 resolver explicitly synthetic, NOT installed real-user UI):
- Native Agno Agent Run fc4b5b04-edbe-8259-10d3-e9289e6f067c, COMPLETED, model qwen3:8b; original Agno toolCallId sHPNfiElRjYbqApj78U7EaeNy0fTHwB8, SDK_TOOL_RESULT_PERSISTED; Agent Trace d1de6f5b33938c98ab95b37a4bb80c16 status OK 4 spans. Original SQLite contains exactly one w43_private_request_fence row for runId fc4b5b04... with state COMPLETED and enabled Expert preference revision 2.
- QA printed REAL_NATIVE_PRIVATE_EXPERT_LEDGER_TOOL_TRACE_PASS, exit0. It uses an explicit fixture resolver for W47's verified context, NOT a human user/real platform.
- Existing native W43 Agno History remains original, no second store; Run trace/detail uses original readback methods.

Test report: new isolated expert 23/23 PASS (disabled/reenabled persists, cross-user isolated, 9 real upstream not installed, W47 unconnected fail-closed, no model needed for directory, unsupported contact/global scope rejected). W43 inherited suite to be rerun on final exact SHA; no fake model success reported as real.

**Product end-to-end HOLD:** W47 original API routes not wired for experts, W46 original R4/Composer expert UI not yet connected, W45 actual contact/global binding, Persona versioning/approval, 9 upstream native qualifications missing. W09-3 will combine only exact original Owner signed source and perform real 44767 click → W47 → W43 tool/Run/Trace readback. No current fixed 44767 deploy or main merge by W43.
