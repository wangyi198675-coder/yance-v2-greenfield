"""Proof-only: original Agno Team routes to THE ONE original Agent; Qwen3 actual.
Not user platform data, no paid API, no sending, no production.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from time import monotonic
import json,os,sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from yance_agentos import NativeAgnoRuntime, Scope
from agno.run.base import RunStatus
from native_experts import NativeExpertDirectory
os.environ["AGNO_TELEMETRY"]="false"
def main():
  import uuid
  root=Path(os.environ.get("LOCALAPPDATA",str(Path.home())))/"YanceV2"/"W43"/"qa-experts"
  root.mkdir(parents=True,exist_ok=True)
  db=root/("team-real-"+uuid.uuid4().hex+".sqlite")
  rt=NativeAgnoRuntime(db,backend="llamacpp",model_id="qwen3:8b",purpose="QUALITY_EVAL",
      local_key_file=r"C:\Users\1\YanceQA\OSS\llama-b11430-win-cpu\profile_api_key.txt")
  rt.get_unserved_app()  # enable original AgentOS tracing
  scope=Scope("SYNTHETIC_TEST_ONLY","fixture-expert-team-A","PRIVATE")
  prompt="fake-这是一个只读合成测试任务。请原生Agno Team委派给唯一Agent，调用工具 describe_yance_capability 查询A01，并用中文明确说明实际工具反馈中是否允许执行A01。严禁捏造成功。"
  sid=scope.session_id("oss-expert")
  directory=NativeExpertDirectory(db)
  assert directory.list(scope)["cataloguedCount"]==10
  assert directory.list(scope)["installedReadOnlyCount"]==1
  assert directory.require_active(scope,"oss-discovery").expert_id=="oss-discovery"
  directory.toggle(scope,"oss-discovery",False)
  try:
    directory.require_active(scope,"oss-discovery")
  except Exception as exc:
    assert getattr(exc,"code",None)=="EXPERT_DISABLED"
  else:
    raise AssertionError("EXPERT_DISABLE_NOT_ENFORCED")
  directory.toggle(scope,"oss-discovery",True)
  print("TEAM_RUN_START",str(db),flush=True)
  t=monotonic()
  result=rt.teams["PRIVATE"].run(prompt,user_id=scope.scoped_user_id,session_id=sid,
      metadata={"w43_expert_id":"oss-discovery","w43_expert_scope":"THIS_TASK",
                "w43_qualification":"READ_ONLY_V2_STABLE252_CATALOG_ONLY"})
  status=getattr(getattr(result,"status",None),"value",str(getattr(result,"status",None)))
  member_rows=rt.db.get_runs(user_id=scope.scoped_user_id,agent_id=rt.agents["PRIVATE"].id)
  related=[r for r in member_rows if any(x.tool_name=="describe_yance_capability" for x in (r.tools or []))]
  trace_rows,total=rt.db.get_traces(run_id=result.run_id,user_id=scope.scoped_user_id,session_id=sid)
  trace_spans=sum(len(rt.db.get_spans(trace_id=t.trace_id)) for t in trace_rows)
  print("REAL_TEAM_RESULT",json.dumps({
    "team_run_id":result.run_id,"team_sdk_status":status,
    "team_session_id":result.session_id,"seconds":round(monotonic()-t,2),
    "content":str(result.content)[:500],
    "member_responses_count":len(result.member_responses or []),
    "native_member_runs_found":len(member_rows),"native_catalog_member_runs":len(related),
    "member_runs":[{"run_id":r.run_id,"status":getattr(getattr(r,"status",None),"value",str(r.status)),
                    "tools":[getattr(x,"tool_name",None) for x in r.tools or []]}
                  for r in member_rows],
    "team_native_trace_count":total,"team_trace_span_count":trace_spans,
    "db_file":str(db),"original_agent_id":rt.agents["PRIVATE"].id,
    "single_agent":rt.agents["PRIVATE"] is rt.agents["CONTACT"],
    "expert_id":"oss-discovery","catalogued_experts":10,"registered_experts":1,"installed_readonly_experts":1,
    "canSend":False,"qualityQualified":False,
  },ensure_ascii=True),flush=True)
  return 0 if status=="COMPLETED" and related and total>=1 else 4
if __name__=="__main__": raise SystemExit(main())
