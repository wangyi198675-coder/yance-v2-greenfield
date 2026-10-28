"""W43 normal PRIVATE owner history with NO local/cloud model configured.

Official Agno SqliteDb/RunOutput, no model engine constructed or billed.
All owners and data are disposable fake fixtures; source-only tests.
"""
from dataclasses import replace
from pathlib import Path
import sys
import time

import pytest
from agno.db.sqlite import SqliteDb
from agno.session.agent import AgentSession
from agno.run.agent import RunOutput
from agno.run.base import RunStatus
from agno.models.message import Message

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from private_principal_port import (
    W43NativePrivateBrainPort, W47PrivateAccessError, W47VerifiedPrincipal,
)


class LocalHostContext:
    pass


def setup(tmp_path):
    root=tmp_path/"real-agno-native-db-disposable"
    root.mkdir()
    claim=W47VerifiedPrincipal(
        principal_ref="fixture-local-person-0001",
        installation_ref="fixture-local-install-0001",
        session_ref="fixture-host-session-0001",
        session_revision=3,
        revocation_generation=2,
        expires_at_ms=int(time.time()*1000)+120000,
        app_local_data_root=root,
        model_backend="unconfigured", model_id="",
    )
    current=[claim]
    ctx=LocalHostContext()
    checks=[]
    def verifier(context,operation):
        checks.append(operation)
        assert context is ctx
        return current[0]
    port=W43NativePrivateBrainPort(resolve_current=verifier)
    return port, current, ctx, checks


def save_native_agno_turn(port,claim,thread="personal"):
    scope, path=port._native_storage(claim)
    db=SqliteDb(db_file=str(path))
    session=scope.session_id(thread)
    db.upsert_session(AgentSession(
        session_id=session,agent_id="w43-private-brain",
        user_id=scope.scoped_user_id,
    ))
    db.upsert_run(RunOutput(
        run_id="fixture-native-run-001",user_id=scope.scoped_user_id,
        session_id=session,agent_id="w43-private-brain",
        status=RunStatus.completed,content="FAKE_AGNO_ANSWER",
        messages=[
            Message(role="user",content="FAKE_USER_INPUT"),
            Message(role="tool",content="FAKE_TOOL_NOT_AUTHORIZED",tool_call_id="fixture"),
            Message(role="assistant",content="FAKE_AGNO_ANSWER"),
        ],
    ),session_id=session,user_id=scope.scoped_user_id,run_index=0)
    return path


def test_no_model_config_can_read_real_agno_sqlite_history(tmp_path):
    port,current,ctx,checks=setup(tmp_path)
    db_file=save_native_agno_turn(port,current[0])
    assert db_file.is_file()
    history=port.history(ctx,thread_id="personal")
    assert history["status"]=="HISTORY_PRESENT"
    assert history["completeTurnCount"]==1 and history["runCount"]==1
    assert [m["role"] for m in history["messages"]]==["user","tool","assistant"]
    assert [m["content"] for m in history["messages"]]==[
        "FAKE_USER_INPUT","FAKE_TOOL_NOT_AUTHORIZED","FAKE_AGNO_ANSWER"]
    assert port._runtimes=={}   # no inference SDK/model initialized
    assert checks.count("PRIVATE_HISTORY") >= 2


def test_unconfigured_model_denies_turn_but_not_history(tmp_path):
    port,current,ctx,_=setup(tmp_path)
    assert port.history(ctx,thread_id="personal")["status"]=="HISTORY_NOT_FOUND"
    with pytest.raises(W47PrivateAccessError) as exc:
        port.turn(ctx,thread_id="personal",text="私人聊天",
                  request_id="fixture-request-001")
    assert (exc.value.code,exc.value.http_status)==("MODEL_SETUP_REQUIRED",503)
    assert port._runtimes=={}


def test_model_change_and_credential_missing_does_not_erase_history(tmp_path):
    port,current,ctx,_=setup(tmp_path)
    original=save_native_agno_turn(port,current[0])
    current[0]=replace(current[0],model_backend="llamacpp",model_id="qwen3:8b")
    assert port.history(ctx,thread_id="personal")["completeTurnCount"]==1
    current[0]=replace(
        current[0],model_backend="openrouter",model_id="openai/gpt-4o-mini",
        model_selection_epoch=3,model_user_selected=True,
        extra_charge_approved=True,protected_credential_attested=True,
        cloud_key_file=tmp_path/"W55_KEY_NOT_SET",
    )
    assert port.history(ctx,thread_id="personal")["completeTurnCount"]==1
    assert original.is_file()
    assert port._runtimes=={}  # fake missing cloud key did not trigger billing


def test_no_model_history_denies_another_user_or_thread(tmp_path):
    port,current,ctx,_=setup(tmp_path)
    save_native_agno_turn(port,current[0])
    assert port.history(ctx,thread_id="other")["status"]=="HISTORY_NOT_FOUND"
    current[0]=replace(current[0],principal_ref="fixture-local-person-0002")
    result=port.history(ctx,thread_id="personal")
    assert result["status"]=="HISTORY_NOT_FOUND"
    assert result["messages"]==[]


def test_no_model_history_respects_current_logout_and_epoch(tmp_path,monkeypatch):
    port,current,ctx,_=setup(tmp_path)
    save_native_agno_turn(port,current[0])
    current[0]=replace(current[0],status="REVOKED")
    with pytest.raises(W47PrivateAccessError) as exc:
        port.history(ctx,thread_id="personal")
    assert exc.value.http_status==401
    current[0]=replace(current[0],status="VERIFIED")
    from yance_agentos import NativeAgnoRuntime
    original=NativeAgnoRuntime.read_native_private_history
    def changed_model_epoch(db,scope,*,thread):
        current[0]=replace(current[0],model_selection_epoch=4)
        return original(db,scope,thread=thread)
    monkeypatch.setattr(NativeAgnoRuntime,"read_native_private_history",
                        staticmethod(changed_model_epoch))
    with pytest.raises(W47PrivateAccessError) as exc:
        port.history(ctx,thread_id="personal")
    assert exc.value.http_status==409
