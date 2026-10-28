"""Original Agno SQLite expert qualifications, user toggle, W47 native port.

No model network calls and NO phantom experts or social-authority bypass.
The separate eval_expert_team_real.py proves one ACTUAL local Qwen3 Team Run.
"""
from dataclasses import replace
import time, sys
from pathlib import Path
import pytest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from native_experts import NativeExpertDirectory,ExpertNotReady,EXPERTS,BY_ID
from yance_agentos import Scope
from private_principal_port import W43NativePrivateBrainPort,W47VerifiedPrincipal,W47PrivateAccessError

def owner(account="fixture-expert-a"):
    return Scope("SYNTHETIC_TEST_ONLY",account,"PRIVATE")

def store(tmp_path):
    return NativeExpertDirectory(tmp_path/"agno-native.sqlite")

def test_ten_design_categories_exactly_one_limited_installed(tmp_path):
    registry=store(tmp_path)
    result=registry.list(owner())
    assert result["cataloguedCount"]==10
    assert result["installedReadOnlyCount"]==1
    assert len(result["experts"])==10
    assert sum(x["installed"] for x in result["experts"])==1
    assert sum(x["canInvoke"] for x in result["experts"])==1
    live=next(x for x in result["experts"] if x["canInvoke"])
    assert live["expertId"]=="oss-discovery"
    assert live["availableMode"]=="READ_ONLY_STABLE252_INSPECTION"
    assert live["supportsContactBinding"] is False
    assert all(not x["installed"] for x in result["experts"] if x["expertId"]!="oss-discovery")

def test_p2_nine_and_r2_tenth_preserve_labels():
    assert len(EXPERTS)==10 and len(BY_ID)==10
    assert BY_ID["persona-natural-expression"].installed is False
    assert BY_ID["safe-repair-upgrade"].installed is False
    assert BY_ID["german-natural-chat"].label=="德国 WhatsApp 自然聊天专家"

def test_original_same_sqlite_disable_restart_reenable(tmp_path):
    a=owner()
    reg=store(tmp_path)
    s=reg.toggle(a,"oss-discovery",False)
    assert (s["enabled"],s["revision"])==(False,1)
    reloaded=store(tmp_path)
    assert not next(x for x in reloaded.list(a)["experts"] if x["expertId"]=="oss-discovery")["enabled"]
    with pytest.raises(ExpertNotReady,match="EXPERT_DISABLED"):
        reloaded.require_active(a,"oss-discovery")
    s=reloaded.toggle(a,"oss-discovery",True)
    assert (s["enabled"],s["revision"])==(True,2)
    assert reloaded.require_active(a,"oss-discovery").tools==("describe_yance_capability",)
    assert (tmp_path/"agno-native.sqlite").is_file()

def test_user_isolation_for_enabled_state(tmp_path):
    reg=store(tmp_path)
    reg.toggle(owner(),"oss-discovery",False)
    assert next(x for x in reg.list(owner())["experts"] if x["expertId"]=="oss-discovery")["enabled"] is False
    b=owner("fixture-expert-b")
    assert next(x for x in reg.list(b)["experts"] if x["expertId"]=="oss-discovery")["enabled"] is True

@pytest.mark.parametrize("expert_id",[
    "german-natural-chat","europe-language-style","relation-memory",
    "chat-goal-planner","reply-quality-growth","media-conversation",
    "persona-natural-expression","system-health","safe-repair-upgrade",
])
def test_missing_real_upstream_cannot_be_enabled(tmp_path,expert_id):
    reg=store(tmp_path)
    with pytest.raises(ExpertNotReady,match="EXPERT_UPSTREAM_NOT_INSTALLED"):
        reg.toggle(owner(),expert_id,True)
    assert not next(x for x in reg.list(owner())["experts"] if x["expertId"]==expert_id)["canInvoke"]

@pytest.mark.parametrize("value",[1,"true",None,0])
def test_enabled_must_be_boolean(tmp_path,value):
    with pytest.raises(ExpertNotReady,match="EXPERT_ENABLED_VALUE_INVALID"):
        store(tmp_path).toggle(owner(),"oss-discovery",value)

def fake_port(tmp_path):
    root=tmp_path/"w54-own-appdata"
    root.mkdir()
    c=W47VerifiedPrincipal(
        principal_ref="fixture-real-w47-current-user-001",
        installation_ref="fixture-real-w47-install-001",
        session_ref="fixture-current-local-session-001",
        session_revision=1,revocation_generation=1,
        expires_at_ms=int(time.time()*1000)+90000,
        app_local_data_root=root,model_backend="unconfigured",model_id="")
    now=[c];checks=[]
    ctx=object()
    def current(request_context, operation):
        assert request_context is ctx
        checks.append(operation)
        return now[0]
    return W43NativePrivateBrainPort(resolve_current=current),ctx,now,checks

def test_w47_port_read_toggle_without_any_model_or_second_db(tmp_path):
    port,ctx,_,checks=fake_port(tmp_path)
    available=port.expert_directory(ctx)
    assert available["installedReadOnlyCount"]==1
    assert port._runtimes=={}
    off=port.expert_set_enabled(ctx,expert_id="oss-discovery",enabled=False)
    assert off["enabled"] is False
    assert next(x for x in port.expert_directory(ctx)["experts"] if x["expertId"]=="oss-discovery")["enabled"] is False
    assert port.expert_set_enabled(ctx,expert_id="oss-discovery",enabled=True)["enabled"]
    assert "PRIVATE_HISTORY" in checks and "PRIVATE_TURN" in checks
    assert port._runtimes=={}

def test_no_untrusted_principal_any_expert_entry():
    port=W43NativePrivateBrainPort()
    for f in (
        lambda:port.expert_directory(object()),
        lambda:port.expert_set_enabled(object(),expert_id="oss-discovery",enabled=True),
        lambda:port.expert_turn(object(),thread_id="personal",
            request_id="fake_req_12345",expert_id="oss-discovery",stable_id="A01")
    ):
        with pytest.raises(W47PrivateAccessError,match="W47_TRUSTED_PRINCIPAL_NOT_CONNECTED"):
            f()

def test_port_disallows_contact_global_binding_without_w45_proof(tmp_path):
    port,ctx,_,_=fake_port(tmp_path)
    for scope in ("THIS_CONTACT","GLOBAL_DEFAULT"):
        with pytest.raises(W47PrivateAccessError,match="W45_CONTACT_SCOPE_BINDING_NOT_CONNECTED"):
            port.expert_turn(ctx,thread_id="personal",request_id="fake_req_12345",
                             expert_id="oss-discovery",stable_id="A01",usage_scope=scope)

def test_port_rejects_uninstalled_before_model_run(tmp_path):
    port,ctx,_,_=fake_port(tmp_path)
    with pytest.raises(W47PrivateAccessError,match="EXPERT_UPSTREAM_NOT_INSTALLED"):
        port.expert_turn(ctx,thread_id="personal",request_id="fake_req_12345",
                         expert_id="safe-repair-upgrade",stable_id="A01")
    assert port._runtimes=={}

def test_port_rejects_disabled_before_model_run(tmp_path):
    port,ctx,_,_=fake_port(tmp_path)
    port.expert_set_enabled(ctx,expert_id="oss-discovery",enabled=False)
    with pytest.raises(W47PrivateAccessError,match="EXPERT_DISABLED"):
        port.expert_turn(ctx,thread_id="personal",request_id="fake_req_12345",
                         expert_id="oss-discovery",stable_id="A01")
    assert port._runtimes=={}

def test_revoked_epoch_prevents_expert_directory_visibility(tmp_path):
    port,ctx,now,checks=fake_port(tmp_path)
    now[0]=replace(now[0],status="REVOKED")
    with pytest.raises(W47PrivateAccessError) as exc:
        port.expert_directory(ctx)
    assert exc.value.http_status==401
