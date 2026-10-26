"""W43 native Agno SqliteDb private history read/restore and scoped isolation.

Fixture chat data is explicitly synthetic. This proves the history storage
contract, NEVER an actual model-generation pass or a W47 signed Session.
"""
from pathlib import Path
import sys

import pytest
from agno.models.message import Message
from agno.run.agent import RunOutput
from agno.run.base import RunStatus
from agno.session.agent import AgentSession

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from yance_agentos import NativeAgnoRuntime, Scope, ScopeError


def private(account):
    return Scope("SYNTHETIC_TEST_ONLY", account, "PRIVATE")


def contact():
    return Scope("SYNTHETIC_TEST_ONLY", "fixture-private-A", "CONTACT", "FB_PERSONAL", "fake-peer", 1)


def runtime(tmp_path, db=None):
    key = tmp_path / "fixture-api-key"
    key.write_text("synthetic-only-test-key-123456789000")
    return NativeAgnoRuntime(
        db or (tmp_path / "agno-private-chat.sqlite"),
        backend="llamacpp", purpose="QUALITY_EVAL", local_key_file=key,
    )


def test_two_turns_and_native_tool_result_survive_runtime_restart(tmp_path):
    a = private("fixture-private-A")
    sid = a.session_id("personal")
    one = runtime(tmp_path)
    runs = [
        RunOutput(run_id="fake-native-run-1", user_id=a.scoped_user_id, session_id=sid,
                  status=RunStatus.completed,
                  content="建议先完成最重要的一件事。",
                  messages=[
                      Message(role="system", content="DO_NOT_EXPOSE_SYSTEM_INSTRUCTIONS"),
                      Message(role="user", content="你好，今天有什么建议？"),
                      Message(role="assistant", content="建议先完成最重要的一件事。"),
                  ]),
        RunOutput(run_id="fake-native-run-2", user_id=a.scoped_user_id, session_id=sid,
                  status=RunStatus.completed, content="可以先列出三项任务。",
                  messages=[
                      Message(role="user", content="接着说说怎样安排？"),
                      Message(role="assistant", content="我会先检查信息。"),
                      Message(role="tool", content="FAKE_TOOL_RESULT_ONLY", tool_call_id="fake-tool-2"),
                      Message(role="assistant", content="可以先列出三项任务。"),
                  ]),
    ]
    assert one.db.upsert_session(AgentSession(
        session_id=sid, agent_id=one.agents["PRIVATE"].id,
        user_id=a.scoped_user_id, runs=runs,
    ))
    for i, run in enumerate(runs):
        run.agent_id = one.agents["PRIVATE"].id
        one.db.upsert_run(run, session_id=sid, user_id=a.scoped_user_id, run_index=i)
    del one

    fresh = runtime(tmp_path)
    history = fresh.read_private_chat_history(a, thread="personal")
    assert history["status"] == "HISTORY_PRESENT"
    assert history["run_count"] == 2
    assert history["complete_turn_count"] == 2
    assert [item["role"] for item in history["messages"]] == [
        "user", "assistant", "user", "assistant", "tool", "assistant",
    ]
    assert history["messages"][0]["content"] == "你好，今天有什么建议？"
    assert history["messages"][-1]["content"] == "可以先列出三项任务。"
    assert history["messages"][-2]["content"] == "FAKE_TOOL_RESULT_ONLY"
    assert not any("DO_NOT_EXPOSE_SYSTEM" in m["content"] for m in history["messages"])
    assert fresh.read_private_chat_history(private("fixture-private-B"), thread="personal")["status"] == "HISTORY_NOT_FOUND"
    assert fresh.read_private_chat_history(a, thread="another")["status"] == "HISTORY_NOT_FOUND"
    with pytest.raises(ScopeError, match="PRIVATE_SCOPE_REQUIRED"):
        fresh.read_private_chat_history(contact())


def test_sdk_error_records_user_but_does_not_forge_ai_answer(tmp_path):
    a = private("fixture-private-A")
    one = runtime(tmp_path)
    sid = a.session_id()
    failed = RunOutput(
        run_id="fake-sdk-error-run", session_id=sid, user_id=a.scoped_user_id,
        status=RunStatus.error, content="Connection error.",
        messages=[Message(role="user", content="一个真实输入形式的测试问题")],
    )
    one.db.upsert_session(AgentSession(
        session_id=sid, agent_id=one.agents["PRIVATE"].id, user_id=a.scoped_user_id,
    ))
    failed.agent_id = one.agents["PRIVATE"].id
    one.db.upsert_run(failed, session_id=sid, user_id=a.scoped_user_id, run_index=0)
    del one
    fresh = runtime(tmp_path)
    history = fresh.read_private_chat_history(a)
    assert history["run_count"] == 1
    assert history["complete_turn_count"] == 0
    assert len(history["messages"]) == 1
    assert history["messages"][0]["role"] == "user"
    assert not any(msg["role"] == "assistant" for msg in history["messages"])
