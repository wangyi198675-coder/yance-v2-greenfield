"""W43 PR #36 incremental real Qwen3:8b + official Agno SDK synthetic verification.

Uses the EXISTING llama.cpp executable / ALREADY DOWNLOADED local Qwen3 weights,
if operator runs that model on the explicitly isolated loopback port 11606.
No account login, cloud billing, real send, production deployment, or new agent service.
A listening/model-discovery success is NOT a valid SDK Run or human quality certification.
"""
from __future__ import annotations

import json
import os
import re
import sys
import tempfile
import time
from pathlib import Path

os.environ["AGNO_TELEMETRY"] = "false"
os.environ.pop("OPENAI_API_KEY", None)
os.environ.pop("OLLAMA_API_KEY", None)

from yance_agentos import NativeAgnoRuntime, Scope

MODEL = "qwen3:8b"
URL = "http://127.0.0.1:11605"
PROVIDER = "LLAMACPP_LOCAL_QWEN3_8B_FREE"


def scope(peer: str) -> Scope:
    return Scope("SYNTHETIC_TEST_ONLY", "fixture-account-1", "CONTACT",
                 "FB_PERSONAL", "fake-" + peer, 1)


def preflight() -> dict | None:
    key_file = os.environ.get("YANCE_W43_LOCAL_KEY_FILE")
    if not key_file or not Path(key_file).is_file():
        return {"status": "HOLD_PROTECTED_LOCAL_KEY_UNAVAILABLE"}
    try:
        import httpx
        # Never send protected key to anything but the pinned local listener.
        key = Path(key_file).read_text(encoding="utf-8-sig").strip()
        with httpx.Client(trust_env=False, timeout=12) as client:
            rsp = client.get(URL + "/v1/models",
                             headers={"Authorization": "Bearer " + key})
        if rsp.status_code != 200:
            return {"status": "HOLD_QWEN3_LOCAL_SERVER_AUTH_OR_HEALTH", "http": rsp.status_code}
        names = {row.get("id") for row in rsp.json().get("data", [])}
        if MODEL not in names:
            return {"status": "HOLD_QWEN3_LOCAL_MODEL_NOT_LOADED"}
    except Exception as exc:
        return {"status": "HOLD_QWEN3_LOCAL_SERVER_UNREACHABLE", "error_type": type(exc).__name__}
    return None


def run_all() -> int:
    hold = preflight()
    if hold:
        print(json.dumps({**hold, "model": MODEL, "real_runs": 0}, ensure_ascii=False))
        return 2

    cases = [
        ("en", "fake-/no_think Translate into Simplified Chinese ONLY: Hello, how are you today?"),
        ("de", "fake-/no_think Translate into Simplified Chinese ONLY: Guten Morgen, wie geht es dir?"),
        ("pl", "fake-/no_think Translate into Simplified Chinese ONLY: Cześć, jak się masz?"),
        ("zh", "fake-/no_think Reply naturally in one short Chinese sentence to a fictional friend: 你好，今天工作忙吗？"),
    ]
    report = {
        "status": "RUNNING", "model": MODEL, "sdk": "agno==3.1.10",
        "provider": PROVIDER, "backend": URL, "purpose": "QUALITY_EVAL",
        "real_runs_attempted": 0, "cases": {}, "tool": {},
        "translation_accuracy_human_signed": False, "reply_quality_human_signed": False,
        "outbound": "DISABLED", "paid_model_calls": 0,
    }
    with tempfile.TemporaryDirectory(prefix="w43-qwen3-sdk-", ignore_cleanup_errors=True) as folder:
        runtime = NativeAgnoRuntime(
            Path(folder) / "w43-qwen3.sqlite", backend="qwen3_llamacpp",
            purpose="QUALITY_EVAL",
            local_key_file=os.environ["YANCE_W43_LOCAL_KEY_FILE"],
        )
        runtime.get_unserved_app()  # initialize native Agno Trace; NO HTTP SERVER
        for lang, prompt in cases:
            s = scope("lang-" + lang)
            started = time.perf_counter()
            receipt = runtime.run(s, prompt)
            report["real_runs_attempted"] += 1
            content = receipt.get("original_response", "")
            ok = bool(receipt.get("status") == "AGNO_RUN_COMPLETED" and
                      receipt.get("model_id") == MODEL and content and
                      re.search(r"[\u4e00-\u9fff]", content) and
                      runtime.attest_contact_run(s, prompt, receipt))
            report["cases"][lang] = {
                "status": receipt.get("status"),
                "sdk_run_id": receipt.get("run_id"),
                "session_id": receipt.get("session_id"),
                "model_source": receipt.get("provider"),
                "model_id": receipt.get("model_id"),
                "token_usage": receipt.get("token_usage"),
                "visible_text_preview": content[:150],
                "elapsed_seconds": round(time.perf_counter() - started, 2),
                "native_same_process_receipt_attested": runtime.attest_contact_run(s, prompt, receipt),
                "contains_chinese": bool(re.search(r"[\u4e00-\u9fff]", content)),
                "source_quality_gate": "LANGUAGE_SMOKE_NOT_HUMAN_RATED",
                "outbound": receipt.get("outbound"),
                "pass": ok,
            }
            print("REAL_SDK_CASE", lang, receipt.get("status"), receipt.get("run_id"), flush=True)

        s = scope("tool")
        p = "fake-/no_think You MUST call the synthetic_source_lookup tool once with topic fake-test. Then repeat its result."
        started = time.perf_counter()
        raw = runtime.agents["CONTACT"].run(p, user_id=s.scoped_user_id, session_id=s.session_id())
        report["real_runs_attempted"] += 1
        status = getattr(getattr(raw, "status", None), "value", "UNKNOWN")
        tool_rows = getattr(raw, "tools", None) or []
        tool_details = []
        for t in tool_rows:
            name = str(getattr(t, "tool_name", getattr(t, "name", "")))
            result = getattr(t, "result", None)
            tool_details.append({
                "name": name, "has_real_result": result is not None,
                "synthetic_source_returned": "SYNTHETIC_SOURCE_ONLY:fake-test" in str(result),
                "error": bool(getattr(t, "tool_call_error", False)),
            })
        report["tool"] = {
            "status": status, "sdk_run_id": getattr(raw, "run_id", None),
            "session_id": getattr(raw, "session_id", None),
            "model": MODEL, "provider": PROVIDER,
            "tool_details": tool_details,
            "elapsed_seconds": round(time.perf_counter() - started, 2),
            "pass": status.upper() == "COMPLETED" and any(
                x["name"] == "synthetic_source_lookup" and
                x["synthetic_source_returned"] and not x["error"]
                for x in tool_details
            ),
        }
        print("REAL_SDK_TOOL", status, report["tool"]["sdk_run_id"], flush=True)

        s = scope("w45")
        started = time.perf_counter()
        envelope = runtime.run_for_w45(
            s, "fake-mid-w45-qwen3", "fake-Guten Morgen, wie geht es dir?",
            "fake-translation-req-1",
            "fake-/no_think Answer in one short German sentence to this fictional greeting: Guten Morgen",
        )
        report["real_runs_attempted"] += 1
        report["w45_native_envelope"] = {
            "status": envelope.get("status"), "engine": envelope.get("engine"),
            "run_id": envelope.get("runId"), "session_id": envelope.get("sessionId"),
            "agent_id": envelope.get("agentId"), "source_mid": envelope.get("sourceMid"),
            "original_sha256": envelope.get("originalSha256"),
            "translation_request_id": envelope.get("translationRequestId"),
            "model_provider": envelope.get("modelProvider"),
            "model_id": envelope.get("modelId"),
            "candidates": envelope.get("candidates", []),
            "same_process_attested": runtime.attest_w45_same_runtime(envelope),
            "elapsed_seconds": round(time.perf_counter()-started,2),
            "pass": envelope.get("status") == "COMPLETED" and runtime.attest_w45_same_runtime(envelope),
        }
    # A naturalness or fidelity claim always needs independent W45/human review.
    report["status"] = "SDK_SMOKE_PASS_HUMAN_QUALITY_HOLD" if (
        all(x["pass"] for x in report["cases"].values()) and
        report["tool"]["pass"] and report["w45_native_envelope"]["pass"]
    ) else "SDK_SMOKE_PARTIAL_FAIL"
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)
    return 0 if report["status"].startswith("SDK_SMOKE_PASS") else 1


if __name__ == "__main__":
    sys.exit(run_all())
