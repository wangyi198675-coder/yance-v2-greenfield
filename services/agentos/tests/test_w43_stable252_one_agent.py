"""ONE official Agno Agent; 252 StableID is catalogue, not execution."""
import json
import sys
from pathlib import Path
import pytest
from agno.agent import Agent
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from capability_catalog import stable_catalog, describe_yance_capability
from yance_agentos import NativeAgnoRuntime, Scope

def test_real_v2_stable_id_source_is_full_directory():
    entries=stable_catalog()
    assert len(entries)==252
    assert "A01" in entries
    assert all(not item["executable"] for item in entries.values())
    assert all(item["qualification"]=="CATALOG_ONLY_REQUIRES_REAL_UPSTREAM_AND_OWNER_AUTHORIZATION" for item in entries.values())

def test_catalogue_only_native_agno_tool_never_claims_upstream_success():
    assert describe_yance_capability.name=="describe_yance_capability"
    result=json.loads(describe_yance_capability.entrypoint("A01"))
    assert result["status"]=="DECLARED_NOT_AUTHORIZED_FOR_EXECUTION"
    assert result["executable"] is False
    assert json.loads(describe_yance_capability.entrypoint("A999"))["status"]=="STABLE_ID_NOT_REGISTERED"

def test_exactly_one_native_agent_with_shared_private_and_contact_scoped_history(tmp_path):
    key=tmp_path/"offline-key"
    key.write_text("synthetic-never-real-protected-key-123456789")
    rt=NativeAgnoRuntime(tmp_path/"agno.sqlite",backend="llamacpp",model_id="qwen3:8b",
                         local_key_file=key,purpose="QUALITY_EVAL")
    assert isinstance(rt.agents["PRIVATE"],Agent)
    assert rt.agents["PRIVATE"] is rt.agents["CONTACT"]
    assert rt.agents["PRIVATE"].id=="w43-private-brain"
    p=Scope("SYNTHETIC_TEST_ONLY","fixture-A","PRIVATE")
    c=Scope("SYNTHETIC_TEST_ONLY","fixture-A","CONTACT","FB_PERSONAL","fake-peer",1)
    assert p.scoped_user_id!=c.scoped_user_id
    assert p.session_id("same")!=c.session_id("same")
    assert rt.agents["PRIVATE"].db is rt.db
    assert any(t.name=="describe_yance_capability" for t in rt.agents["PRIVATE"].tools)


def test_official_agno_tool_call_executes_catalogue_and_not_upstream(tmp_path):
    """Agno's own Run -> selected function_call -> tool receipt, mock LLM only."""
    import httpx
    from openai import OpenAI
    key=tmp_path/"mocked-user-cloud-key-NOT-REAL"
    key.write_text("fixture-credential-no-paid-calls-123456")
    runtime=NativeAgnoRuntime(
        tmp_path/"agno-tool.sqlite",backend="openai",model_id="gpt-4o-mini",
        cloud_key_file=key,user_selected=True,extra_charge_approved=True,
        protected_credential_attested=True,purpose="QUALITY_EVAL",
    )
    seen=[]
    def respond(request):
        import json
        payload=json.loads(request.content)
        seen.append(payload)
        message=(
            {"role":"assistant","content":None,
             "tool_calls":[{"id":"call_capability_A01","type":"function",
                "function":{"name":"describe_yance_capability","arguments":'{"stable_id":"A01"}'}}]}
            if len(seen)==1 else
            {"role":"assistant","content":"StableID A01 is listed but not executable."}
        )
        return httpx.Response(200,json={
            "id":f"chatcmpl-fixture-{len(seen)}","object":"chat.completion",
            "created":1738000000,"model":"gpt-4o-mini",
            "choices":[{"index":0,"message":message,
                        "finish_reason":"tool_calls" if len(seen)==1 else "stop"}],
            "usage":{"prompt_tokens":30,"completion_tokens":11,"total_tokens":41},
        })
    with httpx.Client(transport=httpx.MockTransport(respond),timeout=5.0) as client:
        runtime.model.client=OpenAI(
            api_key=key.read_text(),
            base_url="https://api.openai.com/v1",
            http_client=client,max_retries=0)
        scope=Scope("SYNTHETIC_TEST_ONLY","fixture-A","PRIVATE")
        result=runtime.agents["PRIVATE"].run(
            "fake-Explain StableID A01 capability eligibility",
            user_id=scope.scoped_user_id,session_id=scope.session_id("catalogue"),
        )
    assert result.status.value=="COMPLETED"
    assert len(seen)==2
    tool_messages=[m for m in seen[1]["messages"] if m.get("role")=="tool"]
    assert tool_messages and "DECLARED_NOT_AUTHORIZED_FOR_EXECUTION" in tool_messages[0]["content"]
    assert "executable" in tool_messages[0]["content"]
    assert result.run_id and runtime.db.get_runs(
        session_id=scope.session_id("catalogue"),
        user_id=scope.scoped_user_id,agent_id=runtime.agents["PRIVATE"].id)
