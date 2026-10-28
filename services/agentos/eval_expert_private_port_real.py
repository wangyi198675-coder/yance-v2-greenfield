"""Real Qwen3 private expert via W43's EXISTING W47 Port/request ledger.

W47 principal is a SYNTHETIC test resolver here; not product trusted host.
No cloud API, contacts, outgoing actions, or modifying current listener.
"""
from pathlib import Path
from uuid import uuid4
import os,json,sys,time
sys.path.insert(0,str(Path(__file__).resolve().parent))
from private_principal_port import W43NativePrivateBrainPort,W47VerifiedPrincipal
from private_request_ledger import NativePrivateRequestLedger
from native_experts import NativeExpertDirectory
os.environ["AGNO_TELEMETRY"]="false"
def main():
    root=Path(os.environ["LOCALAPPDATA"])/"YanceV2"/"W43"/"qa-expert-private"/uuid4().hex
    root.mkdir(parents=True,exist_ok=True)
    principal=W47VerifiedPrincipal(
        principal_ref="fixture-w43-private-expert-" + uuid4().hex,
        installation_ref="fixture-w43-install-" + uuid4().hex,
        session_ref="fixture-w47-session-" + uuid4().hex,
        session_revision=1,revocation_generation=1,
        expires_at_ms=int(time.time()*1000)+180000,
        app_local_data_root=root,model_backend="llamacpp",model_id="qwen3:8b",
    )
    request=object()
    port=W43NativePrivateBrainPort(
        resolve_current=lambda context,operation: principal if context is request else None,
        local_key_file=r"C:\Users\1\YanceQA\OSS\llama-b11430-win-cpu\profile_api_key.txt",
    )
    print("EXPERT_PORT_DIRECTORY",json.dumps({
        "ten":port.expert_directory(request)["cataloguedCount"],
        "installed":port.expert_directory(request)["installedReadOnlyCount"],
    }),flush=True)
    disabled=port.expert_set_enabled(request,expert_id="oss-discovery",enabled=False)
    assert disabled["enabled"] is False
    enabled=port.expert_set_enabled(request,expert_id="oss-discovery",enabled=True)
    assert enabled["enabled"] is True
    result=port.expert_turn(
        request,thread_id="personal",request_id="fixture_req_"+uuid4().hex,
        expert_id="oss-discovery",stable_id="A01",
    )
    detail=port.native_run(request,thread_id="personal",run_id=result["runId"])
    trace=port.native_trace(request,thread_id="personal",run_id=result["runId"])
    assert result["status"]=="COMPLETED_READ_ONLY_CATALOG_INSPECTION"
    assert detail["tools"][0]["status"]=="SDK_TOOL_RESULT_PERSISTED"
    assert result["toolCallId"]==detail["tools"][0]["toolCallId"]
    assert "DECLARED_NOT_AUTHORIZED_FOR_EXECUTION" in detail["tools"][0]["result"]
    assert trace["traceCount"]>=1
    print("EXPERT_PRIVATE_PORT_REAL",json.dumps({
        "status":"REAL_NATIVE_PRIVATE_EXPERT_LEDGER_TOOL_TRACE_PASS",
        "expertId":result["expertId"],"runId":result["runId"],
        "sessionId":result["sessionId"],"toolCallId":result["toolCallId"],
        "nativeToolState":detail["tools"][0]["status"],
        "traceCount":trace["traceCount"],
        "spans":sum(len(x["spans"]) for x in trace["traces"]),
        "modelId":result["modelId"],"fakeW47Resolver":True,
        "canSend":False,"qualityQualified":False,
    },ensure_ascii=True),flush=True)
    return 0
if __name__=="__main__": raise SystemExit(main())
