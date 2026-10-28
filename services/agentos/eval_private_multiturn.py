"""W43 official Agno PRIVATE two-turn and cold-restart QA, not a second Brain.

Only scripted nonprivate/synthetic operator questions are used here.
W47 production native-pairing and user principal remain separate HOLD.
Writes the SAME native Agno SqliteDb once; checks full native history in a
NEW Python process. Never starts/changes a server or sends messages.
"""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid

os.environ["AGNO_TELEMETRY"] = "false"
os.environ.pop("OPENAI_API_KEY", None)
os.environ.pop("OLLAMA_API_KEY", None)
from yance_agentos import NativeAgnoRuntime, Scope

QUESTIONS = [
    "请用中文简短回答：我想给朋友写一句自然的早安问候，你建议什么？",
    "继续刚才的话题，如果想让语气更成熟一点，应该怎样改？",
]
THREAD = "personal"
SCOPE = Scope("SYNTHETIC_TEST_ONLY", "fixture-private-local-A", "PRIVATE")
OTHER = Scope("SYNTHETIC_TEST_ONLY", "fixture-private-local-B", "PRIVATE")


def report(value):
    print("W43_PRIVATE_NATIVE_EVIDENCE", json.dumps(value, ensure_ascii=False), flush=True)


def preflight():
    key_path = os.environ.get("YANCE_W43_LOCAL_KEY_FILE")
    if not key_path or not Path(key_path).is_file():
        return "HOLD_PROTECTED_KEY_PATH_MISSING"
    try:
        import httpx
        key = Path(key_path).read_text(encoding="utf-8-sig").strip()
        with httpx.Client(timeout=5.0, trust_env=False) as client:
            response = client.get(
                "http://127.0.0.1:11605/v1/models",
                headers={"Authorization": "Bearer " + key},
            )
        if response.status_code != 200:
            return "HOLD_LOCAL_MODEL_AUTH_OR_HTTP"
        if "qwen3:8b" not in {r.get("id") for r in response.json().get("data", [])}:
            return "HOLD_EXPECTED_QWEN3_8B_NOT_ACTIVE"
    except Exception:
        return "HOLD_EXISTING_LOCAL_MODEL_UNREACHABLE"
    return None


def write_turns(db_file: Path):
    block = preflight()
    if block:
        report({"status": block, "actual_model_turns": 0, "quality_qualified": False})
        return 2
    runtime = NativeAgnoRuntime(db_file, backend="llamacpp", purpose="QUALITY_EVAL")
    session_id = SCOPE.session_id(THREAD)
    run_proofs = []
    for i, user_text in enumerate(QUESTIONS):
        started = time.monotonic()
        # Call the ORIGINAL registered PRIVATE Agent; no second agent or service.
        response = runtime.agents["PRIVATE"].run(
            user_text, user_id=SCOPE.scoped_user_id, session_id=session_id,
        )
        status = getattr(getattr(response, "status", None), "value", "UNKNOWN")
        content = response.content if isinstance(response.content, str) else ""
        run_proofs.append({
            "turn": i + 1, "run_id": response.run_id,
            "session_id": response.session_id, "sdk_status": status,
            "user_text": user_text,
            "actual_model_answer": content if status == "COMPLETED" else None,
            "answer_from_model": status == "COMPLETED" and bool(content.strip()),
            "latency_s": round(time.monotonic() - started, 2),
        })
        print("W43_PRIVATE_ACTUAL_RUN", i + 1, status, response.run_id, flush=True)
        if status != "COMPLETED" or not content.strip():
            report({"status": "HOLD_ACTUAL_MODEL_ANSWER_MISSING",
                    "completed_valid_turns": sum(bool(r["answer_from_model"]) for r in run_proofs),
                    "runs": run_proofs, "quality_qualified": False})
            return 1
    report({"status": "TWO_ACTUAL_PRIVATE_MODEL_TURNS_COMPLETED_NOT_YET_RESTORED",
            "runs": run_proofs, "sdk": "Agno 3.1.10", "provider": "LLAMACPP_LOCAL_QWEN3_8B_FREE",
            "model_id": "qwen3:8b", "quality_qualified": False, "outbound": "DISABLED"})
    return 0


def cold_read(db_file: Path):
    fresh = NativeAgnoRuntime(db_file, backend="llamacpp", purpose="QUALITY_EVAL")
    own = fresh.read_private_chat_history(SCOPE, thread=THREAD)
    others = fresh.read_private_chat_history(OTHER, thread=THREAD)
    wrong_thread = fresh.read_private_chat_history(SCOPE, thread="other")
    message_texts = [m["content"] for m in own["messages"]]
    roles = [m["role"] for m in own["messages"]]
    success = (
        own["complete_turn_count"] >= 2
        and all(q in message_texts for q in QUESTIONS)
        and roles.count("assistant") >= 2
        and others["status"] == "HISTORY_NOT_FOUND"
        and wrong_thread["status"] == "HISTORY_NOT_FOUND"
    )
    report({
        "status": "PRIVATE_HISTORY_COLD_RESTART_PASS" if success else "HOLD_PRIVATE_HISTORY_INCOMPLETE",
        "session_id": own["session_id"],
        "run_count": own["run_count"],
        "complete_turn_count": own["complete_turn_count"],
        "roles": roles, "messages": own["messages"],
        "other_user_isolated": others["status"] == "HISTORY_NOT_FOUND",
        "other_thread_isolated": wrong_thread["status"] == "HISTORY_NOT_FOUND",
        "database_file_exists": db_file.exists(),
        "db_sha256": hashlib.sha256(db_file.read_bytes()).hexdigest(),
        "quality_qualified": False, "live_platform_accounts": 0, "outbound": "DISABLED",
    })
    return 0 if success else 1


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--write":
        return write_turns(Path(sys.argv[2]))
    if len(sys.argv) == 3 and sys.argv[1] == "--restore":
        return cold_read(Path(sys.argv[2]))
    if len(sys.argv) != 1:
        return 2
    block = preflight()
    if block:
        report({"status": block, "actual_model_turns": 0,
                "cold_restart_validated": False, "quality_qualified": False})
        return 2
    root = Path(os.environ["LOCALAPPDATA"]) / "YanceV2" / "W43" / "qa-private-history"
    root.mkdir(parents=True, exist_ok=True)
    db_file = root / ("synthetic-private-" + uuid.uuid4().hex + ".sqlite")
    cmd = [sys.executable, str(Path(__file__).resolve())]
    created = subprocess.run(cmd + ["--write", str(db_file)], check=False)
    if created.returncode:
        return created.returncode
    restored = subprocess.run(cmd + ["--restore", str(db_file)], check=False)
    return restored.returncode


if __name__ == "__main__":
    sys.exit(main())
