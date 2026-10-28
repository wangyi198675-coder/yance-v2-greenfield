"""W45 LAB ONLY: real W43 official Agno Qwen3 8B llama.cpp translation + reply.
This CLI is not an HTTP listener, W24 grant, cross-process authenticated attestor
or production translation service. Receipts are proof only inside this local
operator-controlled synthetic subprocess, never from an arbitrary JSON client.
"""
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

# No cloud fallback. This script never starts/stops or reconfigures llama.cpp.
os.environ["AGNO_TELEMETRY"] = "false"
os.environ.pop("OPENAI_API_KEY", None)
os.environ.pop("OLLAMA_API_KEY", None)
PIN = "d0987e9c64b937c923b3d32bda7bd05f86a638ba"
PROVIDER = "LLAMACPP_LOCAL_QWEN3_8B_FREE"
MODEL = "qwen3:8b"
LANG = {"zh-CN": "Chinese", "en": "English", "de": "German", "pl": "Polish"}

def sha(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

def emit(data):
    print("W45_LAB_RESULT_JSON:" + json.dumps(data, ensure_ascii=False), flush=True)

def failed(code, extra=None):
    emit({"status": code, "candidates": [], "translation": None,
          "delivery": "NOT_REQUESTED", **(extra or {})})
    return 2

def input_text(text, cap=200):
    return isinstance(text, str) and bool(text) and len(text) <= cap and all(
        ord(x) >= 32 and x != "|" for x in text)

def main():
    source = Path(os.environ.get("YANCE_W43_SOURCE", ""))
    if source.name != "agentos" or not source.is_dir():
        return failed("W43_PINNED_SOURCE_REQUIRED")
    try:
        actual_sha = subprocess.check_output(
            ["git", "-C", str(source), "rev-parse", "HEAD"],
            text=True, stderr=subprocess.DEVNULL, timeout=5).strip()
    except Exception:
        return failed("W43_GIT_SHA_UNAVAILABLE")
    if actual_sha != PIN:
        return failed("W43_SOURCE_SHA_MISMATCH", {"observed_source_sha": actual_sha})
    key_file = Path(os.environ.get("YANCE_W43_LOCAL_KEY_FILE") or "")
    if not key_file.is_file():
        return failed("W43_PROTECTED_LOCAL_KEY_FILE_MISSING")
    try:
        v = json.loads(sys.stdin.read(16384))
        k = v["identity"]
        mid = v["mid"]
        text = v["original"]
        src = v["sourceLanguage"]
        reply_lang = v["replyLanguage"]
        target = v["translationTarget"]
        assert k["tenant"] == "SYNTHETIC_TEST_ONLY"
        assert input_text(k["account"]) and k["account"].startswith("fixture-")
        assert input_text(k["peer_id"]) and k["peer_id"].startswith("fake-")
        assert k["channel"] in ("FB_PERSONAL", "FB_PAGE", "WHATSAPP_PERSONAL", "TELEGRAM_PERSONAL")
        assert str(k["binding_revision"]).isdigit() and int(k["binding_revision"]) >= 1
        assert mid.startswith("fake-") and input_text(mid)
        assert input_text(text, 160)
        assert src in LANG and target in LANG and reply_lang in LANG
        assert src != target
    except (KeyError, AssertionError, TypeError, ValueError, AttributeError):
        return failed("ONLY_SHORT_SYNTHETIC_CONTEXT")
    trans_prompt = (
        "fake-/no_think Translate this fictional " + LANG[src] + " message into " +
        LANG[target] + ". Return ONLY the translation: " + text
    )
    if not input_text(trans_prompt):
        return failed("W43_TRANSLATION_PROMPT_TOO_LONG")
    sys.path.insert(0, str(source))
    try:
        from yance_agentos import NativeAgnoRuntime, Scope
        scope = Scope(k["tenant"], k["account"], "CONTACT", k["channel"],
                      k["peer_id"], int(k["binding_revision"]))
        with tempfile.TemporaryDirectory(prefix="w45-llamacpp-agno-", ignore_cleanup_errors=True) as folder:
            native = NativeAgnoRuntime(Path(folder) / "db.sqlite",
                backend="qwen3_llamacpp", purpose="QUALITY_EVAL",
                local_key_file=key_file)
            # W43 itself owns model, source, policy and native attestation.
            trans = native.run(scope, trans_prompt, thread="translation")
            trans_auth = native.attest_contact_run(scope, trans_prompt, trans, thread="translation")
            translation = trans.get("original_response", "").strip()
            trans_ok = (trans_auth and trans.get("status") == "AGNO_RUN_COMPLETED"
                and trans.get("provider") == PROVIDER and trans.get("model_id") == MODEL
                and trans.get("purpose") == "QUALITY_EVAL" and bool(translation)
                and trans.get("outbound") == "DISABLED")
            if not trans_ok:
                return failed("REAL_W43_TRANSLATION_FAILED", {"w43_sha": PIN,
                    "translation_run_id": trans.get("run_id"),
                    "translation_sdk_status": trans.get("status"),
                    "translation_same_runtime_attested": bool(trans_auth)})
            req_id = "fake-translation-" + trans["run_id"]
            # Match W45's actual w43ReplyPrompt byte-for-byte; fail rather than
            # silently truncate the source/translation or fabricate suggestions.
            reply_prompt = (
                "fake-/no_think As a fictional friend, reply in " + LANG[reply_lang] +
                ' only. Never echo or translate. ONLY JSON {"suggestions":[{"text":"...","sources":["ORIGINAL"]}]}. Message:' +
                text
            )
            if not input_text(reply_prompt):
                emit({"status": "W43_REPLY_PROMPT_200_CHAR_CAP",
                    "w43_sha": PIN, "candidates": [],
                    "translation": {"text": translation, "sourceLanguage": src,
                        "targetLanguage": target, "sdkRunId": trans["run_id"],
                        "provider": PROVIDER, "modelId": MODEL,
                        "requestId": req_id, "same_runtime_attested": True},
                    "delivery": "NOT_REQUESTED"})
                return 2
            receipt = native.run(scope, reply_prompt, thread="default")
            reply_auth = native.attest_contact_run(scope, reply_prompt, receipt, thread="default")
            result_ok = (reply_auth and receipt.get("status") == "AGNO_RUN_COMPLETED"
                and receipt.get("provider") == PROVIDER and receipt.get("model_id") == MODEL
                and receipt.get("purpose") == "QUALITY_EVAL" and
                receipt.get("outbound") == "DISABLED")
            emit({"status": "REAL_NATIVE_TWO_RUNS_UNREVIEWED" if result_ok else "REAL_REPLY_RUN_FAILED",
                "w43_sha": PIN,
                "identity": {**k, "binding_revision": str(k["binding_revision"])},
                "source_mid": mid, "original": text, "original_sha256": sha(text),
                "reply_language": reply_lang, "reply_prompt": reply_prompt,
                "reply_prompt_sha256": sha(reply_prompt),
                "translation": {"text": translation, "sourceLanguage": src,
                    "targetLanguage": target, "sdkRunId": trans["run_id"],
                    "sessionId": trans.get("session_id"), "provider": PROVIDER, "modelId": MODEL, "requestId": req_id,
                    "same_runtime_attested": bool(trans_auth),
                    "raw_sdk_status": trans["status"], "token_usage": trans.get("token_usage")},
                "receipt": receipt if result_ok else None,
                "native_same_process_attested": bool(reply_auth),
                "native_run_success": bool(result_ok),
                "model_quality_pass": False,
                "candidates": [], "delivery": "NOT_REQUESTED"})
            return 0 if result_ok else 2
    except Exception as exc:
        return failed("W43_SDK_RUNTIME_EXCEPTION", {"error_type": type(exc).__name__})

if __name__ == "__main__":
    sys.exit(main())
