"""Actual dual-session Agno proof on the EXISTING llama.cpp 11605 service.

Invokes the one official NativeAgnoRuntime API twice, with two independent
SDK Agent instances and databases. Does not start or modify any model.
"""
from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import time

os.environ["AGNO_TELEMETRY"] = "false"
os.environ.pop("OPENAI_API_KEY", None)
os.environ.pop("OLLAMA_API_KEY", None)

from yance_agentos import NativeAgnoRuntime, Scope

def execute(i, path: Path, barrier: threading.Barrier):
    scope = Scope("SYNTHETIC_TEST_ONLY", "fixture-account-1", "CONTACT",
                  "FB_PERSONAL", "fake-w43-unified-peer-" + str(i), 1)
    runtime = NativeAgnoRuntime(
        path / ("contact-" + str(i) + ".sqlite"),
        purpose="QUALITY_EVAL",
    )
    barrier.wait(timeout=8)
    started = time.monotonic()
    receipt = runtime.run(scope, "fake-/no_think Reply exactly 'Hello'.")
    elapsed = time.monotonic() - started
    return {
        "status": receipt.get("status"),
        "sdk_run_id": receipt.get("run_id"),
        "sdk_session_id": receipt.get("session_id"),
        "session_id_matches_scope": receipt.get("session_id") == scope.session_id(),
        "model_provider": receipt.get("provider"),
        "model_id": receipt.get("model_id"),
        "purpose": receipt.get("purpose"),
        "quality_qualified": receipt.get("quality_qualified"),
        "token_usage": receipt.get("token_usage"),
        "nonempty_original_response": bool(receipt.get("original_response")),
        "same_runtime_attested": runtime.attest_contact_run(
            scope, "fake-/no_think Reply exactly 'Hello'.", receipt
        ),
        "elapsed_sec": round(elapsed, 2),
        "suggestions_count": len(receipt.get("suggestions", [])),
        "outbound": receipt.get("outbound"),
        "error_type": receipt.get("error_type"),
        "sdk_run_status": receipt.get("sdk_run_status"),
    }

def main():
    if not os.getenv("YANCE_W43_LOCAL_KEY_FILE"):
        print('{"status":"HOLD_LOCAL_KEY_PATH_NOT_AVAILABLE"}')
        return 2
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="w43-unified-qwen3-", ignore_cleanup_errors=True) as tmp:
        path = Path(tmp)
        with ThreadPoolExecutor(max_workers=2) as pool:
            barrier = threading.Barrier(2)
            jobs = [pool.submit(execute, i, path, barrier) for i in (1, 2)]
            results = [job.result() for job in jobs]
    valid = all(
        x["status"] == "AGNO_RUN_COMPLETED"
        and x["sdk_run_id"] and x["model_id"] == "qwen3:8b"
        and x["model_provider"] == "LLAMACPP_LOCAL_QWEN3_8B_FREE"
        and x["session_id_matches_scope"]
        and x["same_runtime_attested"]
        and x["nonempty_original_response"]
        and x["quality_qualified"] is False
        and x["suggestions_count"] == 0
        and x["outbound"] == "DISABLED"
        for x in results
    )
    valid = valid and len({x["sdk_session_id"] for x in results}) == 2
    report = {
        "status": "TWO_AGNO_SESSIONS_SERIALIZED_PASS_NOT_LOAD_QUALIFICATION"
                  if valid else "HOLD_TWO_AGNO_SESSIONS_INCOMPLETE",
        "official_agno_sdk": "3.1.10",
        "model": "qwen3:8b",
        "model_server": "EXISTING_LLAMACPP_LOOPBACK_11605",
        "capacity": "W43_COOPERATING_REQUESTS_SINGLE_SLOT_BOUNDED_90S",
        "started_in_parallel": True,
        "wall_elapsed_sec": round(time.monotonic() - started, 2),
        "results": results,
        "external_gui_workload_is_not_controlled": True,
        "independent_language_quality_approved": False,
        "real_outbound": "DISABLED",
        "paid_api_calls": 0,
    }
    print("W43_UNIFIED_2SESSION_JSON", json.dumps(report, ensure_ascii=True), flush=True)
    return 0 if valid else 1

if __name__ == "__main__":
    sys.exit(main())
