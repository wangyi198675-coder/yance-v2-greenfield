"""W45 SYNTHETIC-ONLY in-process W43 official Agno Qwen3 Run evidence.
Not an authenticated cross-service gateway. No network hosting, no external send.
"""
import contextlib
import hashlib
import io
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

os.environ["AGNO_TELEMETRY"] = "false"
os.environ.pop("OPENAI_API_KEY", None)
os.environ.pop("OLLAMA_API_KEY", None)

def reject(code):
    print("W45_EVAL_JSON:" + json.dumps({"status":code,"candidates":[]},ensure_ascii=True), flush=True)
    raise SystemExit(2)

def main():
    src = Path(os.environ.get("YANCE_W43_SOURCE", ""))
    expected = os.environ.get("YANCE_W43_SHA", "")
    if not expected or not src.is_dir() or src.name != "agentos":
        reject("W43_PIN_REQUIRED")
    try:
        observed = subprocess.check_output(
            ["git", "-C", str(src), "rev-parse", "HEAD"], text=True, timeout=5
        ).strip()
    except Exception:
        reject("W43_SOURCE_UNVERIFIED")
    if observed != expected:
        reject("W43_SHA_CHANGED")
    try:
        data = json.loads(sys.stdin.read(16384))
        identity = data["identity"]
        assert identity["tenant"] == "SYNTHETIC_TEST_ONLY"
        assert identity["account"].startswith("fixture-")
        assert identity["peer_id"].startswith("fake-")
        assert data["mid"].startswith("fake-")
        assert data["prompt"].startswith("fake-")
        assert len(data["prompt"]) <= 200
        assert data["purpose"] == "QUALITY_EVAL"
        assert data["targetLanguage"] in ("zh-CN","en","de","pl")
        assert data["translationProvenance"]["kind"] in ("LOCAL_ENGINE","SYNTHETIC_FIXTURE")
        assert data["translationProvenance"]["source_mid"] == data["mid"]
    except (ValueError, KeyError, TypeError, AssertionError, AttributeError):
        reject("ONLY_SYNTHETIC_INPUT")
    sys.path.insert(0,str(src))
    from yance_agentos import NativeAgnoRuntime, Scope
    scope = Scope(identity["tenant"], identity["account"], "CONTACT",
                  identity["channel"], identity["peer_id"], int(identity["binding_revision"]))
    with tempfile.TemporaryDirectory(prefix="w45-agno-eval-",ignore_cleanup_errors=True) as folder:
        native = NativeAgnoRuntime(Path(folder)/"agno.sqlite",backend="qwen3",purpose="QUALITY_EVAL")
        capture=io.StringIO()
        with contextlib.redirect_stdout(capture):
            receipt = native.run(scope,data["prompt"],thread="default")
        attested = native.attest_contact_run(scope,data["prompt"],receipt,thread="default")
        ok = (attested and receipt.get("status")=="AGNO_RUN_COMPLETED"
              and receipt.get("model_id")=="qwen3:8b"
              and receipt.get("provider")=="OLLAMA_LOCAL_QWEN3_8B_FREE"
              and receipt.get("outbound")=="DISABLED")
        proof = {
            "status":"REAL_NATIVE_AGNO_RUN_UNREVIEWED" if ok else "W43_NATIVE_RUN_FAILED",
            "w43_sha":observed,
            "native_same_process_attested":bool(attested),
            "model_quality_pass":False,
            "receipt":receipt if ok else None,
            "identity":identity,
            "source_mid":data["mid"],
            "original_sha256":hashlib.sha256(data["original"].encode("utf8")).hexdigest(),
            "translation_request_id":data["translationProvenance"]["request_id"],
            "translation_provenance_kind":data["translationProvenance"]["kind"],
            "target_language":data["targetLanguage"],
            "prompt_sha256":hashlib.sha256(data["prompt"].encode("utf8")).hexdigest(),
            "candidates":[],
            "delivery":"NOT_REQUESTED"
        }
        print("W45_EVAL_JSON:"+json.dumps(proof,ensure_ascii=True),flush=True)
        return 0 if ok else 2

if __name__ == "__main__":
    sys.exit(main())
