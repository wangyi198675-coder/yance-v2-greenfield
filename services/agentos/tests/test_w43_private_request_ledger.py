"""Native W43 requestId ledger, original Agno SqliteDb, no model calls.

All W47 principals and Agno RunOutput data here are explicitly SYNTHETIC
fixtures. This is not W54 verified Windows-user or real Qwen3 quality proof.
"""
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from pathlib import Path
import sqlite3
import sys
import time

import pytest
from agno.run.agent import RunOutput
from agno.run.base import RunStatus
from agno.models.message import Message
from agno.session.agent import AgentSession

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from private_principal_port import W43NativePrivateBrainPort, W47VerifiedPrincipal, W47PrivateAccessError
from private_request_ledger import NativePrivateRequestLedger
from private_request_identity import request_identity


class ServerContext:
    pass


def setup(tmp_path):
    root=tmp_path/"fake-W54-per-user-appdata"
    root.mkdir(exist_ok=True)
    claim=W47VerifiedPrincipal(
        principal_ref="fixture-principal-A-123",
        installation_ref="fixture-installation-A",
        session_ref="fixture-session-A-123",
        session_revision=1, revocation_generation=5,
        expires_at_ms=int(time.time()*1000)+120000,
        app_local_data_root=root,
    )
    live=[claim]
    ctx=ServerContext()
    def resolve(context,operation):
        assert context is ctx and operation=="PRIVATE_TURN"
        return live[0]
    key=tmp_path/"synthetic-key"
    key.write_text("fixture-offline-not-a-real-key-123456789")
    port=W43NativePrivateBrainPort(resolve_current=resolve,local_key_file=key)
    return NativePrivateRequestLedger(port),port,live,ctx


def params(ctx,text="Hello from a synthetic private local user",request_id="requestId-00000001"):
    return {"context":ctx,"thread_id":"personal","request_id":request_id,"text":text}


def original_run(port, live, ctx, data):
    scope,rt=port._runtime(live[0])
    id=request_identity(scope,data["thread_id"],data["request_id"],data["text"])
    sid=scope.session_id(data["thread_id"])
    rt.db.upsert_session(AgentSession(session_id=sid,agent_id=rt.agents["PRIVATE"].id,
                                      user_id=scope.scoped_user_id))
    run=RunOutput(
        run_id=id["run_id"],user_id=scope.scoped_user_id,
        session_id=sid,agent_id=rt.agents["PRIVATE"].id,
        status=RunStatus.completed,content="SYNTHETIC_AGNO_ASSISTANT_ONLY",
        metadata=id["metadata"],
        messages=[
            Message(role="user",content=data["text"]),
            Message(role="assistant",content="SYNTHETIC_AGNO_ASSISTANT_ONLY"),
        ],
    )
    rt.db.upsert_run(run,session_id=sid,user_id=scope.scoped_user_id,run_index=0)
    return {
        "status":"COMPLETED","threadId":data["thread_id"],
        "runId":run.run_id,"sessionId":run.session_id,
        "modelProvider":rt.provider,"modelId":rt.model_id,
        "assistantText":run.content,"qualityQualified":False,"canSend":False,
    }


def test_unconnected_w47_cannot_claim(tmp_path):
    p=W43NativePrivateBrainPort()
    with pytest.raises(W47PrivateAccessError) as exc:
        NativePrivateRequestLedger(p).claim(**params(object()))
    assert exc.value.http_status==503


def test_native_durable_claim_wins_once_across_threads(tmp_path):
    ledger,port,live,ctx=setup(tmp_path)
    with ThreadPoolExecutor(max_workers=2) as pool:
        states=list(pool.map(lambda _:ledger.claim(**params(ctx))["state"],range(2)))
    assert sorted(states)==["CLAIMED","IN_PROGRESS"]
    scope,rt=port._runtime(live[0])
    file=Path(rt.db_file)
    with sqlite3.connect(file) as db:
        assert db.execute("select count(*) from w43_private_request_fence").fetchone()[0]==1
        assert db.execute("select state from w43_private_request_fence").fetchone()[0]=="IN_PROGRESS"
    assert not any("private-ledger.sqlite" in str(p) for p in tmp_path.rglob("*.sqlite"))


def test_different_payload_same_id_conflicts_and_unknown_never_reruns(tmp_path):
    ledger,port,live,ctx=setup(tmp_path)
    assert ledger.claim(**params(ctx))["state"]=="CLAIMED"
    assert ledger.claim(**params(ctx,text="different payload"))["state"]=="CONFLICT"
    assert ledger.mark_unknown(**params(ctx))["state"]=="UNKNOWN"
    assert ledger.claim(**params(ctx))["state"]=="UNKNOWN"
    assert ledger.reconcile(**params(ctx))["state"]=="UNKNOWN"
    assert ledger.claim(**params(ctx))["state"]=="UNKNOWN"


def test_actual_native_table_reconciliation_survives_new_python_runtime(tmp_path):
    ledger,port,live,ctx=setup(tmp_path)
    a=params(ctx)
    claimed=ledger.claim(**a)
    assert claimed["state"]=="CLAIMED"
    ledger.begin_execute(**a)
    receipt=original_run(port,live,ctx,a)
    assert receipt["runId"]==claimed["runId"]
    assert ledger.mark_unknown(**a)["state"]=="UNKNOWN"
    assert ledger.reconcile(**a)["state"]=="COMPLETED"
    del ledger
    # This is new Agno & SQLite instances, not a fabricated HTTP response.
    fresh=NativePrivateRequestLedger(W43NativePrivateBrainPort(
        resolve_current=port._resolve_current,local_key_file=port._key_file))
    again=fresh.claim(**a)
    assert again["state"]=="COMPLETED"
    assert again["receipt"]==receipt
    assert again["receipt"]["canSend"] is False


def test_no_sdk_shape_without_original_persisted_run_can_finish(tmp_path):
    ledger,port,live,ctx=setup(tmp_path)
    a=params(ctx)
    claimed=ledger.claim(**a)
    ledger.begin_execute(**a)
    fake={
        "status":"COMPLETED","threadId":"personal","runId":claimed["runId"],
        "sessionId":"looks-legit-but-no-agno-run","modelId":"qwen3:8b",
        "modelProvider":"LLAMACPP_LOCAL_QWEN3_8B_FREE",
        "assistantText":"FAKE RESPONSE","qualityQualified":False,"canSend":False
    }
    with pytest.raises(W47PrivateAccessError) as exc:
        ledger.finish(**a,receipt=fake)
    assert exc.value.code=="DURABLE_NATIVE_RECEIPT_UNVERIFIED"
    assert ledger.claim(**a)["state"]=="IN_PROGRESS"


def test_identity_or_generation_revoked_while_model_runs_cannot_finish(tmp_path):
    ledger,port,live,ctx=setup(tmp_path)
    a=params(ctx)
    ledger.claim(**a)
    ledger.begin_execute(**a)
    receipt=original_run(port,live,ctx,a)
    live[0]=replace(live[0],revocation_generation=6,status="REVOKED")
    with pytest.raises(W47PrivateAccessError) as exc:
        ledger.finish(**a,receipt=receipt)
    assert exc.value.http_status==401


def test_isolation_per_thread_account_and_original_db(tmp_path):
    ledger,port,live,ctx=setup(tmp_path)
    own=ledger.claim(**params(ctx))
    other=ledger.claim(**params(ctx,request_id="requestId-00000002"))
    thread=ledger.claim(context=ctx,thread_id="second-thread",
                        request_id="requestId-00000001",text=params(ctx)["text"])
    assert len({own["runId"],other["runId"],thread["runId"]})==3
    old=live[0]
    live[0]=replace(old,principal_ref="fixture-principal-B-456")
    other_user=ledger.claim(**params(ctx))
    assert other_user["state"]=="CLAIMED"
    assert own["runId"]!=other_user["runId"]
    scope_old,rt_old=port._runtime(old)
    scope_new,rt_new=port._runtime(live[0])
    assert Path(rt_old.db_file)!=Path(rt_new.db_file)


def test_same_request_id_other_prompt_cannot_reconcile(tmp_path):
    ledger,port,live,ctx=setup(tmp_path)
    a=params(ctx)
    ledger.claim(**a)
    with pytest.raises(W47PrivateAccessError) as exc:
        ledger.reconcile(**params(ctx,text="different payload"))
    assert exc.value.http_status == 409
    assert ledger.claim(**a)["state"]=="IN_PROGRESS"


def test_completed_request_claim_survives_actual_new_process(tmp_path):
    import subprocess
    ledger,port,live,ctx=setup(tmp_path)
    a=params(ctx)
    ledger.claim(**a)
    ledger.begin_execute(**a)
    receipt=original_run(port,live,ctx,a)
    ledger.finish(**a,receipt=receipt)
    scope,rt=port._runtime(live[0])
    path=str(rt.db_file)
    child=subprocess.run([
        sys.executable,"-c",
        "import sqlite3,sys; d=sqlite3.connect(sys.argv[1]);"
        "print(d.execute('select state from w43_private_request_fence').fetchone()[0]);"
        "print(d.execute('select count(*) from agno_runs').fetchone()[0])",
        path,
    ],text=True,capture_output=True,timeout=15)
    assert child.returncode==0,child.stderr
    assert child.stdout.strip().splitlines()==["COMPLETED","1"]


def test_atomic_execution_admission_only_one_wins(tmp_path):
    ledger,port,live,ctx=setup(tmp_path)
    args=params(ctx)
    assert ledger.claim(**args)["state"]=="CLAIMED"
    def try_begin(_):
        try:
            return ledger.begin_execute(**args)["state"]
        except W47PrivateAccessError as exc:
            return str(exc.http_status)
    with ThreadPoolExecutor(max_workers=2) as pool:
        states=list(pool.map(try_begin,range(2)))
    assert sorted(states)==["409","EXECUTING"]
    assert ledger.claim(**args)["state"]=="IN_PROGRESS"
    assert ledger.mark_unknown(**args)["state"]=="UNKNOWN"
    with pytest.raises(W47PrivateAccessError):
        ledger.begin_execute(**args)


def test_missing_durable_claim_blocks_original_agno_model(tmp_path,monkeypatch):
    ledger,port,live,ctx=setup(tmp_path)
    _,rt=port._runtime(live[0])
    monkeypatch.setattr(rt,"_authorized_llamacpp_model_matches",lambda:True)
    calls=[]
    def forbidden_run(*args,**kwargs):
        calls.append(True)
        raise AssertionError("NO_SDK_MODEL_WITHOUT_ATOMIC_LEDGER_CLAIM")
    monkeypatch.setattr(rt.agents["PRIVATE"],"run",forbidden_run)
    with pytest.raises(W47PrivateAccessError) as exc:
        port.turn(ctx,thread_id="personal",text=params(ctx)["text"],
                  request_id=params(ctx)["request_id"])
    assert exc.value.code=="DURABLE_RUN_ALREADY_STARTED_OR_NOT_CLAIMED"
    assert not calls


def test_same_request_id_after_cloud_model_switch_is_conflict_not_second_paid_run(tmp_path):
    ledger,port,live,ctx=setup(tmp_path)
    args=params(ctx)
    assert ledger.claim(**args)["state"]=="CLAIMED"
    key=tmp_path/"W55_FAKE_CLOUD_KEY"
    key.write_text("fixture-cloud-secret-never-real-123456")
    live[0]=replace(
        live[0],model_backend="openrouter",model_id="openai/gpt-4o-mini",
        cloud_key_file=key,model_user_selected=True,extra_charge_approved=True,
        protected_credential_attested=True,model_selection_epoch=2,
    )
    assert ledger.claim(**args)["state"]=="CONFLICT"
    assert ledger.claim(**params(ctx,request_id="new-requestId-009"))["state"]=="CLAIMED"
    scope_old,rt_old=port._runtime(replace(live[0],model_backend="llamacpp",
        model_id="qwen3:8b",cloud_key_file=None,model_user_selected=False,
        extra_charge_approved=False,protected_credential_attested=False,
        model_selection_epoch=0))
    scope_cloud,rt_cloud=port._runtime(live[0])
    assert scope_old.session_id("personal")==scope_cloud.session_id("personal")
    assert rt_old.db_file==rt_cloud.db_file
    assert rt_cloud.provider=="OPENROUTER_USER_API"


def test_prior_native_ledger_schema_kept_but_old_claim_unattested(tmp_path):
    ledger,port,live,ctx=setup(tmp_path)
    a=params(ctx)
    scope,rt=port._runtime(live[0])
    identity=request_identity(scope,a["thread_id"],a["request_id"],a["text"])
    with sqlite3.connect(str(rt.db_file)) as conn:
        conn.execute("""CREATE TABLE w43_private_request_fence (
          fingerprint TEXT PRIMARY KEY,prompt_sha256 TEXT NOT NULL,
          run_id TEXT NOT NULL UNIQUE,state TEXT NOT NULL,
          created_at_ms INTEGER NOT NULL,updated_at_ms INTEGER NOT NULL
        )""")
        conn.execute("INSERT INTO w43_private_request_fence VALUES (?,?,?,?,?,?)",
                     (identity["fingerprint"],identity["prompt_sha256"],
                      identity["run_id"],"IN_PROGRESS",123,123))
    assert ledger.claim(**a)["state"]=="CONFLICT"
    with sqlite3.connect(str(rt.db_file)) as conn:
        row=conn.execute("select state,model_selection_sha256 from w43_private_request_fence").fetchone()
    assert row==("IN_PROGRESS","LEGACY_MODEL_UNATTESTED")
