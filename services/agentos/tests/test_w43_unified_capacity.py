"""Incremental W43 one-slot capacity, full-K isolation, and no-Ollama tests."""
import concurrent.futures
import os
from pathlib import Path
import subprocess
import sys
import threading
import time
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from yance_agentos import NativeAgnoRuntime, Scope, LocalOnlyError
import w43_capacity


def _scope(i):
    return Scope("SYNTHETIC_TEST_ONLY", "fixture-account-1", "CONTACT",
                 "FB_PERSONAL", f"fake-concurrent-{i}", 1)


def _runtime(tmp_path, i):
    key = tmp_path / "synthetic-key"
    key.write_text("synthetic-not-real-key-12345678901234", encoding="utf-8")
    return NativeAgnoRuntime(tmp_path / f"native-{i}.db",
                             backend="llamacpp", purpose="QUALITY_EVAL", local_key_file=key)


def test_one_slot_releases_after_exception():
    with pytest.raises(ZeroDivisionError):
        with w43_capacity.one_slot(0.5) as acquired:
            assert acquired
            1 / 0
    with w43_capacity.one_slot(0.5) as acquired:
        assert acquired


def test_w43_capacity_rejects_after_short_bounded_wait(tmp_path, monkeypatch):
    native = _runtime(tmp_path, 1)
    monkeypatch.setattr(native, "_authorized_llamacpp_model_matches", lambda: True)
    monkeypatch.setattr(native.agents["CONTACT"], "run",
                        lambda *args, **kwargs: (_ for _ in ()).throw(
                            AssertionError("BUSY_RUN_MUST_NEVER_INVOKE_SDK")))
    with w43_capacity.one_slot(1.0) as acquired:
        assert acquired
        monkeypatch.setattr(
            sys.modules["yance_agentos"], "one_slot",
            lambda: w43_capacity.one_slot(0.03),
        )
        reply = native.run(_scope(1), "fake-no-physical-call")
        assert reply["status"] == "HOLD_LOCAL_MODEL_CAPACITY_BUSY"
        assert reply["suggestions"] == []
        assert reply["outbound"] == "DISABLED"
        assert "run_id" not in reply and "original_response" not in reply


def test_two_independent_agno_sessions_are_serialized(tmp_path, monkeypatch):
    a, b = _runtime(tmp_path, 1), _runtime(tmp_path, 2)
    for r in (a, b):
        monkeypatch.setattr(r, "_authorized_llamacpp_model_matches", lambda: True)
    state = {"inside": 0, "peak": 0}
    gate = threading.Lock()

    def sdk_fake(number):
        def execute(text, user_id, session_id):
            with gate:
                state["inside"] += 1
                state["peak"] = max(state["inside"], state["peak"])
            try:
                time.sleep(0.13)
                return SimpleNamespace(
                    status=SimpleNamespace(value="COMPLETED"),
                    content=f"fake-SDK-model-{number}-completed",
                    run_id=f"fake-sdk-run-{number}",
                    metrics=None,
                )
            finally:
                with gate:
                    state["inside"] -= 1
        return execute

    monkeypatch.setattr(a.agents["CONTACT"], "run", sdk_fake(1))
    monkeypatch.setattr(b.agents["CONTACT"], "run", sdk_fake(2))
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        replies = list(executor.map(lambda pair: pair[0].run(pair[1], "fake-inference"),
                                    [(a, _scope(1)), (b, _scope(2))]))
    assert state["peak"] == 1, "two model executions entered single-slot SDK"
    assert [r["status"] for r in replies] == ["AGNO_RUN_COMPLETED", "AGNO_RUN_COMPLETED"]
    assert replies[0]["session_id"] != replies[1]["session_id"]
    assert replies[0]["run_id"] != replies[1]["run_id"]
    assert all(r["quality_qualified"] is False and r["outbound"] == "DISABLED" for r in replies)


def test_cross_process_bounded_lock_does_not_fake_success(tmp_path):
    code = (
        "import sys\n"
        f"sys.path.insert(0,{str(Path(__file__).resolve().parents[1])!r})\n"
        "from w43_capacity import one_slot\n"
        "with one_slot(0.15) as allowed:\n"
        " print('ADMITTED' if allowed else 'CAPACITY_BUSY')\n"
    )
    with w43_capacity.one_slot(1.0) as admitted:
        assert admitted
        child = subprocess.run([sys.executable, "-c", code],
                               capture_output=True, text=True, timeout=10)
    assert child.returncode == 0, child.stderr
    assert child.stdout.strip() == "CAPACITY_BUSY"


@pytest.mark.parametrize("backend", ["ollama", "qwen3", "qwen3_llamacpp", "openai"])
def test_only_one_official_active_adapter(tmp_path, backend):
    key=tmp_path/"synthetic-key"
    key.write_text("synthetic-not-real-key-12345678901234")
    with pytest.raises(LocalOnlyError,match="OLLAMA_DISABLED"):
        NativeAgnoRuntime(tmp_path/"bad.db", backend=backend, local_key_file=key)
