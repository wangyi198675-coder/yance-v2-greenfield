"""One-Agent expert directory and activation in the ORIGINAL Agno SQLite.

Ten labels are approved design, NOT ten installed executors.
Only the already verified Agno 252-StableID read-only tool is eligible.
W45 is the authority for contact K/MID bindings, not W43.
"""
from __future__ import annotations
from dataclasses import dataclass
import sqlite3
import time
from pathlib import Path

@dataclass(frozen=True)
class ExpertDescriptor:
    expert_id: str
    label: str
    upstream: str | None
    registered: bool
    installed: bool
    qualification: str
    default_enabled: bool = False
    tools: tuple[str,...] = ()

# Nine original P2 IDs; the tenth is a clearly provisional R2 persona ID.
EXPERTS: tuple[ExpertDescriptor,...] = (
    ExpertDescriptor("persona-natural-expression","人格与真人表达专家",None,False,False,"PERSONA_POLICY_OWNER_UNSIGNED"),
    ExpertDescriptor("german-natural-chat","德国 WhatsApp 自然聊天专家","W45",False,False,"W45_NATIVE_CONTACT_STYLE_NOT_SIGNED"),
    ExpertDescriptor("europe-language-style","欧洲语言文化专家","W45",False,False,"W45_NATIVE_STYLE_TOOLS_UNAVAILABLE"),
    ExpertDescriptor("relation-memory","长期关系记忆专家","W45",False,False,"W45_FACT_PROVENANCE_REVOKE_BINDING_UNAVAILABLE"),
    ExpertDescriptor("chat-goal-planner","聊天目标规划专家","W45",False,False,"W45_CONTACT_GOAL_AND_K_AUTH_UNAVAILABLE"),
    ExpertDescriptor("reply-quality-growth","回复质量成长专家","W45",False,False,"INDEPENDENT_QUALITY_AND_LEARNING_NOT_APPROVED"),
    ExpertDescriptor("media-conversation","多媒体对话专家","W23",False,False,"NATIVE_MEDIA_PROVIDER_NOT_SIGNED"),
    ExpertDescriptor("system-health","系统健康安全专家","W47",False,False,"ORIGINAL_HEALTH_TOOL_NOT_MOUNTED"),
    ExpertDescriptor("oss-discovery","开源能力发现专家","W43",True,True,"READ_ONLY_V2_STABLE252_CATALOG_ONLY",True,("describe_yance_capability",)),
    ExpertDescriptor("safe-repair-upgrade","安全修复升级专家",None,False,False,"ORIGINAL_REPAIR_TOOL_NOT_APPROVED"),
)
BY_ID={x.expert_id:x for x in EXPERTS}
assert len(BY_ID)==len(EXPERTS)==10

class ExpertNotReady(ValueError):
    def __init__(self,code):
        self.code=code
        super().__init__(code)

def _scope(scope):
    from private_scope import is_native_private_scope
    if not is_native_private_scope(scope):
        from yance_agentos import Scope
        if not isinstance(scope,Scope) or scope.space!="PRIVATE":
            raise ExpertNotReady("PRIVATE_SCOPE_REQUIRED")
    return scope

def _expert(expert_id):
    if not isinstance(expert_id,str) or expert_id not in BY_ID:
        raise ExpertNotReady("EXPERT_UNKNOWN")
    return BY_ID[expert_id]

class NativeExpertDirectory:
    def __init__(self, original_agno_db_file: Path):
        self.file=Path(original_agno_db_file)
        if not self.file.parent.is_dir():
            raise ExpertNotReady("ORIGINAL_AGNO_STORAGE_MISSING")
        if self.file.is_symlink():
            raise ExpertNotReady("ORIGINAL_AGNO_STORAGE_UNTRUSTED")

    def _db(self):
        db=sqlite3.connect(str(self.file),timeout=8)
        db.execute("PRAGMA busy_timeout=8000")
        db.execute("""CREATE TABLE IF NOT EXISTS w43_native_expert_preference (
            user_id TEXT NOT NULL,
            expert_id TEXT NOT NULL,
            enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
            revision INTEGER NOT NULL DEFAULT 1,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (user_id,expert_id)
        )""")
        return db

    def list(self,scope):
        user_id=_scope(scope).scoped_user_id
        with self._db() as db:
            rows={a:(bool(e),int(r)) for a,e,r in db.execute(
                "SELECT expert_id,enabled,revision FROM w43_native_expert_preference WHERE user_id=?",
                (user_id,)).fetchall()}
        return {"status":"NATIVE_EXPERT_DIRECTORY_READ","agentId":"w43-private-brain",
                "cataloguedCount":10,"registeredCount":1,"installedReadOnlyCount":1,
                "experts":[{
                    "expertId":x.expert_id,"label":x.label,
                    "registered":x.registered,"installed":x.installed,
                    "enabled":x.installed and rows.get(x.expert_id,(x.default_enabled,0))[0],
                    "revision":rows.get(x.expert_id,(False,0))[1],
                    "availableMode":"READ_ONLY_STABLE252_INSPECTION" if x.installed else None,
                    "qualification":x.qualification,
                    "canInvoke":x.installed and rows.get(x.expert_id,(x.default_enabled,0))[0],
                    "supportsContactBinding":False,
                    "upstreamOwner":x.upstream,
                } for x in EXPERTS],"canSend":False,"qualityQualified":False}

    def toggle(self,scope,expert_id,enabled):
        desc=_expert(expert_id)
        user_id=_scope(scope).scoped_user_id
        if type(enabled) is not bool:
            raise ExpertNotReady("EXPERT_ENABLED_VALUE_INVALID")
        if not desc.installed:
            raise ExpertNotReady("EXPERT_UPSTREAM_NOT_INSTALLED")
        with self._db() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("""INSERT INTO w43_native_expert_preference
                (user_id,expert_id,enabled,revision,updated_at)
                VALUES (?,?,?,?,?)
                ON CONFLICT(user_id,expert_id)
                DO UPDATE SET enabled=excluded.enabled,
                revision=w43_native_expert_preference.revision+1,
                updated_at=excluded.updated_at
                """,(user_id,expert_id,int(enabled),1,int(time.time())))
            row=db.execute("""SELECT enabled,revision FROM w43_native_expert_preference
                WHERE user_id=? AND expert_id=?""",(user_id,expert_id)).fetchone()
        return {"status":"NATIVE_EXPERT_PREFERENCE_UPDATED",
                "expertId":expert_id,"enabled":bool(row[0]),
                "revision":row[1],
                "qualification":desc.qualification,"canSend":False}

    def require_active(self,scope,expert_id):
        desc=_expert(expert_id)
        if not desc.installed:
            raise ExpertNotReady("EXPERT_UPSTREAM_NOT_INSTALLED")
        row=next(x for x in self.list(scope)["experts"] if x["expertId"]==expert_id)
        if not row["enabled"]:
            raise ExpertNotReady("EXPERT_DISABLED")
        return desc
