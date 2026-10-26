"""Actual local Qwen3 via the EXISTING single Agno Agent tool invocation QA.

Uses only synthetic StableID A01, existing llama.cpp 11605 and native Agno SDK.
Does not grant upstream business actions, charge API, send messages or deploy.
"""
from pathlib import Path
from uuid import uuid4
import os, json, sys

os.environ["AGNO_TELEMETRY"]="false"
os.environ.pop("OPENAI_API_KEY",None)
os.environ.pop("OPENROUTER_API_KEY",None)
sys.path.insert(0,str(Path(__file__).resolve().parent))
from yance_agentos import NativeAgnoRuntime, Scope
from eval_private_multiturn import preflight

def main():
    issue = preflight()
    if issue:
        print(json.dumps({"status":issue,"tool_success":False}))
        return 2
    root=Path(os.environ["LOCALAPPDATA"])/"YanceV2"/"W43"/"qa-real-capability"
    root.mkdir(parents=True,exist_ok=True)
    db = root/f"synthetic-real-tool-{uuid4().hex}.sqlite"
    native = NativeAgnoRuntime(db, backend="llamacpp",purpose="QUALITY_EVAL")
    scope=Scope("SYNTHETIC_TEST_ONLY","fixture-issue61-tool-A","PRIVATE")
    session=scope.session_id("capability-tool")
    prompt=(
      "请调用工具 describe_yance_capability 查询StableID A01，"
      "然后根据工具结果用中文说明是否已获得实际执行资格；"
      "不能把目录存在说成业务已完成。"
    )
    result=native.agents["PRIVATE"].run(prompt,user_id=scope.scoped_user_id,session_id=session)
    runs=native.db.get_runs(session_id=session,user_id=scope.scoped_user_id,agent_id=native.agents["PRIVATE"].id)
    tools=[]
    for run in runs:
        for msg in run.messages or []:
            if msg.role=="tool":
                content=msg.content
                if isinstance(content,str):
                    tools.append({"valid_denial":("DECLARED_NOT_AUTHORIZED_FOR_EXECUTION" in content),
                                  "status_from_native_tool":content[:280]})
    completed=getattr(getattr(result,"status",None),"value",None)=="COMPLETED"
    good_tool=any(t["valid_denial"] for t in tools)
    print("W43_ISSUE61_REAL_NATIVE_TOOL",json.dumps({
        "status":"REAL_AGNO_TOOL_CALL_PASS" if completed and good_tool else "REAL_AGNO_TOOL_CALL_NOT_PROVEN",
        "run_id":result.run_id,"session_id":result.session_id,
        "sdk_status":getattr(getattr(result,"status",None),"value",None),
        "model":native.model_id,"provider":native.provider,
        "answer":result.content if completed and isinstance(result.content,str) else None,
        "real_native_tool_message_count":len(tools),"tool_receipts":tools,
        "same_native_history_db":db.is_file(),
        "quality_qualified":False,"outbound":"DISABLED"
    },ensure_ascii=False),flush=True)
    return 0 if completed and good_tool else 3
if __name__=="__main__":raise SystemExit(main())
