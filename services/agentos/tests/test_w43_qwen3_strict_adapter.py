"""W43 exact strong-local adapter contract; NO model-service or paid calls."""
import sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from yance_agentos import NativeAgnoRuntime, LocalOnlyError, _local_llamacpp_model


def test_qwen3_uses_existing_official_agno_model_adapter_only(tmp_path, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OLLAMA_API_KEY", raising=False)
    key = tmp_path / "synthetic-key"
    key.write_text("f" * 44, encoding="utf-8")
    run = NativeAgnoRuntime(
        tmp_path / "qwen3.sdk.sqlite", backend="llamacpp",
        purpose="QUALITY_EVAL", local_key_file=key
    )
    assert run.model_id == "qwen3:8b"
    assert run.provider == "LLAMACPP_LOCAL_QWEN3_8B_FREE"
    assert run.policy_provider == "LOCAL_QWEN3_8B"
    assert run.model.id == "qwen3:8b"
    assert str(run.model.base_url) == "http://127.0.0.1:11605/v1"
    assert run.model.extra_body == {"chat_template_kwargs": {"enable_thinking": False}}
    assert run.capability_report()["chatgpt_siwc_v2"]["allow_call"] is False
    assert run.capability_report()["w25_delivery"] == "DISABLED"


@pytest.mark.parametrize("host,model", [
    ("http://127.0.0.1:11606", "qwen3:8b"),
    ("http://127.0.0.1:11606", "qwen2.5:1.5b"),
    ("https://127.0.0.1:11606", "qwen3:8b"),
    ("http://example.com:11606", "qwen3:8b"),
    ("http://127.0.0.1:11606/path", "qwen3:8b"),
])
def test_qwen3_strict_host_model_port_pair(tmp_path, host, model):
    fake = tmp_path / "synthetic-key"
    fake.write_text("a" * 44)
    with pytest.raises(LocalOnlyError):
        _local_llamacpp_model(host, model, fake)


def test_qwen3_only_for_explicit_quality_purpose(tmp_path):
    key = tmp_path / "synthetic-key"
    key.write_text("f" * 44)
    with pytest.raises(LocalOnlyError):
        NativeAgnoRuntime(tmp_path / "x.db", backend="qwen3_llamacpp",
                          purpose="QUALITY_EVAL", local_key_file=key)
    with pytest.raises(LocalOnlyError):
        NativeAgnoRuntime(tmp_path / "x.db", backend="llamacpp",
                          model_id="qwen2.5:1.5b",
                          purpose="QUALITY_EVAL", local_key_file=key)
