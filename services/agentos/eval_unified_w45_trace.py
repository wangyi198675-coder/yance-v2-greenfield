"""W43 actual Qwen3 8B W45 contract + Trace proof (synthetic only)."""
import json
import os
import sys
import tempfile
import time
from pathlib import Path

os.environ["AGNO_TELEMETRY"] = "false"
os.environ.pop("OPENAI_API_KEY", None)
os.environ.pop("OLLAMA_API_KEY", None)

from yance_agentos import NativeAgnoRuntime, Scope

def main():
    if not os.getenv("YANCE_W43_LOCAL_KEY_FILE"):
        print('{"status":"HOLD_PROTECTED_LOCAL_KEY_PATH_NOT_CONFIGURED"}')
        return 2
    with tempfile.TemporaryDirectory(prefix="w43-unified-w45-", ignore_cleanup_errors=True) as d:
        runtime = NativeAgnoRuntime(Path(d) / "w45-trace.sqlite", purpose="QUALITY_EVAL")
        runtime.get_unserved_app()  # Sets up native Agno Trace without serving HTTP
        scope = Scope("SYNTHETIC_TEST_ONLY", "fixture-account-1",
                      "CONTACT", "FB_PERSONAL", "fake-w45-unified", 1)
        started = time.monotonic()
        receipt = runtime.run_for_w45(
            scope, "fake-mid-unified-01", "fake-Guten Morgen, wie geht es dir?",
            "fake-translation-request-01",
            "fake-/no_think Reply with one short German greeting only.",
        )
        elapsed = time.monotonic() - started
        run_id = receipt.get("runId")
        trace = runtime.read_trace_receipts(scope, run_id) if isinstance(run_id, str) else {"status":"NO_RUN"}
        valid = (
            receipt.get("status") == "COMPLETED"
            and receipt.get("modelProvider") == "LLAMACPP_LOCAL_QWEN3_8B_FREE"
            and receipt.get("modelId") == "qwen3:8b"
            and receipt.get("purpose") == "QUALITY_EVAL"
            and receipt.get("candidates") == []
            and runtime.attest_w45_same_runtime(receipt)
            and receipt.get("provenance",{}).get("quality_qualified") is False
            and trace.get("status") == "NATIVE_TRACE_FOUND"
        )
        print("W43_W45_REAL_SDK_JSON", json.dumps({
            "status": "REAL_RUN_TRACE_AND_W45_CONTRACT_PASS" if valid else "HOLD_REAL_W45_OR_TRACE_INCOMPLETE",
            "actual_run_id": run_id,
            "actual_session_id": receipt.get("sessionId"),
            "agent_id": receipt.get("agentId"),
            "model_provider": receipt.get("modelProvider"),
            "model_id": receipt.get("modelId"),
            "original_sha256": receipt.get("originalSha256"),
            "source_mid": receipt.get("sourceMid"),
            "translation_request_id": receipt.get("translationRequestId"),
            "full_scope": receipt.get("identity"),
            "trace": trace,
            "same_runtime_attested": runtime.attest_w45_same_runtime(receipt),
            "quality_qualified": receipt.get("provenance",{}).get("quality_qualified"),
            "candidate_count": len(receipt.get("candidates", [])),
            "elapsed_seconds": round(elapsed, 2),
            "outbound": "DISABLED",
            "paid_model_calls": 0,
            "cross_process_w24_authorized": False,
        }, ensure_ascii=True), flush=True)
    return 0 if valid else 1

if __name__ == "__main__":
    sys.exit(main())
