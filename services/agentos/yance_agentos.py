"""W43 nonproduction adapter for the OFFICIAL Agno SDK 3.1.10 and AgentOS.

No custom agent executor. All inference is routed through Agno Agent.run or Team.run.
W24 remains the authority for consent; W45 owns sourced candidate generation.
"""
from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

# Disable Agno's opt-out anonymous telemetry before importing Agno itself.
os.environ["AGNO_TELEMETRY"] = "false"

from agno.agent import Agent
from agno.approval import approval
from agno.memory import UserMemory
from agno.db.sqlite import SqliteDb
from agno.models.ollama import Ollama
from agno.models.openai import OpenAIChat  # local OpenAI-compatible llama.cpp protocol, not OpenAI cloud
from agno.os import AgentOS
from agno.team import Team
from agno.tools import tool

CHANNELS = frozenset({"FB_PERSONAL", "FB_PAGE", "WHATSAPP_PERSONAL", "TELEGRAM_PERSONAL"})
PROVIDER = "LLAMACPP_LOCAL_NO_PAID_API"
SDK_PIN = "3.1.10"


class ScopeError(ValueError):
    """Identity input cannot prove an isolated synthetic scope."""


class LocalOnlyError(RuntimeError):
    """Only an explicit local, non-paid Agno model is allowed."""


def _field(value: object, field_name: str) -> str:
    if not isinstance(value, str) or not value or len(value) > 200:
        raise ScopeError(f"INVALID_{field_name.upper()}")
    if any(ord(ch) < 32 or ch == "|" for ch in value):
        raise ScopeError(f"INVALID_{field_name.upper()}")
    return value


@dataclass(frozen=True)
class Scope:
    tenant: str
    account: str
    space: str
    channel: str | None = None
    peer_id: str | None = None
    binding_revision: int | None = None

    def __post_init__(self) -> None:
        if self.tenant != "SYNTHETIC_TEST_ONLY":
            raise ScopeError("ONLY_SYNTHETIC_TENANT")
        _field(self.account, "account")
        if not self.account.startswith("fixture-"):
            raise ScopeError("ONLY_FIXTURE_ACCOUNT")
        if self.space not in {"PRIVATE", "CONTACT"}:
            raise ScopeError("BAD_SPACE")
        if self.space == "PRIVATE":
            if any(v is not None for v in (self.channel, self.peer_id, self.binding_revision)):
                raise ScopeError("PRIVATE_MUST_NOT_RECEIVE_CONTACT_K")
        else:
            if self.channel not in CHANNELS:
                raise ScopeError("BAD_CHANNEL")
            _field(self.peer_id, "peer_id")
            if not self.peer_id.startswith("fake-"):
                raise ScopeError("ONLY_FAKE_PEER")
            if type(self.binding_revision) is not int or self.binding_revision < 1:
                raise ScopeError("INVALID_BINDING_REVISION")

    @property
    def canonical_k(self) -> tuple:
        if self.space == "PRIVATE":
            return self.tenant, self.account, self.space
        return (self.tenant, self.account, self.channel, self.peer_id, self.binding_revision)

    @property
    def scoped_user_id(self) -> str:
        digest = hashlib.sha256(json.dumps(self.canonical_k, ensure_ascii=True).encode()).hexdigest()
        return f"w43-{self.space.lower()}-user-{digest}"

    def session_id(self, thread: str = "default") -> str:
        _field(thread, "thread")
        digest = hashlib.sha256(json.dumps([self.canonical_k, thread], ensure_ascii=True).encode()).hexdigest()
        return f"w43-{self.space.lower()}-session-{digest}"


@tool
def synthetic_source_lookup(topic: str) -> str:
    """Return a safe provenance label, never user data, provider data, or a web request.

    Args:
        topic: A synthetic topic to label.
    """
    if not topic.startswith("fake-") or len(topic) > 100:
        return "UNSUPPORTED_NON_SYNTHETIC_TOPIC"
    return "SYNTHETIC_SOURCE_ONLY:" + topic


@approval
@tool(requires_confirmation=True)
def review_synthetic_draft(draft_id: str) -> str:
    """Require confirmation before recording a simulated, non-sending draft review.

    Args:
        draft_id: A synthetic draft identifier beginning with fake-.
    """
    if not draft_id.startswith("fake-"):
        return "DENIED_NON_SYNTHETIC_DRAFT"
    return "SIMULATED_DRAFT_REVIEW_ONLY_NO_OUTBOUND"


def _local_model(host: str, model_id: str) -> Ollama:
    url = urlsplit(host)
    if url.scheme != "http" or url.hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise LocalOnlyError("LOCAL_OLLAMA_HTTP_ONLY")
    if url.username or url.password or url.query or url.fragment or url.path not in {"", "/"}:
        raise LocalOnlyError("INVALID_LOCAL_MODEL_ENDPOINT")
    if os.getenv("OLLAMA_API_KEY") or os.getenv("OPENAI_API_KEY"):
        raise LocalOnlyError("PAID_OR_CLOUD_PROVIDER_ENV_FORBIDDEN")
    if not model_id.startswith("qwen2.5:") or len(model_id) > 40:
        raise LocalOnlyError("MODEL_NOT_ALLOWLISTED")
    return Ollama(id=model_id, host=host, api_key=None, timeout=90, retries=0)


def _local_llamacpp_model(host: str, model_id: str, key_file: str | Path | None) -> OpenAIChat:
    """Use an EXISTING llama.cpp OpenAI-compatible listener, never OpenAI cloud."""
    url = urlsplit(host)
    if (url.scheme != "http" or url.hostname != "127.0.0.1"
            or url.port != 11605 or url.username or url.password
            or url.query or url.fragment or url.path not in {"", "/"}):
        raise LocalOnlyError("LLAMACPP_FIXED_LOOPBACK_ONLY")
    if model_id != "qwen2.5:1.5b":
        raise LocalOnlyError("LOCAL_MODEL_NOT_ALLOWLISTED")
    if key_file is None:
        raise LocalOnlyError("LOCAL_API_KEY_FILE_REQUIRED")
    try:
        path = Path(key_file)
        if not path.is_file() or path.stat().st_size > 256:
            raise LocalOnlyError("LOCAL_API_KEY_FILE_INVALID")
        key = path.read_text(encoding="utf-8-sig").strip()
    except (OSError, UnicodeError, ValueError) as exc:
        raise LocalOnlyError("LOCAL_API_KEY_FILE_UNREADABLE") from exc
    if len(key) < 16 or len(key) > 200 or any(c.isspace() for c in key):
        raise LocalOnlyError("LOCAL_API_KEY_FILE_INVALID")
    # OpenAIChat here is the official Agno SDK's localhost protocol adapter.
    # The key is passed only to the explicitly pinned 127.0.0.1 listener.
    return OpenAIChat(id=model_id, api_key=key, base_url=host + "/v1",
                      timeout=90, max_retries=0, temperature=0)


class NativeAgnoRuntime:
    """In-process, scope-fenced Agno runtime. Never directly serve AgentOS."""

    def __init__(
        self,
        db_file: str | Path,
        *,
        backend: str = "llamacpp",
        host: str | None = None,
        model_id: str | None = None,
        local_key_file: str | Path | None = None,
    ) -> None:
        if backend == "llamacpp":
            host = host or "http://127.0.0.1:11605"
            model_id = model_id or "qwen2.5:1.5b"
            self.model = _local_llamacpp_model(host, model_id, local_key_file)
            self.provider = "LLAMACPP_LOCAL_NO_PAID_API"
        elif backend == "ollama":
            host = host or "http://127.0.0.1:11434"
            model_id = model_id or "qwen2.5:0.5b"
            self.model = _local_model(host, model_id)
            self.provider = "OLLAMA_LOCAL_NO_PAID_API"
        else:
            raise LocalOnlyError("UNKNOWN_MODEL_BACKEND")
        self.model_id = model_id
        self.db_file = Path(db_file)
        if not self.db_file.parent.is_dir():
            raise FileNotFoundError("DB_PARENT_MUST_EXIST")
        self.db = SqliteDb(db_file=str(self.db_file))
        self.agents = {
            "PRIVATE": Agent(
                id="w43-private-brain",
                name="Synthetic Private Brain",
                model=self.model,
                db=self.db,
                instructions=[
                    "Only synthetic test data. Never send messages or invoke network/paid tools.",
                    "PRIVATE space is for owner-only conversations, not a contact reply.",
                    "Do not invent sources. State uncertainty plainly.",
                ],
                tools=[synthetic_source_lookup, review_synthetic_draft],
                add_history_to_context=True,
                num_history_runs=4,
                add_memories_to_context=True,
                update_memory_on_run=False,
                telemetry=False,
            ),
            "CONTACT": Agent(
                id="w43-contact-brain",
                name="Synthetic Contact Brain",
                model=self.model,
                db=self.db,
                instructions=[
                    "Only synthetic test data. Do not send, schedule, spend or approve anything.",
                    "Draft-only context. W45 determines actual 0-3 sourced reply candidates.",
                    "Never fabricate a translation, identity verification, or provenance.",
                ],
                tools=[synthetic_source_lookup, review_synthetic_draft],
                add_history_to_context=True,
                num_history_runs=4,
                add_memories_to_context=True,
                update_memory_on_run=False,
                telemetry=False,
            ),
        }
        self.teams = {
            space: Team(
                id=f"w43-{space.lower()}-synthetic-team",
                name=f"Synthetic {space} Team",
                members=[agent],
                model=self.model,
                db=self.db,
                instructions=["Use only fake fixture context. No outbound messages or paid APIs."],
                mode="route",
                telemetry=False,
            )
            for space, agent in self.agents.items()
        }
        self.agent_os = AgentOS(
            id="yance-w43-synthetic-local",
            agents=list(self.agents.values()),
            teams=list(self.teams.values()),
            db=self.db,
            tracing=True,
            telemetry=False,
            scheduler=False,
            mcp=False,
            authorization=False,  # API must NOT be published; expose via authenticated W24 gateway only.
        )

    def get_unserved_app(self):
        """Native AgentOS FastAPI runtime for in-process inspection/tests only.

        Security hold: do not bind this app to a socket until W24-authenticated
        gateway/JWT scoping is implemented. The SDK itself cannot prove full K.
        """
        return self.agent_os.get_app()

    def run(self, scope: Scope, text: str, *, thread: str = "default", team: bool = False) -> dict:
        if not isinstance(scope, Scope):
            raise ScopeError("SCOPE_REQUIRED")
        _field(text, "input")
        if not text.startswith("fake-"):
            raise ScopeError("SYNTHETIC_INPUT_REQUIRED")
        sid = scope.session_id(thread)
        runner = self.teams[scope.space] if team else self.agents[scope.space]
        try:
            result = runner.run(text, user_id=scope.scoped_user_id, session_id=sid)
        except Exception as exc:
            # No exception detail, credentials, model output, or record IDs leaked.
            return {
                "status": "LOCAL_MODEL_UNAVAILABLE_OR_RUN_FAILED",
                "error_type": type(exc).__name__,
                "session_id": sid,
                "suggestions": [],
                "outbound": "DISABLED",
            }
        sdk_status = getattr(getattr(result, "status", None), "value", None)
        if sdk_status not in {"COMPLETED", "completed"}:
            return {
                "status": "LOCAL_MODEL_UNAVAILABLE_OR_RUN_FAILED",
                "sdk_run_status": sdk_status or "UNKNOWN",
                "run_id": result.run_id,
                "session_id": sid,
                "suggestions": [],
                "outbound": "DISABLED",
            }
        content = result.content if isinstance(result.content, str) else ""
        return {
            "status": "AGNO_RUN_COMPLETED" if content else "AGNO_RUN_NO_TEXT",
            "engine": "OFFICIAL_AGNO_SDK",
            "sdk_pin": SDK_PIN,
            "provider": self.provider,
            "model_id": self.model_id,
            "space": scope.space,
            "user_id": scope.scoped_user_id,
            "session_id": sid,
            "run_id": result.run_id,
            "original_response": content,
            "provenance": {
                "type": "AGNO_RUN_RESULT",
                "run_id": result.run_id,
                "session_id": sid,
                "source": self.provider,
            },
            "suggestions": [],  # W45 must select 0-3 sourced replies, not W43.
            "outbound": "DISABLED",
        }

    def remember_synthetic(self, scope: Scope, note: str) -> dict:
        """Persist one fake user memory via Agno's native SqliteDb memory API."""
        if not isinstance(scope, Scope):
            raise ScopeError("SCOPE_REQUIRED")
        _field(note, "memory")
        if not note.startswith("fake-"):
            raise ScopeError("ONLY_SYNTHETIC_MEMORY")
        memory = UserMemory(
            memory=note,
            user_id=scope.scoped_user_id,
            agent_id=self.agents[scope.space].id,
        )
        saved = self.db.upsert_user_memory(memory)
        if saved is None:
            raise RuntimeError("NATIVE_MEMORY_WRITE_FAILED")
        return {"status": "NATIVE_AGNO_MEMORY_STORED", "user_id": scope.scoped_user_id}

    def read_synthetic_memories(self, scope: Scope) -> list[str]:
        """Read only SDK-memory rows owned by this exact synthetic scope."""
        if not isinstance(scope, Scope):
            raise ScopeError("SCOPE_REQUIRED")
        rows = self.db.get_user_memories(
            user_id=scope.scoped_user_id,
            agent_id=self.agents[scope.space].id,
        )
        return [m.memory for m in rows]

    def read_trace_receipts(self, scope: Scope, run_id: str) -> dict:
        """Read SDK trace status; empty results are explicitly NOT PROVEN."""
        if not isinstance(scope, Scope):
            raise ScopeError("SCOPE_REQUIRED")
        _field(run_id, "run_id")
        traces, count = self.db.get_traces(
            run_id=run_id,
            user_id=scope.scoped_user_id,
            session_id=scope.session_id(),
        )
        return {"status": "NATIVE_TRACE_FOUND" if count else "TRACE_NOT_FOUND",
                "count": count}

    def capability_report(self) -> dict:
        return {
            "sdk": "AGNO_3.1.10_INSTALLED",
            "agent_os": "NATIVE_APP_AVAILABLE_NOT_NETWORK_SERVED",
            "run": "EXECUTION_REQUIRED_TO_VERIFY",
            "sessions": "NATIVE_SQLITE_CONFIGURED_TEST_REQUIRED",
            "team": "REGISTERED_EXECUTION_NOT_ASSUMED",
            "tools": "SDK_REGISTERED_INVOCATION_NOT_ASSUMED",
            "memory": "NATIVE_USER_MEMORY_READ_CONFIGURED_NO_AUTOMATIC_WRITE",
            "trace": "AGENTOS_TRACING_ENABLED_PERSISTENCE_NOT_ASSUMED",
            "approval": "SDK_CONFIRMATION_DECORATOR_REGISTERED_NO_ADMIN_APPROVAL_CLAIM",
            "control_plane": "NOT_CONNECTED_NO_EXTERNAL_SERVICE",
            "w24_grant": "NOT_IN_W43_SCOPE",
            "w45_candidates": "NOT_IN_W43_SCOPE",
            "w25_delivery": "DISABLED",
            "production": "FORBIDDEN",
        }
