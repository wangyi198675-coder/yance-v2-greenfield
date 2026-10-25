"""W43 Qwen3 8B-only synthetic model capability/quality smoke.

No paid model, token, browser, channel adapter or actual person is used.
Returns 2 (HOLD) while model missing; never substitutes Qwen2.5.
This script measures engineering smoke, NOT comprehensive translation quality.
"""
import json
import os
import re
import sys
import tempfile
from pathlib import Path

os.environ["AGNO_TELEMETRY"] = "false"
os.environ.pop("OPENAI_API_KEY", None)
os.environ.pop("OLLAMA_API_KEY", None)

from yance_agentos import NativeAgnoRuntime, Scope

MODEL = "qwen3:8b"
HOST = "http://127.0.0.1:11434"


def status_report():
    try:
        import ollama
        client = ollama.Client(host=HOST, timeout=12)
        names = {x.model for x in client.list().models}
    except Exception as exc:
        return {"status": "HOLD_MODEL_SERVER_NOT_REACHABLE", "error_type": type(exc).__name__,
                "model": MODEL, "quality_scored": False, "inference_tests_run": 0}
    if MODEL not in names:
        return {"status": "HOLD_MODEL_NOT_INSTALLED", "model": MODEL, "installed_models_checked": True,
                "quality_scored": False, "inference_tests_run": 0}
    return None


def test_model():
    hold = status_report()
    if hold:
        print(json.dumps(hold, ensure_ascii=False))
        return 2

    cases = [
        ("en", "fake-Translate this fictional English text into Simplified Chinese, Chinese translation only: Hello, how are you today?"),
        ("de", "fake-Translate this fictional German text into Simplified Chinese, Chinese translation only: Guten Morgen, wie geht es dir?"),
        ("pl", "fake-Translate this fictional Polish text into Simplified Chinese, Chinese translation only: Cześć, jak się masz?"),
        ("zh", "fake-For this fictional Chinese message, write a one-sentence polite Chinese draft, no sending: 你好，今天工作忙吗？"),
    ]
    with tempfile.TemporaryDirectory(prefix="w43-qwen3-bench-") as folder:
        runtime = NativeAgnoRuntime(Path(folder) / "quality.db")
        results = []
        for i, (language, prompt) in enumerate(cases):
            scope = Scope("SYNTHETIC_TEST_ONLY", "fixture-account-1", "CONTACT",
                          "FB_PERSONAL", f"fake-quality-peer-{i}", 1)
            receipt = runtime.run(scope, prompt)
            success = receipt.get("status") == "AGNO_RUN_COMPLETED"
            text = receipt.get("original_response", "") if success else ""
            chinese = bool(re.search(r"[\u4e00-\u9fff]", text))
            results.append({
                "test": f"{language}_to_chinese_smoke",
                "sdk_run_status": receipt.get("status"),
                "valid_native_run_id": bool(receipt.get("run_id")),
                "chinese_text_present": chinese,
                "model": MODEL,
                "human_translation_accuracy_review": "NOT_PERFORMED",
                "pass": bool(success and chinese),
                "draft_only": receipt.get("outbound") == "DISABLED",
            })
        scope = Scope("SYNTHETIC_TEST_ONLY", "fixture-account-1", "CONTACT",
                      "FB_PERSONAL", "fake-tool-peer", 1)
        # This tool run is an actual Agno model call; inspect native SDK tool receipts.
        raw = runtime.agents["CONTACT"].run(
            "fake-Please call the synthetic_source_lookup tool with topic fake-test, then repeat its result.",
            user_id=scope.scoped_user_id, session_id=scope.session_id(),
        )
        status = getattr(getattr(raw, "status", None), "value", "UNKNOWN")
        tools = getattr(raw, "tools", None) or []
        tool_result = {
            "sdk_run_status": status,
            "native_tool_calls_reported": len(tools),
            "selection_executed_proven": bool(tools),
            "no_real_side_effects": True,
            "pass": status.upper() == "COMPLETED" and bool(tools),
        }
        report = {
            "status": "SMOKE_PASS" if all(x["pass"] for x in results) and tool_result["pass"] else "QUALITY_CAPABILITY_INCOMPLETE",
            "model": MODEL, "provider": "LOCAL_OLLAMA_ONLY", "sdk": "Agno 3.1.10",
            "inference_tests_run": len(results)+1,
            "results": results, "tool": tool_result,
            "translation_semantic_accuracy": "NOT_HUMAN_RATED",
            "candidate_style_quality": "W45_NOT_ASSESSED",
            "live_outbound": "DISABLED",
        }
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if report["status"] == "SMOKE_PASS" else 1


if __name__ == "__main__":
    sys.exit(test_model())
