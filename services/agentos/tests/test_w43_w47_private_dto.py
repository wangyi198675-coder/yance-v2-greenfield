"""W43 delta tests: W47 exact DTO backed by original native Agno RunOutput.

W47 resolver and SDK RunOutput here are clearly FAKE fixtures. They prove
server mapping, NOT trusted Windows Principal or actual model generation.
"""
from pathlib import Path
from types import SimpleNamespace
import sys
import time

import pytest
from agno.run.agent import RunOutput
from agno.run.base import RunStatus
from agno.models.message import Message
from agno.session.agent import AgentSession

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from private_principal_port import W47VerifiedPrincipal, W47PrivateAccessError, W43NativePrivateBrainPort
from w47_private_dto import W43W47PrivateBridge
from private_request_ledger import NativePrivateRequestLedger

class VerifiedServerContext:
    pass


def claim(root):
    root.mkdir(parents=True, exist_ok=True)
    return W47VerifiedPrincipal(
        principal_ref="fixture-stable-private-user-A",
        installation_ref="fixture-install-A",
        session_ref="fixture-verified-session-A",
        session_revision=2, revocation_generation=4,
        expires_at_ms=int(time.time() * 1000) + 200000,
        app_local_data_root=root,
    )


def fixture(tmp_path):
    context = VerifiedServerContext()
    current = [claim(tmp_path/"verified-appdata")]
    def resolve(ctx, op):
        assert ctx is context
        return current[0]
    key=tmp_path/"fixture-protected-key.txt"
    key.write_text("fixture-only-local-not-a-real-secret-123456")
    port=W43NativePrivateBrainPort(resolve_current=resolve, local_key_file=key)
    bridge=W43W47PrivateBridge(port)
    return bridge, port, current, context


def args(**overrides):
    return {"profile":{"source":"W54_NATIVE_CURRENT_USER","verified":True,
                       "profileRef":"fixture-pending-w54","appDataRef":"untrusted"},
            "thread":"personal","message":"请继续我们的讨论。",
            "requestId":"fixture-request-123",**overrides}


def add_native_run(runtime,scope,text,run_id="fixture-real-shaped-run-UUID-01",
                   status=RunStatus.completed,answer="真实SDK语义示例，仅模拟回归"):
    sid=scope.session_id("personal")
    runtime.db.upsert_session(AgentSession(
        session_id=sid, user_id=scope.scoped_user_id,
        agent_id=runtime.agents["PRIVATE"].id,
    ))
    out=RunOutput(
        run_id=run_id, session_id=sid, user_id=scope.scoped_user_id,
        agent_id=runtime.agents["PRIVATE"].id, status=status,
        content=answer,
        messages=[Message(role="user",content=text),
                  Message(role="assistant",content=answer)]
    )
    runtime.db.upsert_run(out,session_id=sid,user_id=scope.scoped_user_id,run_index=0)
    return out


def test_bridge_sealed_without_server_context_or_live_w47_issuer(tmp_path):
    b,port,c,ctx=fixture(tmp_path)
    with pytest.raises(W47PrivateAccessError) as e:
        b.runPrivateTurn(args())
    assert e.value.code=="W47_TRUSTED_SERVER_REQUEST_BINDING_REQUIRED"
    with pytest.raises(W47PrivateAccessError):
        b.readNativeHistory({"thread":"personal","profile":{}},trusted_request_context={"actor":"admin"})
    noissuer=W43W47PrivateBridge(W43NativePrivateBrainPort())
    with pytest.raises(W47PrivateAccessError) as e:
        noissuer.readNativeHistory({"thread":"personal","profile":{}},trusted_request_context=ctx)
    assert e.value.http_status==503


def test_approved_dto_is_native_run_backed_and_w47_current_fields(tmp_path,monkeypatch):
    b,p,c,ctx=fixture(tmp_path)
    scope,rt=p._runtime(c[0])
    monkeypatch.setattr(rt,"_authorized_llamacpp_model_matches",lambda:True)
    def sdk_fixture(text, *, user_id,session_id,run_id,metadata):
        assert user_id==scope.scoped_user_id
        assert session_id==scope.session_id("personal")
        native=add_native_run(rt,scope,text,run_id=run_id)
        native.metadata=metadata
        rt.db.upsert_run(native,session_id=session_id,user_id=user_id,run_index=0)
        return native
    monkeypatch.setattr(rt.agents["PRIVATE"],"run",sdk_fixture)
    NativePrivateRequestLedger(p).claim(ctx,thread_id="personal",
        text=args()["message"],request_id=args()["requestId"])
    out=b.runPrivateTurn(args(),trusted_request_context=ctx)
    assert out["status"]=="AGNO_RUN_COMPLETED"
    assert out["outbound"]=="DISABLED"
    assert out["original_response"]=="真实SDK语义示例，仅模拟回归"
    assert out["provenance"]=={
      "type":"AGNO_RUN_RESULT","sdk_pin":"3.1.10",
      "run_id":out["run_id"],
      "session_id":scope.session_id("personal"),
      "source":"LLAMACPP_LOCAL_QWEN3_8B_FREE",
      "model_id":"qwen3:8b","purpose":"QUALITY_EVAL",
      "quality_qualified":False,
    }
    h=b.readNativeHistory({"profile":args()["profile"],"thread":"personal"},
                          trusted_request_context=ctx)
    assert (h["run_count"],h["complete_turn_count"])==(1,1)
    assert [m["role"] for m in h["messages"]]==["user","assistant"]
    assert h["status"]=="HISTORY_PRESENT"


def test_completed_sdk_without_native_original_run_cannot_create_provenance(tmp_path,monkeypatch):
    b,p,c,ctx=fixture(tmp_path)
    scope,rt=p._runtime(c[0])
    monkeypatch.setattr(rt,"_authorized_llamacpp_model_matches",lambda:True)
    monkeypatch.setattr(rt.agents["PRIVATE"],"run",lambda text,**kw: SimpleNamespace(
      status=SimpleNamespace(value="COMPLETED"),
      run_id=kw["run_id"],
      session_id=scope.session_id("personal"),
      content="NEVER_RETURN_UNVERIFIED_CONTENT"))
    NativePrivateRequestLedger(p).claim(ctx,thread_id="personal",
        text=args()["message"],request_id=args()["requestId"])
    with pytest.raises(W47PrivateAccessError) as e:
        b.runPrivateTurn(args(),trusted_request_context=ctx)
    assert e.value.code=="AGNO_NATIVE_PERSISTED_RUN_UNVERIFIED"


def test_w47_client_aliases_not_accepted_by_native_bridge(tmp_path):
    b,p,c,ctx=fixture(tmp_path)
    for bad in [
        {"profile":{},"threadId":"personal","text":"hello","requestId":"fixture-run-123"},
        {"profile":{},"thread":"personal","message":"hello","requestId":"fixture-run-123","principal":"other"},
    ]:
        with pytest.raises(W47PrivateAccessError) as e:
            b.runPrivateTurn(bad,trusted_request_context=ctx)
        assert e.value.http_status==422
    with pytest.raises(W47PrivateAccessError):
        b.readNativeHistory({"profile":{},"threadId":"personal"},trusted_request_context=ctx)


def test_w47_identity_rotation_blocks_native_reply_payload(tmp_path,monkeypatch):
    b,p,current,ctx=fixture(tmp_path)
    scope,rt=p._runtime(current[0])
    monkeypatch.setattr(rt,"_authorized_llamacpp_model_matches",lambda:True)
    def sdk_run(text, *, user_id,session_id,run_id,metadata):
        native=add_native_run(rt,scope,text,run_id=run_id)
        # W47 revocation during original native model execution
        from dataclasses import replace
        current[0]=replace(current[0],revocation_generation=5)
        return native
    monkeypatch.setattr(rt.agents["PRIVATE"],"run",sdk_run)
    NativePrivateRequestLedger(p).claim(ctx,thread_id="personal",
        text=args()["message"],request_id=args()["requestId"])
    with pytest.raises(W47PrivateAccessError) as e:
        b.runPrivateTurn(args(),trusted_request_context=ctx)
    assert e.value.code=="LOCAL_SESSION_CHANGED_OR_REVOKED"
