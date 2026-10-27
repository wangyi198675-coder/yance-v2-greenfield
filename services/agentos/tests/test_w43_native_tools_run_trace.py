"""W43 Issue #77 read-only native Agno Tools/Run/Trace and approval tests.

All temporary entries use original Agno 3.1.10 dataclasses + SqliteDb.
Synthetic receipts are NEVER described as real SDK model/tool successes.
"""
from pathlib import Path
from dataclasses import replace
import sys
import pytest

from agno.db.sqlite import SqliteDb
from agno.models.message import Message
from agno.models.response import ToolExecution
from agno.run.agent import RunOutput
from agno.run.base import RunStatus
from agno.session.agent import AgentSession

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from yance_agentos import Scope
from native_inspection import (
    NativeAgnoReadback, NativeInspectionAccessError, native_tool_directory,
)


@pytest.fixture
def native_fixture(tmp_path):
    db=SqliteDb(db_file=str(tmp_path/"original-agno.sqlite"))
    owner=Scope("SYNTHETIC_TEST_ONLY","fixture-native-inspection-A","PRIVATE")
    another=Scope("SYNTHETIC_TEST_ONLY","fixture-native-inspection-B","PRIVATE")
    session=owner.session_id("personal")
    db.upsert_session(AgentSession(session_id=session,user_id=owner.scoped_user_id,
                                    agent_id="w43-private-brain"))
    tool=ToolExecution(
        tool_call_id="fake-tool-call-001",tool_name="describe_yance_capability",
        tool_args={"stable_id":"A01"},result='{"status":"DECLARED_NOT_AUTHORIZED_FOR_EXECUTION"}',
        requires_confirmation=False,
    )
    run=RunOutput(
        run_id="fake-run-TEST-PERSISTED-001",session_id=session,
        user_id=owner.scoped_user_id,agent_id="w43-private-brain",
        status=RunStatus.completed,content="FAKE-ONLY-FINAL",
        tools=[tool],messages=[
            Message(role="system",content="HIDDEN_SYSTEM_PROMPT_TEST_ONLY"),
            Message(role="user",content="FAKE-ONLY-INPUT"),
            Message(role="assistant",content="",tool_calls=[{
                "id":tool.tool_call_id,"type":"function",
                "function":{"name":"describe_yance_capability",
                            "arguments":'{"stable_id":"A01"}'},
            }]),
            Message(role="tool",content=tool.result,tool_call_id=tool.tool_call_id),
            Message(role="assistant",content="FAKE-ONLY-FINAL"),
        ],
    )
    db.upsert_run(run,session_id=session,user_id=owner.scoped_user_id,run_index=0)
    return db,owner,another,run


def test_252_registered_is_distinct_from_native_tools_and_approval():
    data=native_tool_directory()
    assert data["stableIdCount"]==252
    assert len(data["registeredTools"])==3
    assert all(not r["executable"] for r in data["capabilities"])
    assert any(r["stableId"]=="A01" for r in data["capabilities"])
    names={r["name"]:r for r in data["registeredTools"]}
    assert names["describe_yance_capability"]["canInvoke"]
    assert names["describe_yance_capability"]["readOnly"]
    assert not names["describe_yance_capability"]["businessExecutable"]
    assert names["review_synthetic_draft"]["requiresApproval"]
    assert not names["review_synthetic_draft"]["canInvoke"]


def test_native_persisted_run_and_matching_tool_result(native_fixture):
    db,owner,another,run=native_fixture
    reader=NativeAgnoReadback(db)
    listing=reader.list_runs(owner,thread="personal")
    assert len(listing["runs"])==1
    assert listing["runs"][0]["runId"]==run.run_id
    assert listing["runs"][0]["toolCallCount"]==1
    item=reader.get_run(owner,thread="personal",run_id=run.run_id)
    assert item["status"]=="COMPLETED"
    assert item["answer"]=="FAKE-ONLY-FINAL"
    assert item["tools"][0]["status"]=="SDK_TOOL_RESULT_PERSISTED"
    assert item["tools"][0]["runId"]==run.run_id
    assert item["tools"][0]["businessSucceeded"] is False
    assert "HIDDEN_SYSTEM_PROMPT" not in str(item)
    assert "HIDDEN_SYSTEM_PROMPT" not in str(listing)


def test_scope_and_thread_cannot_enumerate_run(native_fixture):
    db,owner,another,run=native_fixture
    reader=NativeAgnoReadback(db)
    assert reader.list_runs(another,thread="personal")["runs"]==[]
    assert reader.list_runs(owner,thread="another")["runs"]==[]
    with pytest.raises(NativeInspectionAccessError,match="RUN_NOT_FOUND_IN_PRIVATE_SCOPE"):
        reader.get_run(another,thread="personal",run_id=run.run_id)
    with pytest.raises(NativeInspectionAccessError,match="RUN_NOT_FOUND_IN_PRIVATE_SCOPE"):
        reader.get_trace(another,thread="personal",run_id=run.run_id)
    with pytest.raises(NativeInspectionAccessError,match="RUN_NOT_FOUND_IN_PRIVATE_SCOPE"):
        reader.get_run(owner,thread="another",run_id=run.run_id)
    with pytest.raises(NativeInspectionAccessError,match="RUN_NOT_FOUND_IN_PRIVATE_SCOPE"):
        reader.get_trace(owner,thread="another",run_id=run.run_id)


def test_missing_trace_must_not_be_fabricated(native_fixture):
    db,owner,another,run=native_fixture
    result=NativeAgnoReadback(db).get_trace(
        owner,thread="personal",run_id=run.run_id)
    assert result["status"]=="NATIVE_TRACE_NOT_FOUND"
    assert result["traceCount"]==0
    assert result["traces"]==[]
    assert result["noTraceFabricated"] is True


def test_missing_tool_message_does_not_count_as_native_execution(native_fixture):
    db,owner,another,run=native_fixture
    run.messages=[m for m in run.messages if m.role!="tool"]
    db.upsert_run(run,session_id=run.session_id,user_id=run.user_id,run_index=0)
    item=NativeAgnoReadback(db).get_run(owner,thread="personal",run_id=run.run_id)
    assert item["tools"][0]["status"]=="SDK_TOOL_RESULT_NOT_PROVEN"
    assert item["tools"][0]["hasPersistedResult"] is False


def test_native_approval_paused_is_not_autoapproved(native_fixture):
    db,owner,another,run=native_fixture
    pending=ToolExecution(
        tool_call_id="fake-approval-awaiting-user",
        tool_name="review_synthetic_draft",tool_args={"draft_id":"fake-001"},
        requires_confirmation=True,confirmed=False,result=None,
    )
    run.status=RunStatus.paused
    run.tools=[pending]
    run.content=None
    db.upsert_run(run,session_id=run.session_id,user_id=run.user_id,run_index=0)
    item=NativeAgnoReadback(db).get_run(owner,thread="personal",run_id=run.run_id)
    assert item["status"]=="PAUSED"
    assert item["requiresApproval"]
    assert item["approval"]=="WAITING_FOR_HUMAN_NOT_AUTO_EXECUTED"
    assert item["tools"][0]["status"]=="WAITING_USER_APPROVAL"
    assert item["tools"][0]["approved"] is False
    assert item["answer"] is None
    assert item["tools"][0]["businessSucceeded"] is False


@pytest.mark.parametrize("bad",["","../private","x"*129,None])
def test_run_list_rejects_invalid_thread(native_fixture,bad):
    db,owner,_,run=native_fixture
    with pytest.raises(NativeInspectionAccessError):
        NativeAgnoReadback(db).list_runs(owner,thread=bad)


def test_run_limit_fail_closed(native_fixture):
    db,owner,_,run=native_fixture
    for limit in [0,101,None,True]:
        with pytest.raises(NativeInspectionAccessError):
            NativeAgnoReadback(db).list_runs(owner,thread="personal",limit=limit)


def test_real_native_prior_qwen_tool_run_if_available():
    """Machine-specific real readback, skipped on hosts without signed QA DB."""
    import os
    root=Path(os.environ.get("LOCALAPPDATA",str(Path.home())))/"YanceV2"/"W43"/"qa-real-capability"
    pathlist=list(root.glob("synthetic-real-tool-*.sqlite"))
    if not pathlist: pytest.skip("Original real Agno Qwen3 fixture DB not mounted")
    owner=Scope("SYNTHETIC_TEST_ONLY","fixture-issue61-tool-A","PRIVATE")
    rid="c5be45a1-921b-431e-9b3b-d1453691e0dc"
    for path in pathlist:
        db=SqliteDb(db_file=str(path))
        if not db.get_run(rid):continue
        adapter=NativeAgnoReadback(db)
        actual=adapter.get_run(owner,thread="capability-tool",run_id=rid)
        trace=adapter.get_trace(owner,thread="capability-tool",run_id=rid)
        assert actual["status"]=="COMPLETED"
        assert actual["tools"][0]["status"]=="SDK_TOOL_RESULT_PERSISTED"
        assert trace["traceCount"]==1
        assert trace["traces"][0]["totalSpans"]==4
        assert len(trace["traces"][0]["spans"])==4
        assert all("attributes" not in str(s) for s in trace["traces"][0]["spans"])
        return
    pytest.skip("Exact original Qwen3 Run ID absent on this host")


def test_existing_w43_private_port_exposes_model_free_native_run_and_tools(tmp_path):
    from private_principal_port import W43NativePrivateBrainPort, W47VerifiedPrincipal
    import time
    root=tmp_path/"W54_FAKE_PRIVATE_ROOT"
    root.mkdir()
    claim=W47VerifiedPrincipal(
        principal_ref="fixture-user-W43-native-readback",
        installation_ref="fixture-install-W43-native-readback",
        session_ref="fixture-session-W43-native-readback",
        session_revision=2,revocation_generation=2,
        expires_at_ms=int(time.time()*1000)+120000,
        app_local_data_root=root,
        model_backend="unconfigured",model_id="",
    )
    server_context=object()
    checks=[]
    def verifier(current,operation):
        assert current is server_context
        checks.append(operation)
        return claim
    port=W43NativePrivateBrainPort(resolve_current=verifier)
    directory=port.native_tools(server_context)
    assert directory["stableIdCount"]==252
    scoped,file=port._native_storage(claim)
    original=SqliteDb(db_file=str(file))
    session=scoped.session_id("personal")
    original.upsert_session(AgentSession(
        session_id=session,user_id=scoped.scoped_user_id,
        agent_id="w43-private-brain",
    ))
    output=RunOutput(
        run_id="fixture-native-original-Run-0001",session_id=session,
        user_id=scoped.scoped_user_id,agent_id="w43-private-brain",
        status=RunStatus.completed,content="FAKE_OWNER_ANSWER",
        messages=[
            Message(role="user",content="FAKE QUESTION"),
            Message(role="assistant",content="FAKE_OWNER_ANSWER"),
        ],
    )
    original.upsert_run(output,session_id=session,user_id=scoped.scoped_user_id,run_index=0)
    listing=port.native_runs(server_context,thread_id="personal")
    assert listing["runs"][0]["runId"]==output.run_id
    actual=port.native_run(server_context,thread_id="personal",run_id=output.run_id)
    assert actual["answer"]=="FAKE_OWNER_ANSWER"
    assert port.native_trace(server_context,thread_id="personal",run_id=output.run_id)["traceCount"]==0
    assert port._runtimes=={}  # no local/cloud Model constructed
    assert len(checks)>=8
    assert set(checks)=={"PRIVATE_HISTORY"}


def test_native_port_rejects_unconnected_principal_for_tools_runs_trace():
    from private_principal_port import W43NativePrivateBrainPort, W47PrivateAccessError
    p=W43NativePrivateBrainPort()
    ctx=object()
    for method in [
        lambda:p.native_tools(ctx),
        lambda:p.native_runs(ctx,thread_id="personal"),
        lambda:p.native_run(ctx,thread_id="personal",run_id="fixture-run-001"),
        lambda:p.native_trace(ctx,thread_id="personal",run_id="fixture-run-001"),
    ]:
        with pytest.raises(W47PrivateAccessError,match="W47_TRUSTED_PRINCIPAL_NOT_CONNECTED"):
            method()


def test_native_private_port_rechecks_revoked_mid_read(tmp_path,monkeypatch):
    from private_principal_port import W43NativePrivateBrainPort,W47VerifiedPrincipal,W47PrivateAccessError
    import time
    root=tmp_path/"W54_PRIVATE_USER"
    root.mkdir()
    grant=W47VerifiedPrincipal(
        principal_ref="fixture-user-revoke-0001",
        installation_ref="fixture-install-revoke-0001",
        session_ref="fixture-session-revoke-0001",
        session_revision=3,revocation_generation=1,
        expires_at_ms=int(time.time()*1000)+120000,
        app_local_data_root=root,model_backend="unconfigured",model_id="",
    )
    current=[grant]
    port=W43NativePrivateBrainPort(resolve_current=lambda *_:current[0])
    original=NativeAgnoReadback.list_runs
    def read_and_expire(self,scope,*,thread,limit):
        rows=original(self,scope,thread=thread,limit=limit)
        current[0]=replace(grant,revocation_generation=2)
        return rows
    monkeypatch.setattr(NativeAgnoReadback,"list_runs",read_and_expire)
    with pytest.raises(W47PrivateAccessError,match="LOCAL_SESSION_CHANGED_OR_REVOKED"):
        port.native_runs(object(),thread_id="personal")


def test_orphan_tool_receipt_without_model_function_call_not_proven(native_fixture):
    db,owner,_,run=native_fixture
    run.messages=[
        m for m in run.messages
        if not (m.role=="assistant" and getattr(m,"tool_calls",None))
    ]
    db.upsert_run(run,session_id=run.session_id,user_id=run.user_id,run_index=0)
    item=NativeAgnoReadback(db).get_run(owner,thread="personal",run_id=run.run_id)
    assert item["tools"][0]["status"]=="SDK_TOOL_RESULT_NOT_PROVEN"
    assert item["tools"][0]["hasPersistedResult"] is False
