"""W43 policy tests. These cannot authorize actual SIWC or a paid Provider."""
import os
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from model_policy import classify_provider, choose_preferred_nonprod, v2_chatgpt_siwc_status
from yance_agentos import NativeAgnoRuntime, LocalOnlyError, Scope


def _c():
    return Scope("SYNTHETIC_TEST_ONLY", "fixture-account-1",
                 "CONTACT", "FB_PERSONAL", "fake-peer-001", 1)


def _clean_cloud_env(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OLLAMA_API_KEY", raising=False)


def test_strong_model_is_only_quality_default():
    a = choose_preferred_nonprod(qwen3_real_run_verified=False)
    assert a.provider == "LOCAL_QWEN3_8B"
    assert a.status == "QWEN3_NOT_VERIFIED"
    assert a.allow_call is False
    assert choose_preferred_nonprod(qwen3_real_run_verified=True).allow_call is True


def test_small_model_never_promoted_into_quality():
    for verified in (True, False):
        p = classify_provider("LOCAL_QWEN25_15B", "QUALITY_EVAL", local_model_verified=verified)
        assert p.allow_call is False and p.status == "HEALTH_ONLY_NOT_QUALITY"
    ok = classify_provider("LOCAL_QWEN25_15B", "HEALTHCHECK", local_model_verified=True)
    assert ok.allow_call and ok.billing == "FREE_LOCAL"


def test_chatgpt_siwc_subscription_login_is_not_api_rights():
    no = v2_chatgpt_siwc_status()
    assert not no.allow_call and no.status == "V2_SIWC_NOT_VERIFIED"
    flags = {
        "participating_app_verified": True,
        "current_user_approved_plan_sharing": True,
        "scope_allows_requested_model_and_feature": True,
        "nonexpired_grant_attested": True,
        "allowance_available_verified": True,
        "v2_native_grant_verified": True,
        "runtime_receipt_verified": True,
    }
    # Even caller-supplied all-True flags cannot mint any real grant.
    p = classify_provider("CHATGPT_PLAN_SIWC", "QUALITY_EVAL", siwc=flags)
    assert not p.allow_call
    assert p.status == "PREFLIGHT_FIELDS_PRESENT_NATIVE_GATE_REQUIRED"
    for key in flags:
        modified = dict(flags, **{key: False})
        assert not classify_provider("CHATGPT_PLAN_SIWC", "QUALITY_EVAL", siwc=modified).allow_call


@pytest.mark.parametrize("selected,approved", [(False, False), (True, False), (False, True), (True, True)])
def test_no_automatic_paid_fallback(selected, approved):
    p = classify_provider("OTHER_EXPLICIT", "QUALITY_EVAL",
                          user_explicitly_selected=selected, extra_charge_approved=approved)
    assert p.allow_call is False


def test_explicit_legacy_qwen3_model_policy_remains_isolated(tmp_path, monkeypatch):
    _clean_cloud_env(monkeypatch)
    runtime = NativeAgnoRuntime(tmp_path / "qwen3.sqlite", backend="qwen3", purpose="QUALITY_EVAL")
    assert runtime.model_id == "qwen3:8b"
    assert runtime.purpose == "QUALITY_EVAL"
    assert runtime.policy_provider == "LOCAL_QWEN3_8B"
    assert runtime.capability_report()["chatgpt_siwc_v2"]["allow_call"] is False


def test_explicit_health_only_is_enforced(tmp_path, monkeypatch):
    _clean_cloud_env(monkeypatch)
    key = tmp_path / "synthetic_local_key"
    key.write_text("a" * 44, encoding="utf-8")
    with pytest.raises(LocalOnlyError):
        NativeAgnoRuntime(tmp_path / "bad.sqlite", backend="llamacpp",
                          local_key_file=key, purpose="QUALITY_EVAL")
    with pytest.raises(LocalOnlyError):
        NativeAgnoRuntime(tmp_path / "bad.sqlite", backend="ollama", purpose="QUALITY_EVAL")
    health = NativeAgnoRuntime(tmp_path / "ok.sqlite", backend="llamacpp",
                               local_key_file=key, purpose="HEALTHCHECK")
    assert health.capability_report()["run"] == "LOCAL_AGNO_CONNECTIVITY_NOT_YET_VERIFIED"
    assert health.capability_report()["model_policy"]["allow_call"] is False  # not quality certified


def test_w45_contract_only_from_attested_sdk_receipt(tmp_path, monkeypatch):
    _clean_cloud_env(monkeypatch)
    runtime = NativeAgnoRuntime(tmp_path / "w45.sqlite", backend="qwen3", purpose="QUALITY_EVAL")  # legacy contract-only, NO model call
    # Isolated contract test injects a FAKE SDK result. This is not a real-run test.
    fake_agno_result = {
        "status": "AGNO_RUN_COMPLETED",
        "run_id": "fake-run-id",
        "session_id": _c().session_id(),
        "provenance": {"type": "AGNO_RUN_RESULT", "run_id": "fake-run-id"},
    }
    monkeypatch.setattr(runtime, "run", lambda *a, **k: dict(fake_agno_result))
    out = runtime.run_for_w45(_c(), "fake-mid-001", "fake-Original hallo",
                              "fake-tr-001", "fake-Only synthetic greeting.")
    assert out["status"] == "COMPLETED"
    assert out["identity"]["binding_revision"] == "1"
    assert out["sourceMid"] == "fake-mid-001"
    assert out["runId"] == "fake-run-id"
    assert out["modelId"] == "qwen3:8b"
    assert out["candidates"] == []
    assert runtime.attest_w45_same_runtime(out)
    fake = dict(out, sourceMid="fake-another-mid")
    assert runtime.attest_w45_same_runtime(fake) is False
    assert runtime.attest_w45_same_runtime({"runId": "fake-forged-run"}) is False
    assert runtime.attest_w45_same_runtime({"runId": None}) is False
    assert runtime.attest_w45_same_runtime({"engine": "OFFICIAL_AGNO_SDK", "runId": []}) is False


def test_w45_holds_when_real_sdk_run_fails(tmp_path, monkeypatch):
    _clean_cloud_env(monkeypatch)
    runtime = NativeAgnoRuntime(tmp_path / "failed.sqlite", backend="qwen3", purpose="QUALITY_EVAL")
    monkeypatch.setattr(runtime, "run", lambda *a, **k: {
        "status": "LOCAL_MODEL_UNAVAILABLE_OR_RUN_FAILED",
        "sdk_run_status": "ERROR",
    })
    out = runtime.run_for_w45(_c(), "fake-mid", "fake-Original",
                              "fake-translation", "fake-query")
    assert out["status"] == "AGNO_QUALITY_RUN_UNAVAILABLE"
    assert out["candidates"] == []
    assert not runtime.attest_w45_same_runtime(out)


def test_w45_forbids_healthcheck_model(tmp_path, monkeypatch):
    _clean_cloud_env(monkeypatch)
    runtime = NativeAgnoRuntime(tmp_path / "old.sqlite", backend="ollama",
                                purpose="HEALTHCHECK")
    with pytest.raises(LocalOnlyError):
        runtime.run_for_w45(_c(), "fake-mid", "fake-original",
                            "fake-translation", "fake-prompt")


def test_missing_qwen3_blocks_inference_instead_of_falling_back(tmp_path, monkeypatch):
    _clean_cloud_env(monkeypatch)
    import ollama
    runtime = NativeAgnoRuntime(tmp_path / "missing-quality.db", backend="qwen3", purpose="QUALITY_EVAL")
    monkeypatch.setattr(ollama.Client, "list",
                        lambda self: SimpleNamespace(models=[SimpleNamespace(model="qwen2.5:1.5b")]))
    def forbidden(*_args, **_kwargs):
        raise AssertionError("SHOULD_NOT_INVOKE_ANY_MODEL")
    monkeypatch.setattr(runtime.agents["CONTACT"], "run", forbidden)
    resp = runtime.run(_c(), "fake-Hello, only if Qwen3 installed.")
    assert resp["status"] == "HOLD_QWEN3_8B_NOT_INSTALLED_OR_MODEL_SERVER_UNAVAILABLE"
    assert resp["suggestions"] == []
    assert resp["outbound"] == "DISABLED"
    assert runtime.capability_report()["model_policy"]["allow_call"] is False
