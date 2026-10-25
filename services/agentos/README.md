# W43 Official Agno SDK / AgentOS — Issue #5

Scope: services/agentos/** only. **Nonproduction synthetic** code. The engine is the official Agno SDK/AgentOS, not an in-house agent implementation. No live login, real outgoing messages, paid model invocation, production deployment, or direct publicly hosted AgentOS.

## Verified selected local model: existing llama.cpp process

On DESKTOP-029FH47 the user's existing local AI assistant is served by an independent llama.cpp listener on 127.0.0.1:11605, with the model qwen2.5:1.5b and a protected local API key file. This is NOT the broken Ollama listener on 127.0.0.1:11434. It has been verified by local HTTP health/model requests and an actual /v1/chat/completions response, then by the *official Agno* OpenAIChat-compatible local adapter returning SDK RunStatus.COMPLETED.

**The class name OpenAIChat refers only to the Agno HTTP protocol client.** The pinned base URL is http://127.0.0.1:11605/v1 and the pinned model is qwen2.5:1.5b. These requests never call OpenAI cloud, and the secret file never enters this repository. We did not restart the user's running llama.cpp assistant or download a second model.

Run the selected backend with the *path to the authorized local key file*, not the key itself:

    from yance_agentos import NativeAgnoRuntime, Scope
    runtime = NativeAgnoRuntime("C:/NONPROD_PRIVATE_DATA/w43.sqlite",
                               backend="llamacpp",
                               local_key_file="C:/LOCAL_PRIVATE_PROFILE/profile_api_key.txt")
    contact = Scope("SYNTHETIC_TEST_ONLY", "fixture-account-1", "CONTACT",
                    "FB_PERSONAL", "fake-peer-001", 1)
    receipt = runtime.run(contact, "fake-Say one friendly sentence.")

The default backend is llama.cpp. Constructor refuses missing local key files, non-loopback URLs, alternate ports, unsupported models and fake/non-synthetic input. The optional legacy Ollama backend remains available only for **non-model registration tests**; on this device its real inference is not ready.

## Official source, SDK, licenses

- Official Agno upstream repository and license: https://github.com/agno-agi/agno (Apache-2.0)
- AgentOS: https://docs.agno.com/agent-os/introduction
- Agents and Run API: https://docs.agno.com/reference/agents/agent
- Teams: https://docs.agno.com/reference/teams/team
- Tools and approval: https://docs.agno.com/hitl/approval
- Memory: https://docs.agno.com/memory/overview
- Tracing: https://docs.agno.com/agent-os/tracing
- Control Plane: https://docs.agno.com/agent-os/control-plane
- SDK version pinned: agno==3.1.10.
- Local llama.cpp listener is provided by the existing user's environment; W43 does not bundle/redistribute that server or model.

## Reproducible tests

Use an independent Python 3.12 environment, not the production API venv. Install the pinned dependencies:

    python -m pip install -r services/agentos/requirements-test.txt

On the authorized device, in PowerShell (replace the example path with your own EXISTING local API key file; do not print its content):

    $env:YANCE_W43_LOCAL_KEY_FILE = "C:\PATH\TO\EXISTING\LOCAL\profile_api_key.txt"
    Remove-Item Env:OPENAI_API_KEY,Env:OLLAMA_API_KEY -ErrorAction SilentlyContinue
    python -m pytest -q -m "not local_model" --basetemp=C:\PRIVATE\WRITABLE_TMP services/agentos/tests/test_w43_native.py
    python -m pytest -q -m local_model --basetemp=C:\PRIVATE\WRITABLE_TMP_MODEL services/agentos/tests/test_w43_native.py

**2026-10-25 evidence on DESKTOP-029FH47:** 22/22 offline native contract tests PASS; 3/3 real Agno → llama.cpp Qwen model tests PASS. Native Agent.run, persisted SDK SqliteDb sessions, native Team.run and SQLite Trace were executed, not replaced by M0 mock ports. No real platform account or provider send was connected. pip check reports no dependency conflicts.

## Native W43 / W45 contract

- Scope(tenant,account,space,channel,peer_id,binding_revision) is SYNTHETIC_TEST_ONLY and fixture-only. CONTACT requires all canonical K dimensions; PRIVATE refuses contact fields.
- scoped_user_id and session_id(thread) are namespaced SHA-256 digests of full K + space. Different account, peer, epoch or PRIVATE space cannot share the derived SDK user/session IDs.
- NativeAgnoRuntime uses actual agno.agent.Agent, agno.team.Team, agno.db.sqlite.SqliteDb and agno.os.AgentOS, with no custom agent scheduler.
- run(scope, "fake-...", thread, team=False) calls real SDK .run(), returns sdk_pin, run_id, session_id, original_response, model_id and provenance. Only RunStatus.COMPLETED is marked successful; SDK RunStatus.ERROR returns an explicit failure without leaking the upstream error content. A Run ID/trace does NOT prove inference success.
- suggestions is always [] in W43. W45 alone converts real Run results with original-text/translation provenance into 0–3 real draft suggestions. W43 never creates template-filled fake candidates.
- remember_synthetic / read_synthetic_memories use Agno's actual SqliteDb user memory functions and validate fixture scope; automatic LLM-driven memory updates are disabled. Persist/restart/isolation tests pass.
- read_trace_receipts retrieves actual Agno/OpenTelemetry traces from the local DB. Real trace persistence was tested in a dedicated process, since OpenTelemetry tracer providers have process-global initialization.
- get_unserved_app gives the official AgentOS FastAPI app for in-process inspection. **Never bind the app to a network socket**: W24 authenticated identity, JWT scopes and consent epoch checks do not exist here.
- @tool and @approval hooks are official Agno SDK objects, but direct model tool invocation, paused approval/restart and human authorization have NOT been independently proven; truthful HOLD applies.
- Control Plane remains NOT_CONNECTED; no external service is required for this local SDK test.

## Remaining blockers and non-W43 owners

- W24 — canonical identity, actual consent and revocation epoch, signed effective account binding.
- W44 — actual durable grant and budget/custody eligibility.
- W45 — real translation/provenance, output of genuinely generated 0–3 suggestions.
- W46 — actual sole Composer integration and real draft actions.
- W25 — unique MessageDelivery and synthetic Outbox ACK/UNKNOWN. W43 exposes no sender, no delivery state, no connector credentials.
- W09 — replace PR #3 synthetic M0 mock Port with this native interface only when W24/W45 actual contracts are present. M0 PASS does not imply complete M1 business chain.
- Before any deployment or hosted AgentOS access: enforce authenticated full-K identity scope at the gateway, permission and approval replay fences and independently review provider licensing/security.

**Owner identity used for this source:** verified linked GitHub login wangyi198675-coder, per-branch Git author configured within this independent worktree only. This is the current operator's ACK, not a separate human security or legal sign-off.
