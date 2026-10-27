# W47 PRIVATE Brain API runtime boundary — real owner contract
Date 2026-10-26. Only W47 services/api/runtime/** changes. No second Agent, history DB, login or sender.

## Current blockers verified against exact source
- W47 local operator code / existing local Session from 42f659372fc0d8746da517a563ce4c03f60488ab is inherited unchanged, W09 automation tests already passed. Real 44751 user-provided pairing is still HOLD.
- W46 candidate 4a7ca3e34e1e724bb0a9b992d85f603de03ed2fc has BCLocalSessionConnector.vue for existing BRAIN, strips code after submission, uses GET status as authority; still unsigned, and original 44751 remains B_88DED.
- W54 Rust c0c149c2151edfaa09bf40e258943cc4f3954a30 uses official Tauri PathResolver.app_local_data_dir()/data; only Rust can see that path, currently no signed W47 server-private current-user AppData resolver.
- W43 exact services/agentos/yance_agentos.py Scope still enforces tenant SYNTHETIC_TEST_ONLY, account fixture- prefix; run() requires fake- prompt. Existing eval_private_multiturn.py uses that synthetic Scope, despite real Qwen3 model calls. W47 must not remove restrictions under another Owner.
- Production server explicitly passes NO resolveNativeProfile or agnoBridge callbacks into createPrivateBrainHttp. A valid local Session gets 503 until W54/W43 separately sign truthful original native contracts. Unauthorized Session gets 401.

## API implemented under W47 scope
POST /api/v2/private-brain/turn
- Requires real unrevoked server-owned local Session cookie and configured exact Origin, matching X-Yance-CSRF, JSON body at most 16KB. Accept ONLY message (1–4000 chars) and optional opaque thread (1–64 safe characters); reject actor, SID, tenant, provider, account, DB path and other client identity claims with 422.
- After verified profile and signed W43 agent callback, 200 only for an ORIGINAL Agno SDK 3.1.10 completed run with original_response text, matching run_id/session_id/provenance and outbound DISABLED. Any run failure/paused/missing model/mismatched provenance => 503, never template reply.
- After awaited model call it rechecks original local Session; revoked/expired =>401 and suppresses response. In-flight model cancellation policy remains W43 Owner responsibility.

GET /api/v2/private-brain/history?thread=personal
- Same local Session check, no extra or duplicate parameters/identity/path. W43 signed bridge must call original NativeAgnoRuntime.read_private_chat_history on W54-approved per-user protected AppData original SqliteDb, not a second cache or fabricated history.
- Allowed 200 only with W43 native HISTORY_PRESENT / HISTORY_EMPTY / HISTORY_NOT_FOUND, valid user/assistant/tool messages and counts. Incomplete/unverified =>503.

## Proposed SERVER-ONLY owner injection ports, not existing W43/W54 exports
- W54 original signed current-user native profile authority: resolveNativeProfile() returns internal {source: W54_NATIVE_CURRENT_USER, verified: true, profileRef, appDataRef} after OS-native path resolution; the browser never supplies fields or sees actual AppData path. W54 must guarantee stable per-Windows-user profile and separate-install protection, no second login/enterprise IPC.
- W43 original Agno owner must supply runPrivateTurn({profile,thread,message,requestId}) and readNativeHistory({profile,thread}) as a signed minimal real PRIVATE Scope/NativeAgnoRuntime adapter; stable per-user + per-thread history and cold restore in original Agno SqliteDb. It must reject SYNTHETIC_TEST_ONLY mixed with real user, no new Agent/DB/server/sender.
- W47 then solely injects these two independently signed callbacks into existing server.mjs; until then both production callbacks are null, so no real model or history can return success. Unit-test mock callbacks are TEST-ONLY and explicitly not Agno acceptance.
- A valid local pairing never authorizes FB/WA/TG/Page. W24 CONTACT binding, W44 grant/STOP/budget and W25 Outbox/send remain separate and blocked; zero real contacts and canSend false.

## Required W09-2 and W46 integration
- W46 Owner signs new local connection Vue candidate. W09 owns real 44751 same-origin API proxy, signed R4 gate, exact HEAD CI; preserves static B_88DED rollback and runtime 47182. W09 must still verify actual human manually operates terminal pair, enters code into 44751, gets GET paired:true and logout/revoke/expiry/restart with two real Chrome contexts. Automated QA is not human authorization.
- W43/W54 real signed ports are strict prerequisites for TRUE private model Run and native ChatHistory. Browser alone cannot assert SID/Actor/DB path; returning a synthetic success is prohibited.
- Gate: W47_PRIVATE_HTTP_BOUNDARY_SOURCE_PASS / W54_APPDATA_PROFILE_BRIDGE_HOLD / W43_REAL_PRIVATE_SCOPE_AND_HISTORY_HOLD / REAL_HUMAN_44751_PAIRING_HOLD / REAL_SEND_HOLD / NO_DEPLOY.
