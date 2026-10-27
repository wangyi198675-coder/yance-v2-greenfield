"""Issue77: read actual previously completed Qwen3 + native Tool Run/Trace.

No model is initialized, no paid API/real account is used. This is a
SECOND process opening original Agno 3.1.10 SQLite from the real prior run.
"""
from pathlib import Path
import os, json, sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from agno.db.sqlite import SqliteDb
from native_inspection import NativeAgnoReadback,native_tool_directory
from yance_agentos import Scope
run_id="c5be45a1-921b-431e-9b3b-d1453691e0dc"
root=Path(os.environ["LOCALAPPDATA"])/"YanceV2"/"W43"/"qa-real-capability"
files=sorted(root.glob("synthetic-real-tool-*.sqlite"),key=lambda x:x.stat().st_mtime,reverse=True)
scope=Scope("SYNTHETIC_TEST_ONLY","fixture-issue61-tool-A","PRIVATE")
assert files,"ORIGINAL_NATIVE_REAL_TOOL_DB_NOT_PRESENT"
found=None
for path in files:
    db=SqliteDb(db_file=str(path))
    if db.get_run(run_id):
        found=NativeAgnoReadback(db)
        break
assert found,"REAL_TOOL_RUN_NOT_IN_ORIGINAL_SQLITE"
list_receipt=found.list_runs(scope,thread="capability-tool")
detail=found.get_run(scope,thread="capability-tool",run_id=run_id)
trace=found.get_trace(scope,thread="capability-tool",run_id=run_id)
catalog=native_tool_directory()
assert detail["status"]=="COMPLETED" and detail["toolCallCount"]>=1,detail
assert detail["tools"][0]["toolName"]=="describe_yance_capability",detail
assert detail["tools"][0]["status"]=="SDK_TOOL_RESULT_PERSISTED",detail
assert "DECLARED_NOT_AUTHORIZED_FOR_EXECUTION" in detail["tools"][0].get("result",""),detail
assert trace["traceCount"]>0 and trace["traces"][0]["totalSpans"]>=1,trace
assert catalog["stableIdCount"]==252
print("W43_ISSUE77_REAL_NATIVE_AGNO_READBACK",json.dumps({
 "status":"ORIGINAL_NATIVE_RUN_TOOL_TRACE_READBACK_PASS",
 "runId":detail["runId"], "sessionId":detail["sessionId"],
 "runStatus":detail["status"],"modelId":detail["modelId"],
 "tool":detail["tools"][0], "nativeRunCount":len(list_receipt["runs"]),
 "traces":trace["traces"],
 "toolDirectoryCount":catalog["stableIdCount"],
 "registeredSdkToolCount":len(catalog["registeredTools"]),
 "modelInitialized":False,"outbound":"DISABLED","qualityQualified":False
 },ensure_ascii=False,default=str),flush=True)
