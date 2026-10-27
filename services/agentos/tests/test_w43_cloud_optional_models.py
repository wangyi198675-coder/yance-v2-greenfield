"""W43 official Agno OpenRouter/OpenAI API + optional llama.cpp selection.

Every cloud call in this file uses an in-memory HTTPS httpx MockTransport.
FAKE cloud replies are NEVER treated as real paid-provider/quality evidence.
"""
import json
import os
from pathlib import Path
import sys
from dataclasses import replace
import pytest

import httpx
from openai import OpenAI
from agno.models.openrouter import OpenRouter
from agno.models.openai import OpenAIChat

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from yance_agentos import NativeAgnoRuntime, LocalOnlyError, Scope
from private_principal_port import (
    W43NativePrivateBrainPort, W47VerifiedPrincipal, W47PrivateAccessError,
)
from private_request_identity import request_identity
from model_policy import classify_provider

FAKE_KEY = "fixture-protected-API-key-not-real-123456"


def cred(tmp_path):
    file = tmp_path / "W55_FAKE_KEY_NOT_REAL"
    file.write_text(FAKE_KEY, encoding="utf-8")
    return file


def native(tmp_path, backend, model, credential=None, **kwargs):
    return NativeAgnoRuntime(
        tmp_path / "original-agno-chat.sqlite",
        backend=backend, model_id=model, purpose="QUALITY_EVAL",
        cloud_key_file=credential, user_selected=True,
        extra_charge_approved=True, protected_credential_attested=True,
        **kwargs,
    )


@pytest.mark.parametrize("backend,model,cls,url", [
    ("openrouter", "openai/gpt-4o-mini", OpenRouter, "https://openrouter.ai/api/v1"),
    ("openai", "gpt-4o-mini", OpenAIChat, "https://api.openai.com/v1"),
])
def test_official_cloud_class_no_qwen_dependency(tmp_path, monkeypatch, backend, model, cls, url):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    run = native(tmp_path, backend, model, credential=cred(tmp_path))
    assert isinstance(run.model, cls)
    assert run.model.id == model
    assert str(run.model.base_url).rstrip("/") == url
    assert run.agents["PRIVATE"].db is run.db
    assert run.agents["PRIVATE"].id == "w43-private-brain"
    assert run._selected_model_ready() is True  # no local Qwen lookup
    assert run.capability_report()["model_policy"]["allow_call"] is True
    assert run.capability_report()["run"] == "CLOUD_SELECTED_REAL_RUN_REQUIRES_EVIDENCE"
    if backend == "openrouter":
        assert run.model.extra_body["provider"]["allow_fallbacks"] is False
        assert run.model.models is None
    run.model.api_key = "REDACTED"  # local test, key not written into receipts


def test_cloud_requires_explicit_approved_protected_credential(tmp_path, monkeypatch):
    key=cred(tmp_path)
    for kwargs in [
        {"user_selected": False, "extra_charge_approved": True, "protected_credential_attested": True},
        {"user_selected": True, "extra_charge_approved": False, "protected_credential_attested": True},
        {"user_selected": True, "extra_charge_approved": True, "protected_credential_attested": False},
        {"user_selected": True, "extra_charge_approved": True, "protected_credential_attested": True, "cloud_key_file": None},
    ]:
        values=dict(backend="openrouter",model_id="openai/gpt-4o-mini",
                    purpose="QUALITY_EVAL",cloud_key_file=key)
        values.update(kwargs)
        with pytest.raises(LocalOnlyError):
            NativeAgnoRuntime(tmp_path/"fail.sqlite",**values)
    assert not classify_provider("OTHER_EXPLICIT", "QUALITY_EVAL",
             user_explicitly_selected=True, extra_charge_approved=True).allow_call
    assert classify_provider("OTHER_EXPLICIT", "QUALITY_EVAL",
             user_explicitly_selected=True, extra_charge_approved=True,
             provider_native_grant_attested=True,
             credential_source_verified=True).allow_call
    with pytest.raises(LocalOnlyError,match="CUSTOM_CLOUD_ENDPOINT"):
        native(tmp_path,"openai","gpt-4o-mini",credential=key,host="http://127.0.0.1:11605")
    with pytest.raises(LocalOnlyError):
        native(tmp_path,"openrouter","../forged/credential",credential=key)
    key.unlink()
    with pytest.raises(LocalOnlyError):
        native(tmp_path,"openai","gpt-4o-mini",credential=key)


def test_cloud_key_removal_revokes_cached_sdk_runtime(tmp_path):
    key=cred(tmp_path)
    run=native(tmp_path,"openrouter","openai/gpt-4o-mini",credential=key)
    assert run._selected_model_ready()
    key.unlink()
    assert not run._selected_model_ready()
    assert run.backend == "openrouter"


def test_selected_provider_switch_preserves_same_private_session_db(tmp_path):
    key=cred(tmp_path)
    a=native(tmp_path,"openrouter","openai/gpt-4o-mini",credential=key)
    b=native(tmp_path,"openai","gpt-4o-mini",credential=key)
    scope=Scope("SYNTHETIC_TEST_ONLY","fixture-operator-A","PRIVATE")
    assert a.agents["PRIVATE"].id == b.agents["PRIVATE"].id
    assert a.db_file == b.db_file
    assert scope.session_id("same-thread") == scope.session_id("same-thread")
    assert a.model.id != b.model.id
    assert a.model.id != "qwen3:8b"
    assert a.db is not b.db  # independently constructed official Agno Db object


def _native_model_mock(runtime, model_reply, captured):
    """Patch SDK's official OpenAI client transport, not Agno Agent.run."""
    def handle(request):
        assert request.url.host in ("openrouter.ai","api.openai.com")
        assert request.headers.get("authorization") == "Bearer " + FAKE_KEY
        body=json.loads(request.content)
        captured.append({"path":str(request.url), "body":body})
        return httpx.Response(200, json={
            "id":"chatcmpl-mocked-999","object":"chat.completion",
            "created":1738000000,"model":runtime.model_id,
            "choices":[{"index":0,"message":{"role":"assistant","content":model_reply},"finish_reason":"stop"}],
            "usage":{"prompt_tokens":35,"completion_tokens":12,"total_tokens":47},
        })
    client=httpx.Client(transport=httpx.MockTransport(handle),timeout=10.0)
    runtime.model.client=OpenAI(api_key=FAKE_KEY,base_url=str(runtime.model.base_url),
                               http_client=client,max_retries=0)
    return client


def test_two_official_agno_cloud_sdk_runs_model_switch_same_sqlite_and_restart(tmp_path, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    key=cred(tmp_path)
    sc=Scope("SYNTHETIC_TEST_ONLY","fixture-operator-B","PRIVATE")
    session=sc.session_id("shared-thread")
    first=native(tmp_path,"openrouter","openai/gpt-4o-mini",credential=key)
    captured=[]
    with _native_model_mock(first,"FAKE_ROUTER_REPLY_1",captured):
        result1=first.agents["PRIVATE"].run(
            "fake-First test message",user_id=sc.scoped_user_id,session_id=session)
    assert getattr(result1.status,"value",None)=="COMPLETED"
    assert result1.content == "FAKE_ROUTER_REPLY_1"
    assert result1.run_id
    assert first.db.get_session(session,user_id=sc.scoped_user_id)
    assert captured[0]["body"]["model"] == "openai/gpt-4o-mini"
    assert captured[0]["body"]["provider"]["allow_fallbacks"] is False

    second=native(tmp_path,"openai","gpt-4o-mini",credential=key)
    with _native_model_mock(second,"FAKE_OPENAI_REPLY_2",captured):
        result2=second.agents["PRIVATE"].run(
            "fake-Follow-up after selected provider switch",
            user_id=sc.scoped_user_id,session_id=session)
    assert getattr(result2.status,"value",None)=="COMPLETED"
    assert result2.content == "FAKE_OPENAI_REPLY_2"
    assert result2.run_id != result1.run_id
    del second

    restarted=native(tmp_path,"openrouter","openai/gpt-4o-mini",credential=key)
    history=restarted.read_private_chat_history(sc,thread="shared-thread")
    assert history["complete_turn_count"]==2,history
    assert history["run_count"]==2
    assert any(m["content"]=="FAKE_ROUTER_REPLY_1" for m in history["messages"])
    assert any(m["content"]=="FAKE_OPENAI_REPLY_2" for m in history["messages"])
    other=Scope("SYNTHETIC_TEST_ONLY","fixture-operator-C","PRIVATE")
    assert restarted.read_private_chat_history(other,thread="shared-thread")["messages"] == []
    assert restarted.read_private_chat_history(sc,thread="different")["messages"] == []
    assert all(c["path"].startswith("https://") for c in captured)


def test_trusted_w47_model_change_does_not_change_private_user_db(tmp_path):
    root=tmp_path/"W54_FAKE_ROOT";root.mkdir()
    credfile=cred(tmp_path)
    from private_principal_port import W43NativePrivateBrainPort
    claim=W47VerifiedPrincipal(
        principal_ref="fixture-user-12345678",
        installation_ref="fixture-install-12345678",
        session_ref="fixture-session-12345678",
        session_revision=1, revocation_generation=1,
        expires_at_ms=9999999999999,
        app_local_data_root=root, model_backend="openrouter",
        model_id="openai/gpt-4o-mini",cloud_key_file=credfile,
        model_user_selected=True,extra_charge_approved=True,
        protected_credential_attested=True,model_selection_epoch=1,
    )
    current=[claim]
    port=W43NativePrivateBrainPort(resolve_current=lambda _,op:current[0])
    sc1,first=port._runtime(port._verified(object(),"PRIVATE_HISTORY"))
    current[0]=replace(claim,model_backend="openai",model_id="gpt-4o-mini",model_selection_epoch=2)
    sc2,second=port._runtime(port._verified(object(),"PRIVATE_HISTORY"))
    assert sc1.scoped_user_id == sc2.scoped_user_id
    assert sc1.session_id("personal") == sc2.session_id("personal")
    assert first.db_file == second.db_file
    assert first.model.id != second.model.id
    assert first.agents["PRIVATE"].id == second.agents["PRIVATE"].id


def test_cloud_without_original_local_model_and_without_cloud_setup_reports_requirements(tmp_path):
    root=tmp_path/"W54_FAKE_ROOT";root.mkdir()
    claim=W47VerifiedPrincipal(
        principal_ref="fixture-user-12345678",installation_ref="fixture-install-12345678",
        session_ref="fixture-session-12345678",session_revision=1,
        revocation_generation=1,expires_at_ms=9999999999999,app_local_data_root=root,
        model_backend="unconfigured",
    )
    port=W43NativePrivateBrainPort(resolve_current=lambda _,op:claim)
    # No model installed/configured must not block the user's own history.
    assert port.history(object(),thread_id="personal")["status"]=="HISTORY_NOT_FOUND"
    with pytest.raises(W47PrivateAccessError, match="MODEL_SETUP_REQUIRED"):
        port.turn(object(),thread_id="personal",text="fixture private question",
                  request_id="fixture-request-00001")
    selected=replace(claim,model_backend="openrouter",model_id="openai/gpt-4o-mini",
                     model_user_selected=True,extra_charge_approved=True,
                     protected_credential_attested=True,cloud_key_file=tmp_path/"not-present",
                     model_selection_epoch=1)
    port=W43NativePrivateBrainPort(resolve_current=lambda _,op:selected)
    # Revoking the model Key does not revoke authenticated native history.
    assert port.history(object(),thread_id="personal")["messages"]==[]
    with pytest.raises(W47PrivateAccessError, match="CLOUD"):
        port.turn(object(),thread_id="personal",text="fixture private question",
                  request_id="fixture-request-00002")


def test_native_ephemeral_wincred_callback_openrouter_without_key_file(tmp_path, monkeypatch):
    """W55 native-process callback supplies fictional Key bytes; no API calls."""
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    secret=["fixture-ephemeral-wincred-key-NOT-REAL-123456"]
    seen=[]
    def native_resolver():
        seen.append("native_call")
        return secret[0]
    from yance_agentos import NativeAgnoRuntime
    rt=NativeAgnoRuntime(
        tmp_path/"original-agno-chat.sqlite",backend="openrouter",
        model_id="openai/gpt-4o-mini",purpose="QUALITY_EVAL",
        cloud_secret_resolver=native_resolver,
        user_selected=True,extra_charge_approved=True,
        protected_credential_attested=True,
    )
    assert rt.provider=="OPENROUTER_USER_API"
    assert rt._selected_model_ready()
    assert len(seen)>=2
    secret[0]="fixture-rotated-invalid-next-key-12345678"
    assert not rt._selected_model_ready()
    # Rotation never authorizes the previous selected SDK client to spend.
    secret[0]=""
    assert not rt._selected_model_ready()
    del secret[0]
    assert not rt._selected_model_ready()


def test_native_ephemeral_wincred_callback_denials_no_plaintext_on_errors(tmp_path):
    """No global/env key fallback, no raw Key in public model receipt."""
    from yance_agentos import NativeAgnoRuntime,LocalOnlyError
    key="fixture-secret-should-never-be-in-error-123456"
    for backend in ("openrouter","openai"):
        with pytest.raises(LocalOnlyError) as exc:
            NativeAgnoRuntime(
                tmp_path/"no-model.sqlite",backend=backend,
                model_id="openai/gpt-4o-mini" if backend=="openrouter" else "gpt-4o-mini",
                purpose="QUALITY_EVAL",cloud_secret_resolver=lambda: key,
                user_selected=True,extra_charge_approved=False,
                protected_credential_attested=True)
        assert key not in str(exc.value)
    with pytest.raises(LocalOnlyError,match="CLOUD_CREDENTIAL_SOURCE_AMBIGUOUS"):
        NativeAgnoRuntime(tmp_path/"fail.sqlite",backend="openrouter",
                           model_id="openai/gpt-4o-mini",purpose="QUALITY_EVAL",
                           cloud_key_file=cred(tmp_path),
                           cloud_secret_resolver=lambda:key,
                           user_selected=True,extra_charge_approved=True,
                           protected_credential_attested=True)


def test_w47_original_port_can_select_cloud_from_native_callback_without_qwen(tmp_path):
    from private_principal_port import W43NativePrivateBrainPort,W47VerifiedPrincipal
    root=tmp_path/"current-local-user";root.mkdir()
    secret=["fixture-native-protected-key-never-real-123456789"]
    claim=W47VerifiedPrincipal(
        principal_ref="fixture-local-user-00001",
        installation_ref="fixture-install-00001",
        session_ref="fixture-session-00001",
        session_revision=1,revocation_generation=1,
        expires_at_ms=9999999999999,app_local_data_root=root,
        model_backend="openai",model_id="gpt-4o-mini",model_selection_epoch=1,
        cloud_secret_resolver=lambda:secret[0],
        model_user_selected=True,extra_charge_approved=True,
        protected_credential_attested=True,
    )
    port=W43NativePrivateBrainPort(resolve_current=lambda *_:claim)
    scope,model=port._runtime(claim)
    assert model.backend=="openai"
    assert model._selected_model_ready()
    assert model.db_file.is_file() is False or model.db_file.parent.is_dir()
    # Revoked Key never prevents history GET, but disallows future AI run.
    secret[0]=""
    assert not model._selected_model_ready()
    assert port.history(object(),thread_id="personal")["messages"] == []
