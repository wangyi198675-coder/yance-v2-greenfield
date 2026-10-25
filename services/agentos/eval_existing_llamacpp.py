"""Actual Agno 3.1.10 + already-running authenticated llama.cpp, synthetic only.
Never starts a model server, never uses Ollama or paid models, never sends messages.
No API key, full model output or private data is serialized to evidence.
"""
from __future__ import annotations
import importlib.metadata
import json
import os
import sys
import tempfile
import time
from pathlib import Path

os.environ["AGNO_TELEMETRY"] = "false"
os.environ.pop("OPENAI_API_KEY", None)
os.environ.pop("OLLAMA_API_KEY", None)

from yance_agentos import NativeAgnoRuntime, Scope, _local_llamacpp_model

def scope(peer):
    return Scope("SYNTHETIC_TEST_ONLY", "fixture-account-1", "CONTACT",
                 "FB_PERSONAL", "fake-" + peer, 1)

def safe_run(runtime, s, prompt, *, team=False):
    start = time.perf_counter()
    out = runtime.run(s, "fake-" + prompt, team=team)
    text = out.get("original_response", "")
    return {
        "status": out.get("status"), "sdk_run_id": out.get("run_id"),
        "session_id": out.get("session_id"), "provider": out.get("provider"),
        "model_id": out.get("model_id"),
        "elapsed_sec": round(time.perf_counter() - start, 3),
        "response_chars": len(text), "response_preview": text[:110],
        "outbound": out.get("outbound"),
        "quality_qualified": out.get("quality_qualified", False),
        "token_usage": out.get("token_usage"),
    }

def run_all():
    report = {
        "sdk": importlib.metadata.version("agno"),
        "model_backend": "EXISTING_LLAMACPP_127.0.0.1_11605",
        "model_id": "qwen2.5:1.5b",
        "no_paid_provider": True,
        "not_a_quality_certification": True,
        "cases": {},
    }
    import httpx
    key_file = os.environ.get("YANCE_W43_LOCAL_KEY_FILE")
    if not key_file or not Path(key_file).is_file():
        report["status"] = "HOLD_PROTECTED_KEY_FILE_NOT_CONFIGURED"
        print(json.dumps(report, ensure_ascii=True)); return 2
    # The bearer token stays in process memory. Never put it in artifacts.
    with httpx.Client(timeout=8, trust_env=False) as client:
        unauth = client.get("http://127.0.0.1:11605/v1/models")
        key = Path(key_file).read_text(encoding="utf-8-sig").strip()
        authorized = client.get("http://127.0.0.1:11605/v1/models",
            headers={"Authorization": "Bearer " + key})
        report["api"] = {
            "anonymous_http_status": unauth.status_code,
            "authorized_http_status": authorized.status_code,
            "model_advertised": authorized.status_code == 200 and
                any(row.get("id") == "qwen2.5:1.5b" for row in authorized.json().get("data", [])),
        }
        del key
    if report["api"] != {"anonymous_http_status": 401, "authorized_http_status": 200, "model_advertised": True}:
        report["status"] = "HOLD_MODEL_AUTH_OR_ID"
        print(json.dumps(report, ensure_ascii=True)); return 2
    with tempfile.TemporaryDirectory(prefix="w43-llamacpp-agno-", ignore_cleanup_errors=True) as directory:
        dbpath = Path(directory) / "agno.sqlite"
        runtime = NativeAgnoRuntime(dbpath)
        runtime.get_unserved_app()  # native AgentOS/OTel; NOT network served
        langs = {
            "zh": "请用一句简短中文向虚构的朋友问好。",
            "en": "Say one short English greeting to a fictional friend.",
            "de": "Antworte einem fiktiven Freund mit einem kurzen deutschen Gruß.",
            "pl": "Napisz krótkie powitanie po polsku do fikcyjnego znajomego.",
        }
        for lang, prompt in langs.items():
            s = scope("lang-" + lang)
            report["cases"]["language_" + lang] = safe_run(runtime, s, prompt)
            print("CASE_FINISHED", lang, report["cases"]["language_" + lang]["status"], flush=True)
        a = scope("session-a")
        report["cases"]["session_first"] = safe_run(runtime, a, "Remember the fictional label BLUE-ZEBRA.")
        restarted = NativeAgnoRuntime(dbpath)
        report["cases"]["session_restart"] = safe_run(restarted, a, "What was the fictional label?")
        report["cases"]["session_isolation"] = (
            report["cases"]["session_first"]["session_id"] ==
            report["cases"]["session_restart"]["session_id"] and
            a.session_id() != scope("session-b").session_id())
        restarted.remember_synthetic(a, "fake-owner-note-only")
        report["cases"]["native_memory_persisted"] = (
            "fake-owner-note-only" in NativeAgnoRuntime(dbpath).read_synthetic_memories(a) and
            not NativeAgnoRuntime(dbpath).read_synthetic_memories(scope("session-b")))
        first_run = report["cases"]["language_en"].get("sdk_run_id")
        try:
            report["cases"]["native_trace"] = runtime.read_trace_receipts(scope("lang-en"), first_run)
        except Exception as exc:
            report["cases"]["native_trace"] = {"status": "TRACE_QUERY_FAILED", "error_type": type(exc).__name__}
        report["cases"]["team"] = safe_run(runtime, scope("team"), "Say a short greeting.", team=True)
        s = scope("tool")
        started = time.perf_counter()
        try:
            raw = runtime.agents["CONTACT"].run(
                "fake-Call synthetic_source_lookup with topic fake-test exactly once.",
                user_id=s.scoped_user_id, session_id=s.session_id())
            calls = getattr(raw, "tools", None) or []
            report["cases"]["tool"] = {
                "elapsed_sec": round(time.perf_counter()-started, 3),
                "status": str(getattr(getattr(raw, "status", None), "value", "UNKNOWN")),
                "run_id": getattr(raw, "run_id", None),
                "reported_native_tool_count": len(calls),
                "tool_names": [str(getattr(t, "tool_name", getattr(t, "name", "UNKNOWN"))) for t in calls],
                "real_model_selected_tool_proven": len(calls) > 0,
            }
        except Exception as exc:
            report["cases"]["tool"] = {"status": "FAILED", "error_type": type(exc).__name__}
        # Actual native structured-output option (not a simulated JSON parse).
        from agno.agent import Agent
        from pydantic import BaseModel
        class TinyRecord(BaseModel):
            label: str
            ok: bool
        started = time.perf_counter()
        try:
            structured = Agent(model=runtime.model, output_schema=TinyRecord,
                               instructions="Only fake records.", telemetry=False)
            raw = structured.run('Return JSON object with label="fake-test" and ok=true.')
            value = raw.content
            report["cases"]["structured"] = {
                "elapsed_sec": round(time.perf_counter()-started, 3),
                "status": str(getattr(getattr(raw, "status", None), "value", "UNKNOWN")),
                "run_id": getattr(raw, "run_id", None),
                "schema_valid": isinstance(value, TinyRecord) and value.label == "fake-test" and value.ok is True,
                "content_type": type(value).__name__,
            }
        except Exception as exc:
            report["cases"]["structured"] = {"status": "FAILED", "error_type": type(exc).__name__}
        # Native model-selected approval path is separate from ordinary Tool calling.
        # Never resume an approval or execute a real side effect.
        registered = bool(getattr(runtime.agents["CONTACT"].tools[1], "requires_confirmation", False))
        try:
            reviewer=scope("approval")
            proposed=runtime.agents["CONTACT"].run(
                "fake-Use review_synthetic_draft with draft_id fake-approval-001, do not approve it.",
                user_id=reviewer.scoped_user_id,session_id=reviewer.session_id())
            possible_calls=getattr(proposed,"tools",None) or []
            report["cases"]["approval"]={
                "requires_confirmation_registered": registered,
                "native_sdk_status":str(getattr(getattr(proposed,"status",None),"value","UNKNOWN")),
                "run_id":getattr(proposed,"run_id",None),
                "tool_calls_reported":len(possible_calls),
                "human_approval_resume":"HOLD_NOT_EXERCISED",
                "no_external_action":True}
        except Exception as exc:
            report["cases"]["approval"]={"requires_confirmation_registered":registered,
                "sdk_status":"FAILED","error_type":type(exc).__name__,
                "human_approval_resume":"HOLD_NOT_EXERCISED"}
        # Explicit wrong credential, never use real key, and never record transport exception detail.
        invalid_file = Path(directory)/"synthetic-invalid-key"
        invalid_file.write_text("invalid-credential-for-negative-test-2026", encoding="utf-8")
        try:
            denied = NativeAgnoRuntime(Path(directory)/"denied.db",
                           backend="llamacpp", local_key_file=invalid_file)
            report["cases"]["bad_auth"] = safe_run(denied, scope("bad-auth"), "Short greeting.")
        except Exception as exc:
            report["cases"]["bad_auth"] = {"status": "DENIED", "error_type": type(exc).__name__}
        # SDK transport negative: unreachable loopback port, no alternative model process.
        try:
            from agno.models.openai import OpenAIChat
            unavailable = Agent(model=OpenAIChat(
                id="qwen2.5:1.5b", api_key="synthetic-test-only",
                base_url="http://127.0.0.1:11606/v1", timeout=0.5,
                max_retries=0), telemetry=False)
            start=time.perf_counter()
            failed=unavailable.run("fake-Synthetic transport negative test.")
            report["cases"]["unavailable"]={
                "sdk_status":str(getattr(getattr(failed,"status",None),"value","UNKNOWN")),
                "elapsed_sec":round(time.perf_counter()-start,3)}
        except Exception as exc:
            report["cases"]["unavailable"]={"sdk_status":"SDK_TRANSPORT_ERROR",
                "error_type":type(exc).__name__}
        # SDK explicit tiny timeout against the authorized ORIGINAL server (no server modification).
        try:
            fast_model=_local_llamacpp_model("http://127.0.0.1:11605",
                                             "qwen2.5:1.5b", key_file)
            fast_model.timeout=0.001
            timed=Agent(model=fast_model, telemetry=False)
            start=time.perf_counter()
            reply=timed.run("fake-Return a very short greeting.")
            report["cases"]["timeout"]={
                "sdk_status":str(getattr(getattr(reply,"status",None),"value","UNKNOWN")),
                "elapsed_sec":round(time.perf_counter()-start,3)}
        except Exception as exc:
            report["cases"]["timeout"]={"sdk_status":"SDK_TIMEOUT_OR_TRANSPORT_ERROR",
                "error_type":type(exc).__name__}
        # Two synthetic isolated Agent/DB sessions; llama.cpp parallel=1 may serialize.
        try:
            from concurrent.futures import ThreadPoolExecutor
            def concurrent_one(i):
                other=NativeAgnoRuntime(Path(directory)/("concurrent-"+str(i)+".db"))
                return safe_run(other,scope("concurrent-"+str(i)), "One short greeting.")
            started=time.perf_counter()
            with ThreadPoolExecutor(max_workers=2) as pool:
                concurrent_results=list(pool.map(concurrent_one,(1,2)))
            report["cases"]["concurrent_two"]={
                "wall_sec":round(time.perf_counter()-started,3),
                "statuses":[x["status"] for x in concurrent_results],
                "session_ids_distinct":len({x["session_id"] for x in concurrent_results})==2}
        except Exception as exc:
            report["cases"]["concurrent_two"]={"status":"FAILED","error_type":type(exc).__name__}
        report["cases"]["no_key_fail_closed"] = False
        try:
            _local_llamacpp_model("http://127.0.0.1:11605","qwen2.5:1.5b", None)
        except Exception:
            report["cases"]["no_key_fail_closed"] = True
        report["cases"]["agentos_inprocess"] = hasattr(runtime.get_unserved_app(), "routes")
        report["cases"]["outbound"] = "DISABLED"
    report["status"] = "RUN_EVIDENCE_CAPTURED_NOT_QUALITY_PASS"
    print("W43_EVIDENCE_JSON_BEGIN")
    print(json.dumps(report, ensure_ascii=True, indent=2))
    print("W43_EVIDENCE_JSON_END")
    return 0

if __name__ == "__main__":
    try:
        sys.exit(run_all())
    except Exception as exc:
        import traceback
        frames = traceback.extract_tb(exc.__traceback__)
        print(json.dumps({"status": "EVAL_FAILED", "error_type": type(exc).__name__,
              "last_source_frames": [{"file": Path(f.filename).name, "function": f.name, "line": f.lineno}
                                     for f in frames[-4:]]}, ensure_ascii=False))
        sys.exit(1)
