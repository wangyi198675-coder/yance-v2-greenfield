"""W43 current-existing-assistant defaults, safety and exact W45 provenance contract."""
import sys
from pathlib import Path
from types import SimpleNamespace
import pytest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from yance_agentos import NativeAgnoRuntime, LocalOnlyError, Scope, PROVIDER

def contact():
    return Scope("SYNTHETIC_TEST_ONLY","fixture-account-1","CONTACT","FB_PERSONAL","fake-peer-1",1)

def test_default_is_existing_authenticated_llamacpp_no_ollama(monkeypatch, tmp_path):
    key = tmp_path/"private-key"
    key.write_text("this-is-a-synthetic-test-secret-123456",encoding="utf-8")
    monkeypatch.setenv("YANCE_W43_LOCAL_KEY_FILE", str(key))
    obj = NativeAgnoRuntime(tmp_path/"native.sqlite")
    assert obj.model_id == "qwen3:8b"
    assert obj.provider == "LLAMACPP_LOCAL_NO_PAID_API" == PROVIDER
    assert obj.model.base_url == "http://127.0.0.1:11605/v1"
    assert obj.purpose == "HEALTHCHECK"
    assert obj.capability_report()["model_policy"]["allow_call"] is False
    assert obj.capability_report()["w25_delivery"] == "DISABLED"

def test_default_fails_closed_without_protected_auth_path(monkeypatch, tmp_path):
    monkeypatch.delenv("YANCE_W43_LOCAL_KEY_FILE",raising=False)
    with pytest.raises(LocalOnlyError,match="LOCAL_API_KEY_FILE_REQUIRED"):
        NativeAgnoRuntime(tmp_path/"native.sqlite")

def test_real_run_provenance_health_but_never_quality(monkeypatch, tmp_path):
    key=tmp_path/"synthetic-secret"
    key.write_text("this-is-a-synthetic-test-secret-123456",encoding="utf-8")
    native=NativeAgnoRuntime(tmp_path/"run.sqlite", local_key_file=key)
    monkeypatch.setattr(native, "_authorized_llamacpp_model_matches", lambda: True)
    monkeypatch.setattr(native.agents["CONTACT"], "run",
        lambda *args,**kwargs: SimpleNamespace(
           run_id="fake-sdk-run", status=SimpleNamespace(value="COMPLETED"),
           content="A generated synthetic sample"))
    output = native.run(contact(), "fake-synthetic hello")
    assert output["status"]=="AGNO_RUN_COMPLETED"
    assert output["model_id"]=="qwen3:8b"
    assert output["provider"]==PROVIDER
    assert output["quality_qualified"] is False
    assert output["provenance"]["quality_qualified"] is False
    assert output["provenance"]["model_id"]==output["model_id"]
    assert output["outbound"]=="DISABLED"
    assert output["suggestions"]==[]
    assert native.attest_contact_run(contact(),"fake-synthetic hello",output)
    assert not native.attest_contact_run(contact(),"fake-different prompt",output)
    assert not native.attest_contact_run(contact(),"fake-synthetic hello",dict(output, model_id="fake-model"))
    assert not native.attest_contact_run(Scope("SYNTHETIC_TEST_ONLY","fixture-account-1","CONTACT","FB_PERSONAL","fake-other-peer",1), "fake-synthetic hello", output)
    assert native.capability_report()["model_policy"]["status"] == "READY"
    assert native.capability_report()["run"]=="LOCAL_AGNO_CONNECTIVITY_VERIFIED_NOT_QUALITY"

def test_restrict_llamacpp_loopback_and_no_paid_environment(monkeypatch, tmp_path):
    key=tmp_path/"synthetic-secret"
    key.write_text("this-is-a-synthetic-test-secret-123456",encoding="utf-8")
    from yance_agentos import _local_llamacpp_model
    for endpoint in ("http://0.0.0.0:11605", "http://127.0.0.1:11434",
                     "https://api.openai.com", "http://127.0.0.1:11605/x"):
        with pytest.raises(LocalOnlyError):
            _local_llamacpp_model(endpoint,"qwen2.5:1.5b",key)


def test_model_mismatch_prevents_sdk_call_and_false_provenance(monkeypatch, tmp_path):
    key = tmp_path/"synthetic-secret"
    key.write_text("synthetic-not-an-actual-key-1234567", encoding="utf-8")
    native = NativeAgnoRuntime(tmp_path/"mismatch.sqlite", local_key_file=key)
    monkeypatch.setattr(native, "_authorized_llamacpp_model_matches", lambda: False)
    def forbidden(*args, **kwargs):
        raise AssertionError("MODEL_RUN_MUST_NOT_BE_ATTEMPTED")
    monkeypatch.setattr(native.agents["CONTACT"], "run", forbidden)
    result = native.run(contact(), "fake-synthetic mismatch")
    assert result["status"] == "HOLD_LOCAL_MODEL_ID_AUTH_OR_SERVER_MISMATCH"
    assert result["suggestions"] == [] and result["outbound"] == "DISABLED"
    assert "run_id" not in result and "original_response" not in result


@pytest.mark.parametrize("sdk_state, expected_status", [
    ("PAUSED", "AGNO_RUN_PAUSED_REQUIRES_APPROVAL"),
    ("ERROR", "LOCAL_MODEL_UNAVAILABLE_OR_RUN_FAILED"),
])
def test_native_approval_pause_not_misreported_as_model_failure(
        monkeypatch, tmp_path, sdk_state, expected_status):
    key = tmp_path / "synthetic-protected-key"
    key.write_text("synthetic-test-only-credential-123456", encoding="utf-8")
    runtime = NativeAgnoRuntime(tmp_path / "run.db", local_key_file=key)
    monkeypatch.setattr(runtime, "_authorized_llamacpp_model_matches", lambda: True)
    monkeypatch.setattr(runtime.agents["CONTACT"], "run",
        lambda *args, **kwargs: SimpleNamespace(
            run_id="fake-sdk-" + sdk_state.lower(),
            status=SimpleNamespace(value=sdk_state), content=None))
    output = runtime.run(contact(), "fake-hello")
    assert output["status"] == expected_status
    assert output["sdk_run_status"] == sdk_state
    assert output["run_id"] == "fake-sdk-" + sdk_state.lower()
    assert output["session_id"] == contact().session_id()
    assert output["suggestions"] == []
    assert output["outbound"] == "DISABLED"
    assert "original_response" not in output
    assert "provenance" not in output
    assert not runtime.attest_contact_run(contact(), "fake-hello", output)
    if sdk_state == "PAUSED":
        assert output["approval"] == "WAITING_FOR_HUMAN_NOT_AUTO_EXECUTED"
    else:
        assert "approval" not in output
