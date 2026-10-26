"""W43 W47-private-principal source boundary; all principals are FAKE tests.

W47 currently HAS NO real stable native principal verifier for this Python
process. These fixtures do NOT qualify the W47 server-side join or web UAT.
"""
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
import sys
import time

import pytest
from agno.models.message import Message
from agno.run.agent import RunOutput
from agno.run.base import RunStatus
from agno.session.agent import AgentSession

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from private_scope import NativePrivateScope
from private_principal_port import (
    W43NativePrivateBrainPort, W47VerifiedPrincipal, W47PrivateAccessError,
)


def claim(root, principal="principal-verified-A", installation="install-verified-01", session="session-verified-A"):
    root.mkdir(parents=True, exist_ok=True)
    return W47VerifiedPrincipal(
        principal_ref=principal,
        installation_ref=installation,
        session_ref=session,
        session_revision=7,
        revocation_generation=2,
        expires_at_ms=int(time.time() * 1000) + 300000,
        app_local_data_root=root,
    )


class FakeW47:
    def __init__(self, grants):
        self.grants = dict(grants)
        self.calls = []

    def resolve(self, context, operation):
        self.calls.append((context, operation))
        return self.grants.get(context)


def port(tmp, authority):
    key = tmp / "synthetic-private-test-key.txt"
    key.write_text("synthetic-testing-secret-not-production")
    return W43NativePrivateBrainPort(resolve_current=authority.resolve, local_key_file=key)


def assert_denied(code, fn):
    with pytest.raises(W47PrivateAccessError) as exc:
        fn()
    assert exc.value.code == code


def add_native_run(runtime, scope, thread, n, prompt, answer, tool=None):
    sid = scope.session_id(thread)
    runtime.db.upsert_session(AgentSession(
        session_id=sid, user_id=scope.scoped_user_id,
        agent_id=runtime.agents["PRIVATE"].id,
    ))
    messages = [Message(role="user", content=prompt)]
    if tool:
        messages.append(Message(role="tool", content=tool, tool_call_id="fake-tool"))
    messages.append(Message(role="assistant", content=answer))
    runtime.db.upsert_run(RunOutput(
        run_id="fake-only-run-" + str(n), session_id=sid,
        user_id=scope.scoped_user_id, agent_id=runtime.agents["PRIVATE"].id,
        status=RunStatus.completed, content=answer, messages=messages,
    ), session_id=sid, user_id=scope.scoped_user_id, run_index=n)


def test_fail_closed_without_w47_original_verifier(tmp_path):
    p = W43NativePrivateBrainPort()
    assert_denied("W47_TRUSTED_PRINCIPAL_NOT_CONNECTED",
                  lambda: p.history(object(), thread_id="threadA"))
    assert_denied("W47_TRUSTED_PRINCIPAL_NOT_CONNECTED",
                  lambda: p.turn(object(), thread_id="threadA",
                                 text="private question", request_id="request_123"))
    with pytest.raises(PermissionError, match="W47_VERIFIED_PRINCIPAL_REQUIRED"):
        NativePrivateScope("install-verified-01", "principal-verified-A")


def test_true_native_sqlite_fixture_two_turns_cold_reload_and_user_thread_db_isolation(tmp_path):
    a = claim(tmp_path/"W54_USER_A")
    b = claim(tmp_path/"W54_USER_B", principal="principal-verified-B", session="session-verified-B")
    auth = FakeW47({"A": a, "B": b})
    p = port(tmp_path, auth)
    sa, ra = p._runtime(a)
    sb, rb = p._runtime(b)
    assert sa.session_id("thread-one") != sb.session_id("thread-one")
    assert sa.session_id("thread-one") != sa.session_id("thread-two")
    assert ra.db_file != rb.db_file
    assert sa.scoped_user_id != sb.scoped_user_id
    add_native_run(ra, sa, "thread-one", 0, "fixture hello", "fixture model reply 1")
    add_native_run(ra, sa, "thread-one", 1, "fixture follow-up", "fixture model reply 2",
                   tool="FAKE_TOOL_RESULT_ONLY")
    # Reconstruct runtime: native Agno SqliteDb reads the SAME W54-rooted file.
    del p
    fresh = port(tmp_path, auth)
    history = fresh.history("A", thread_id="thread-one")
    assert history["completeTurnCount"] == 2
    assert history["runCount"] == 2
    assert [m["role"] for m in history["messages"]] == [
        "user", "assistant", "user", "tool", "assistant",
    ]
    assert history["messages"][2]["content"] == "fixture follow-up"
    assert history["messages"][3]["content"] == "FAKE_TOOL_RESULT_ONLY"
    assert fresh.history("A", thread_id="thread-two")["messages"] == []
    assert fresh.history("B", thread_id="thread-one")["messages"] == []
    assert fresh.history("B", thread_id="thread-one")["completeTurnCount"] == 0
    assert not any("system" == x["role"] for x in history["messages"])
    assert [x[1] for x in auth.calls[-4:]].count("PRIVATE_HISTORY") >= 2


def test_revoked_expired_stale_and_no_principal_denied_before_db(tmp_path):
    a = claim(tmp_path/"W54_USER_A")
    auth = FakeW47({"A": a})
    p = port(tmp_path, auth)
    assert_denied("LOCAL_SESSION_REQUIRED", lambda: p.history("B", thread_id="one"))
    auth.grants["A"] = None
    assert_denied("LOCAL_SESSION_REQUIRED", lambda: p.history("A", thread_id="one"))
    auth.grants["A"] = replace(a, expires_at_ms=1)
    assert_denied("LOCAL_SESSION_EXPIRED", lambda: p.history("A", thread_id="one"))
    auth.grants["A"] = replace(a, status="REVOKED")
    assert_denied("LOCAL_SESSION_REVOKED_OR_EXPIRED", lambda: p.history("A", thread_id="one"))


def test_mid_operation_revision_rotation_no_reply_leak(tmp_path, monkeypatch):
    a = claim(tmp_path/"W54_USER_A")
    auth = FakeW47({"A": a})
    p = port(tmp_path, auth)
    scope, runtime = p._runtime(a)
    monkeypatch.setattr(runtime, "_authorized_llamacpp_model_matches", lambda: True)
    def fake_sdk_run(*args, **kwargs):
        auth.grants["A"] = replace(a, revocation_generation=a.revocation_generation + 1)
        return SimpleNamespace(
            status=SimpleNamespace(value="COMPLETED"),
            content="FAKE_NOT_A_REAL_MODEL_ANSWER",
            run_id="fake-run-rotated",
            session_id=scope.session_id("thread-one"),
        )
    monkeypatch.setattr(runtime.agents["PRIVATE"], "run", fake_sdk_run)
    assert_denied("LOCAL_SESSION_CHANGED_OR_REVOKED",
                  lambda: p.turn("A", thread_id="thread-one",
                                 text="synthetic private question", request_id="request-12345"))


def test_real_model_reply_must_be_sdk_completed_and_nonempty(tmp_path, monkeypatch):
    a = claim(tmp_path/"W54_USER_A")
    auth = FakeW47({"A": a})
    p = port(tmp_path, auth)
    _, runtime = p._runtime(a)
    monkeypatch.setattr(runtime, "_authorized_llamacpp_model_matches", lambda: True)
    for status, content in [("ERROR","irrelevant"), ("COMPLETED",""), ("PAUSED","review later")]:
        monkeypatch.setattr(runtime.agents["PRIVATE"], "run",
                            lambda *x, status=status, content=content, **kw:
                                SimpleNamespace(status=SimpleNamespace(value=status),
                                                content=content, run_id="fake-only"))
        assert_denied("LOCAL_MODEL_RUN_NOT_COMPLETED",
                      lambda: p.turn("A", thread_id="thread-one", text="private fixture",
                                     request_id="request-12345"))


@pytest.mark.parametrize("thread", ["", "../db", "bad|thread", "x"*129])
def test_thread_rejection_before_any_authority_lookup(tmp_path, thread):
    auth = FakeW47({"A": claim(tmp_path/"W54_USER_A")})
    p = port(tmp_path, auth)
    assert_denied("THREAD_INVALID", lambda: p.history("A", thread_id=thread))
    assert auth.calls == []


def test_stable_principal_through_cookie_session_rotation_without_identity_mixing(tmp_path):
    original = claim(tmp_path/"W54_USER_A")
    renewed = replace(original, session_ref="session-renewed-A", session_revision=10)
    auth = FakeW47({"old": original, "new": renewed})
    p = port(tmp_path, auth)
    scope1, runtime1 = p._runtime(p._verified("old","PRIVATE_HISTORY"))
    scope2, runtime2 = p._runtime(p._verified("new","PRIVATE_HISTORY"))
    assert scope1.scoped_user_id == scope2.scoped_user_id
    assert scope1.session_id("thread-one") == scope2.session_id("thread-one")
    assert runtime1 is runtime2
    assert runtime1.db_file == runtime2.db_file


def test_w47_absent_model_never_calls_sdk(tmp_path, monkeypatch):
    a=claim(tmp_path/"W54_USER_A")
    auth=FakeW47({"A":a})
    p=port(tmp_path,auth)
    _,runtime=p._runtime(a)
    monkeypatch.setattr(runtime,"_authorized_llamacpp_model_matches",lambda:False)
    monkeypatch.setattr(runtime.agents["PRIVATE"],"run",lambda *a,**kw: (_ for _ in ()).throw(AssertionError("SDK_CALLED")))
    assert_denied("LOCAL_MODEL_UNAVAILABLE",
                  lambda:p.turn("A",thread_id="thread-one",text="hello",request_id="request-12345"))


def test_revocation_during_history_read_refuses_entire_payload(tmp_path, monkeypatch):
    a=claim(tmp_path/"W54_USER_A")
    auth=FakeW47({"A":a})
    p=port(tmp_path,auth)
    _,runtime=p._runtime(a)
    original=runtime.read_private_chat_history
    def read_then_revoke(*args, **kwargs):
        value=original(*args, **kwargs)
        auth.grants["A"]=replace(a,session_revision=a.session_revision+1)
        return value
    monkeypatch.setattr(runtime, "read_private_chat_history",read_then_revoke)
    assert_denied("LOCAL_SESSION_CHANGED_OR_REVOKED",lambda:p.history("A",thread_id="thread-one"))


def test_sdk_completed_wrong_session_or_run_id_never_returned(tmp_path, monkeypatch):
    a=claim(tmp_path/"W54_USER_A")
    auth=FakeW47({"A":a})
    p=port(tmp_path,auth)
    _,runtime=p._runtime(a)
    monkeypatch.setattr(runtime,"_authorized_llamacpp_model_matches",lambda:True)
    for run_id,session_id in [
        ("fake-run","wrong-session"), ("", "valid-but-incorrect"),
    ]:
        monkeypatch.setattr(runtime.agents["PRIVATE"],"run",lambda *args,run_id=run_id,fake_session=session_id,**kwargs:
            SimpleNamespace(status=SimpleNamespace(value="COMPLETED"),
                            content="FAKE_TEXT_NOT_REAL_MODEL",run_id=run_id,
                            session_id=fake_session))
        assert_denied("LOCAL_MODEL_RUN_NOT_COMPLETED",lambda:p.turn(
            "A",thread_id="thread-one",text="fake owner question",
            request_id="request-12345",
        ))


def test_no_browser_supplied_principal_dict_as_resolver_value(tmp_path):
    def self_asserted(context, op):
        return {
            "status":"VERIFIED","principal_ref":"principal-verified-A",
            "app_local_data_root":str(tmp_path),
            "session_revision":1,
        }
    port=W43NativePrivateBrainPort(resolve_current=self_asserted)
    assert_denied("W47_PRINCIPAL_UNAVAILABLE",lambda:port.history(object(),thread_id="thread-one"))


def test_w54_storage_symlink_escape_denied(tmp_path):
    a=claim(tmp_path/"W54_USER_A")
    auth=FakeW47({"A":a})
    root=a.app_local_data_root/"YanceV2"
    other=tmp_path/"other_USER_OUTSIDE"
    other.mkdir()
    try:
        root.symlink_to(other, target_is_directory=True)
    except (OSError, NotImplementedError):
        pytest.skip("Windows symlink creation not permitted for this OS user")
    p=port(tmp_path,auth)
    assert_denied("PRIVATE_HISTORY_STORAGE_UNAVAILABLE",lambda:p.history("A",thread_id="thread-one"))
