"""W43 contract / real local SDK tests; run from this directory with pytest -q."""
import sys
import os
from pathlib import Path
from unittest.mock import patch

import pytest
from agno.agent import Agent
from agno.os import AgentOS
from agno.team import Team

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from yance_agentos import (  # noqa: E402
    NativeAgnoRuntime, Scope, ScopeError, LocalOnlyError,
    _local_model, _local_llamacpp_model, review_synthetic_draft, synthetic_source_lookup,
)


def _offline_key(path):
    p = path / "synthetic-secret-local-only"
    p.write_text("synthetic-w43-testing-key-not-a-real-credential")
    return p


def c(account="fixture-account-1", peer="fake-peer-001", binding=1):
    return Scope("SYNTHETIC_TEST_ONLY", account, "CONTACT", "FB_PERSONAL", peer, binding)


def p(account="fixture-account-1"):
    return Scope("SYNTHETIC_TEST_ONLY", account, "PRIVATE")


def test_five_part_contact_k_and_owner_private_isolation():
    a, b, d = c(), c(peer="fake-peer-002"), c(account="fixture-account-2")
    e = c(binding=2)
    assert len(a.canonical_k) == 5
    assert len(p().canonical_k) == 3
    assert len({x.scoped_user_id for x in [a, b, d, e, p()]}) == 5
    assert len({x.session_id() for x in [a, b, d, e, p()]}) == 5
    assert a.session_id("fake-thread-A") != a.session_id("fake-thread-B")
    assert a.session_id("fake-thread-A") == a.session_id("fake-thread-A")


@pytest.mark.parametrize("kwargs", [
    {"tenant": "prod"},
    {"account": "real-user-1"},
    {"space": "OTHER"},
    {"channel": "UNKNOWN"},
    {"peer_id": "real-peer"},
    {"binding_revision": 0},
    {"binding_revision": True},
])
def test_identity_fence_rejects_real_or_malformed_k(kwargs):
    data = dict(tenant="SYNTHETIC_TEST_ONLY", account="fixture-account-1",
                space="CONTACT", channel="FB_PERSONAL", peer_id="fake-peer-001",
                binding_revision=1)
    data.update(kwargs)
    with pytest.raises(ScopeError):
        Scope(**data)


def test_private_cannot_leak_peer_and_invalid_channels():
    with pytest.raises(ScopeError):
        Scope("SYNTHETIC_TEST_ONLY", "fixture-account-1", "PRIVATE",
              "FB_PERSONAL", "fake-peer-001", 1)
    with pytest.raises(ScopeError):
        Scope("SYNTHETIC_TEST_ONLY", "fixture-account-1", "CONTACT",
              "FB_PERSONAL", "fake-peer-001|forged", 1)


@pytest.mark.parametrize("host", [
    "https://localhost:11434", "https://ollama.com",
    "http://example.com:11434", "http://127.0.0.1:11434/?key=1",
    "http://user:password@localhost:11434",
])
def test_remote_model_or_insecure_host_fail_closed(host):
    with pytest.raises(LocalOnlyError):
        _local_model(host, "qwen2.5:0.5b")


def test_cloud_keys_never_used():
    with patch.dict("os.environ", {"OLLAMA_API_KEY": "forbidden"}, clear=False):
        with pytest.raises(LocalOnlyError):
            _local_model("http://127.0.0.1:11434", "qwen2.5:0.5b")
    with patch.dict("os.environ", {"OPENAI_API_KEY": "forbidden"}, clear=False):
        with pytest.raises(LocalOnlyError):
            _local_model("http://127.0.0.1:11434", "qwen2.5:0.5b")


def test_actual_agno_agentos_team_registered(tmp_path):
    native = NativeAgnoRuntime(tmp_path / "w43.sqlite", backend="llamacpp", purpose="HEALTHCHECK", model_id="qwen2.5:1.5b", local_key_file=_offline_key(tmp_path))
    assert isinstance(native.agents["CONTACT"], Agent)
    assert isinstance(native.agents["PRIVATE"], Agent)
    assert isinstance(native.teams["CONTACT"], Team)
    assert isinstance(native.agent_os, AgentOS)
    assert native.model_id == "qwen2.5:1.5b"
    assert native.agents["CONTACT"].db is native.db
    assert review_synthetic_draft.requires_confirmation is True
    assert synthetic_source_lookup.name == "synthetic_source_lookup"
    assert native.capability_report()["control_plane"].startswith("NOT_CONNECTED")
    assert native.capability_report()["w25_delivery"] == "DISABLED"


def test_no_shortcut_for_non_fixture_and_no_raw_session_override(tmp_path):
    native = NativeAgnoRuntime(tmp_path / "w43.sqlite", backend="llamacpp", purpose="HEALTHCHECK", model_id="qwen2.5:1.5b", local_key_file=_offline_key(tmp_path))
    with pytest.raises(ScopeError):
        native.run(c(), "hello")
    with pytest.raises(ScopeError):
        native.run(c(), "fake-hello", thread="a|b")
    with pytest.raises(ScopeError):
        native.run(object(), "fake-hello")


@pytest.mark.local_model
def test_local_llamacpp_native_agno_run_and_session_persistence(tmp_path):
    """A real SDK/model call, not a mock port or paid provider."""
    import httpx
    with httpx.Client(timeout=10.0, trust_env=False) as client:
        response = client.get("http://127.0.0.1:11605/v1/models",
                              headers={"Authorization": "Bearer " + Path(_local_key()).read_text(encoding="utf-8-sig").strip()})
    assert response.status_code == 200
    if not any(item["id"] == "qwen2.5:1.5b" for item in response.json()["data"]):
        pytest.skip("QWEN25_15B_HEALTHCHECK_MODEL_NOT_CURRENTLY_LOADED; PR36 historical proof preserved")
    db_file = tmp_path / "native.sqlite"
    native = NativeAgnoRuntime(db_file, backend="llamacpp", local_key_file=_local_key(), purpose="HEALTHCHECK")
    scope = c()
    first = native.run(scope, "fake-Test only. Reply with one short greeting.")
    assert first["status"] == "AGNO_RUN_COMPLETED", first
    assert first["engine"] == "OFFICIAL_AGNO_SDK"
    assert first["run_id"]
    assert first["session_id"] == scope.session_id()
    assert first["provenance"]["run_id"] == first["run_id"]
    assert first["suggestions"] == [] and first["outbound"] == "DISABLED"
    assert first["original_response"]
    restarted = NativeAgnoRuntime(db_file, backend="llamacpp", local_key_file=_local_key(), purpose="HEALTHCHECK")
    second = restarted.run(scope, "fake-Say one short greeting again.")
    assert second["status"] == "AGNO_RUN_COMPLETED", second
    assert second["session_id"] == first["session_id"]
    assert second["run_id"] != first["run_id"]
    assert db_file.exists() and db_file.stat().st_size > 0
    assert restarted.run(c(peer="fake-peer-002"), "fake-Test a different peer.")["session_id"] != first["session_id"]


def test_api_not_auto_served(tmp_path):
    native = NativeAgnoRuntime(tmp_path / "sdk.db", backend="llamacpp", purpose="HEALTHCHECK", model_id="qwen2.5:1.5b", local_key_file=_offline_key(tmp_path))
    assert not hasattr(native, "serve")
    app = native.get_unserved_app()
    assert hasattr(app, "routes")
    assert native.agent_os.telemetry is False
    assert native.agent_os.tracing is True


def test_native_agno_persistent_scoped_memory(tmp_path):
    native = NativeAgnoRuntime(tmp_path / "native-memory.db", backend="llamacpp", purpose="HEALTHCHECK", model_id="qwen2.5:1.5b", local_key_file=_offline_key(tmp_path))
    a = c()
    b = c(peer="fake-peer-002")
    prv = p()
    with pytest.raises(ScopeError):
        native.remember_synthetic(a, "secret-real-memory")
    native.remember_synthetic(a, "fake-contact-A-only")
    native.remember_synthetic(prv, "fake-owner-private-only")
    assert "fake-contact-A-only" in native.read_synthetic_memories(a)
    assert native.read_synthetic_memories(b) == []
    assert "fake-owner-private-only" not in native.read_synthetic_memories(a)
    fresh = NativeAgnoRuntime(tmp_path / "native-memory.db", backend="llamacpp", purpose="HEALTHCHECK", model_id="qwen2.5:1.5b", local_key_file=_offline_key(tmp_path))
    assert "fake-contact-A-only" in fresh.read_synthetic_memories(a)
    assert "fake-owner-private-only" in fresh.read_synthetic_memories(prv)


def test_native_agno_trace_contract_is_truthful(tmp_path):
    native = NativeAgnoRuntime(tmp_path / "traces.db", backend="llamacpp", purpose="HEALTHCHECK", model_id="qwen2.5:1.5b", local_key_file=_offline_key(tmp_path))
    receipt = native.read_trace_receipts(c(), "fake-no-such-run")
    assert receipt["status"] == "TRACE_NOT_FOUND"
    assert receipt["count"] == 0


@pytest.mark.local_model
def test_local_llamacpp_native_team_run(tmp_path):
    """Native Team.run may fail on small-model delegation: never claim mock success."""
    native = NativeAgnoRuntime(tmp_path / "team.db", backend="llamacpp", local_key_file=_local_key(), purpose="HEALTHCHECK")
    result = native.run(c(), "fake-Reply briefly about a fictional greeting.", team=True)
    assert result["status"] == "AGNO_RUN_COMPLETED", result
    assert result["engine"] == "OFFICIAL_AGNO_SDK"
    assert result["outbound"] == "DISABLED"


def test_sdk_error_status_not_misreported_as_success(tmp_path, monkeypatch):
    """Regression: the Agno SDK may return error content and a run_id on failure."""
    from types import SimpleNamespace
    native = NativeAgnoRuntime(tmp_path / "failed-run.db", backend="llamacpp", purpose="HEALTHCHECK", model_id="qwen2.5:1.5b", local_key_file=_offline_key(tmp_path))
    monkeypatch.setattr(native, "_authorized_llamacpp_model_matches", lambda: True)
    monkeypatch.setattr(
        native.agents["CONTACT"], "run",
        lambda *args, **kwargs: SimpleNamespace(
            run_id="fake-failed-run",
            status=SimpleNamespace(value="ERROR"),
            content="llama-server failed",
        ),
    )
    result = native.run(c(), "fake-input")
    assert result["status"] == "LOCAL_MODEL_UNAVAILABLE_OR_RUN_FAILED"
    assert result["sdk_run_status"] == "ERROR"
    assert "engine" not in result and "original_response" not in result
    assert result["suggestions"] == [] and result["outbound"] == "DISABLED"


@pytest.mark.local_model
def test_native_agentos_trace_persisted_for_sdk_error(tmp_path):
    """Real trace in a dedicated AgentOS process; OTel provider is process-global."""
    import os
    import subprocess

    script = (
        "import sys, os\n"
        f"sys.path.insert(0, {str(Path(__file__).resolve().parents[1])!r})\n"
        "from yance_agentos import NativeAgnoRuntime, Scope\n"
        "from pathlib import Path\n"
        f"native=NativeAgnoRuntime(Path({str(tmp_path)!r})/'native-trace.db', backend='llamacpp', local_key_file=os.environ['YANCE_W43_LOCAL_KEY_FILE'], purpose='HEALTHCHECK')\n"
        "native.get_unserved_app()\n"
        "s=Scope('SYNTHETIC_TEST_ONLY','fixture-account-1','CONTACT','FB_PERSONAL','fake-peer-001',1)\n"
        "r=native.run(s,'fake-Trace a local test greeting.')\n"
        "assert r['run_id']\n"
        "t=native.read_trace_receipts(s,r['run_id'])\n"
        "assert t['status']=='NATIVE_TRACE_FOUND', t\n"
        "assert r['status'] in {'AGNO_RUN_COMPLETED','LOCAL_MODEL_UNAVAILABLE_OR_RUN_FAILED'}\n"
        "print('REAL_SDK_TRACE_PERSISTED',t['count'])\n"
    )
    env = os.environ.copy()
    env.pop("OPENAI_API_KEY", None)
    env.pop("OLLAMA_API_KEY", None)
    completed = subprocess.run(
        [sys.executable, "-c", script],
        capture_output=True, text=True, timeout=100, env=env,
    )
    assert completed.returncode == 0, (completed.stdout + completed.stderr)[-1500:]
    assert "REAL_SDK_TRACE_PERSISTED" in completed.stdout


def _local_key() -> str:
    result = os.environ.get("YANCE_W43_LOCAL_KEY_FILE")
    if not result:
        pytest.fail("LOCAL_LLAMA_KEY_FILE_NOT_CONFIGURED")
    return result


def test_llamacpp_fixed_loopback_and_key_file_required(tmp_path):
    fake = tmp_path / "secret-local-key"
    fake.write_text("a" * 36, encoding="utf-8")
    with pytest.raises(LocalOnlyError):
        _local_llamacpp_model("http://127.0.0.1:11605", "qwen2.5:1.5b", None)
    with pytest.raises(LocalOnlyError):
        _local_llamacpp_model("https://api.openai.com/v1", "qwen2.5:1.5b", fake)
    with pytest.raises(LocalOnlyError):
        _local_llamacpp_model("http://127.0.0.1:11434", "qwen2.5:1.5b", fake)
    with pytest.raises(LocalOnlyError):
        _local_llamacpp_model("http://127.0.0.1:11605", "gpt-4o", fake)
    real = _local_llamacpp_model("http://127.0.0.1:11605", "qwen2.5:1.5b", fake)
    assert real.base_url == "http://127.0.0.1:11605/v1"
    assert real.id == "qwen2.5:1.5b"
