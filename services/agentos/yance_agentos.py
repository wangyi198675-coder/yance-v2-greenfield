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
from model_policy import classify_provider, v2_chatgpt_siwc_status

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
    if model_id not in {"qwen2.5:0.5b", "qwen3:8b"}:
        raise LocalOnlyError("MODEL_NOT_ALLOWLISTED")
    return Ollama(id=model_id, host=host, api_key=None, timeout=90, retries=0)


def _local_llamacpp_model(host: str, model_id: str, key_file: str | Path | None) -> OpenAIChat:
    """Use an EXISTING llama.cpp OpenAI-compatible listener, never OpenAI cloud."""
    url = urlsplit(host)
    if (url.scheme != "http" or url.hostname != "127.0.0.1"
            or url.port != 11605 or url.username or url.password
            or url.query or url.fragment or url.path not in {"", "/"}):
        raise LocalOnlyError("LLAMACPP_FIXED_LOOPBACK_ONLY")
    if model_id not in {"qwen3:8b", "qwen2.5:1.5b"}:
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
        purpose: str = "HEALTHCHECK",
    ) -> None:
        if backend == "qwen3":
            if purpose != "QUALITY_EVAL" or model_id not in (None, "qwen3:8b"):
                raise LocalOnlyError("QWEN3_8B_QUALITY_ONLY")
            host = host or "http://127.0.0.1:11434"
            model_id = "qwen3:8b"
            self.model = _local_model(host, model_id)
            self.provider = "OLLAMA_LOCAL_QWEN3_8B_FREE"
            self.policy_provider = "LOCAL_QWEN3_8B"
        elif backend == "llamacpp":
            host = host or "http://127.0.0.1:11605"
            model_id = model_id or "qwen3:8b"
            if purpose not in {"HEALTHCHECK", "QUALITY_EVAL"} or (purpose == "QUALITY_EVAL" and model_id != "qwen3:8b"):
                raise LocalOnlyError("LLAMACPP_PURPOSE_RESTRICTED")
            self.model = _local_llamacpp_model(host, model_id, local_key_file or os.getenv("YANCE_W43_LOCAL_KEY_FILE"))
            self.provider = PROVIDER
            self.policy_provider = "LOCAL_QWEN3_8B" if model_id == "qwen3:8b" else "LOCAL_QWEN25_15B"
        elif backend == "ollama":
            if purpose != "HEALTHCHECK" or model_id not in (None, "qwen2.5:0.5b"):
                raise LocalOnlyError("LEGACY_OLLAMA_HEALTHCHECK_ONLY")
            host = host or "http://127.0.0.1:11434"
            model_id = "qwen2.5:0.5b"
            self.model = _local_model(host, model_id)
            self.provider = "OLLAMA_LOCAL_LEGACY_HEALTHCHECK_ONLY"
            self.policy_provider = "LOCAL_QWEN25_15B"
        else:
            raise LocalOnlyError("UNKNOWN_MODEL_BACKEND")
        self.backend = backend
        self._local_key_file = (local_key_file or os.getenv("YANCE_W43_LOCAL_KEY_FILE")) if backend == "llamacpp" else None
        self.purpose = purpose
        self.model_id = model_id
        self._issued_w45_receipts: dict[str, str] = {}  # ephemeral in-process proof; NOT cross-service authorization
        self._issued_contact_runs: dict[str, str] = {}  # run receipts bound to exact synthetic scope+prompt+thread
        self._native_quality_run_verified = False
        self._native_health_run_verified = False
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

    def _authorized_llamacpp_model_matches(self) -> bool:
        """Actual original loopback server must advertise the exact SDK model alias.

        Fail closed if daemon rolled back to 1.5B, credentials changed, or endpoint
        unavailable. Does not contact Ollama or a paid/cloud provider.
        """
        try:
            import httpx
            if not self._local_key_file:
                return False
            key = Path(self._local_key_file).read_text(encoding="utf-8-sig").strip()
            with httpx.Client(timeout=4.0, trust_env=False) as client:
                response = client.get("http://127.0.0.1:11605/v1/models",
                    headers={"Authorization": "Bearer " + key})
            if response.status_code != 200:
                return False
            models = response.json().get("data", [])
            return any(isinstance(row, dict) and row.get("id") == self.model_id
                       for row in models)
        except Exception:
            return False

    def run(self, scope: Scope, text: str, *, thread: str = "default", team: bool = False) -> dict:
        if not isinstance(scope, Scope):
            raise ScopeError("SCOPE_REQUIRED")
        _field(text, "input")
        if not text.startswith("fake-"):
            raise ScopeError("SYNTHETIC_INPUT_REQUIRED")
        sid = scope.session_id(thread)
        if self.policy_provider == "LOCAL_QWEN3_8B" and self.backend == "qwen3":
            # Historical explicit Ollama evaluation only; NEVER probe Ollama for active llama.cpp.
            try:
                import ollama
                installed = {x.model for x in ollama.Client(
                    host="http://127.0.0.1:11434", timeout=8
                ).list().models}
            except Exception:
                installed = set()
            if "qwen3:8b" not in installed:
                return {
                    "status": "HOLD_QWEN3_8B_NOT_INSTALLED_OR_MODEL_SERVER_UNAVAILABLE",
                    "model_id": self.model_id,
                    "session_id": sid,
                    "suggestions": [],
                    "outbound": "DISABLED",
                }
        if self.backend == "llamacpp" and not self._authorized_llamacpp_model_matches():
            return {
                "status": "HOLD_LOCAL_MODEL_ID_AUTH_OR_SERVER_MISMATCH",
                "model_id": self.model_id, "session_id": sid,
                "suggestions": [], "outbound": "DISABLED",
            }
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
        if self.purpose == "HEALTHCHECK" and content:
            self._native_health_run_verified = True  # connectivity only; NEVER a quality certification
        if self.policy_provider == "LOCAL_QWEN3_8B" and self.purpose == "QUALITY_EVAL" and content:
            self._native_quality_run_verified = True  # model EXECUTION, not a subjective quality grade
        receipt = {
            "status": "AGNO_RUN_COMPLETED" if content else "AGNO_RUN_NO_TEXT",
            "engine": "OFFICIAL_AGNO_SDK",
            "sdk_pin": SDK_PIN,
            "provider": self.provider,
            "model_id": self.model_id,
            "purpose": self.purpose,
            "quality_qualified": False,  # no 1.5B quality approval or strong-model certification
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
                "model_id": self.model_id,
                "sdk_pin": SDK_PIN,
                "purpose": self.purpose,
                "quality_qualified": False,
            },
            "suggestions": [],  # W45 must select 0-3 sourced replies, not W43.
            "outbound": "DISABLED",
        }
        metrics = getattr(result, "metrics", None)
        token_usage = {}
        for field in ("input_tokens", "output_tokens", "total_tokens"):
            value = getattr(metrics, field, None)
            if type(value) is int and value >= 0:
                token_usage[field] = value
        receipt["token_usage"] = token_usage if token_usage else None
        if scope.space == "CONTACT" and receipt["status"] == "AGNO_RUN_COMPLETED":
            digest_source = json.dumps({"scope": scope.canonical_k, "thread": thread,
                "prompt": text, "receipt": receipt}, ensure_ascii=True, sort_keys=True)
            self._issued_contact_runs[result.run_id] = hashlib.sha256(digest_source.encode()).hexdigest()
        return receipt

    def attest_contact_run(self, scope: Scope, prompt: str, receipt: dict, *, thread: str = "default") -> bool:
        """Same-process W45 adapter evidence, NOT an external security grant.

        W24 must authorize the caller and transport before exposing this via RPC.
        """
        if not isinstance(scope, Scope) or scope.space != "CONTACT" or not isinstance(receipt, dict):
            return False
        run_id = receipt.get("run_id")
        if not isinstance(run_id, str) or not run_id or receipt.get("status") != "AGNO_RUN_COMPLETED":
            return False
        digest = self._issued_contact_runs.get(run_id)
        if not digest or not isinstance(prompt, str) or not isinstance(thread, str):
            return False
        try:
            value = json.dumps({"scope": scope.canonical_k, "thread": thread,
                "prompt": prompt, "receipt": receipt}, ensure_ascii=True, sort_keys=True)
        except (ValueError, TypeError):
            return False
        return hashlib.sha256(value.encode()).hexdigest() == digest

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

    def run_for_w45(
        self, scope: Scope, source_mid: str, original: str,
        translation_request_id: str, synthetic_prompt: str,
    ) -> dict:
        """Prepare W45's exact envelope from an actual Agno SDK completion.

        W45's JavaScript attestAgnoRun must validate via a separately authorized,
        same-runtime adapter before accepting this. Never self-issue live consent.
        """
        if self.purpose != "QUALITY_EVAL" or self.policy_provider != "LOCAL_QWEN3_8B":
            raise LocalOnlyError("W45_REQUIRES_VERIFIED_STRONG_MODEL")
        if not isinstance(scope, Scope) or scope.space != "CONTACT":
            raise ScopeError("W45_CONTACT_SCOPE_REQUIRED")
        _field(source_mid, "source_mid")
        if not source_mid.startswith("fake-"):
            raise ScopeError("SYNTHETIC_MID_REQUIRED")
        _field(original, "original")
        _field(translation_request_id, "translation_request_id")
        _field(synthetic_prompt, "synthetic_prompt")
        if not synthetic_prompt.startswith("fake-"):
            raise ScopeError("SYNTHETIC_PROMPT_REQUIRED")
        actual = self.run(scope, synthetic_prompt)
        if actual.get("status") != "AGNO_RUN_COMPLETED":
            return {
                "status": "AGNO_QUALITY_RUN_UNAVAILABLE",
                "sourceMid": source_mid,
                "candidates": [],
                "draftOnly": True,
                "outbound": "DISABLED",
            }
        identity = dict(tenant=scope.tenant, account=scope.account, channel=scope.channel,
                        peer_id=scope.peer_id, binding_revision=str(scope.binding_revision))
        envelope = {
            "engine": "OFFICIAL_AGNO_SDK",
            "status": "COMPLETED",
            "identity": identity,
            "sourceMid": source_mid,
            "originalSha256": hashlib.sha256(original.encode("utf-8")).hexdigest(),
            "translationRequestId": translation_request_id,
            "runId": actual["run_id"],
            "sessionId": actual["session_id"],
            "agentId": self.agents["CONTACT"].id,
            "modelProvider": self.provider,
            "modelId": self.model_id,
            "purpose": self.purpose,
            "provenance": actual["provenance"],
            "candidates": [],  # W45 alone chooses 0-3 with actual original/translation sources.
        }
        canonical = json.dumps(envelope, ensure_ascii=True, sort_keys=True)
        self._issued_w45_receipts[actual["run_id"]] = hashlib.sha256(canonical.encode()).hexdigest()
        return envelope

    def attest_w45_same_runtime(self, envelope: dict) -> bool:
        """Local-only verifier; NOT transferable across processes or trust boundaries."""
        if not isinstance(envelope, dict) or envelope.get("engine") != "OFFICIAL_AGNO_SDK":
            return False
        run_id = envelope.get("runId")
        if not isinstance(run_id, str) or not run_id:
            return False
        digest = self._issued_w45_receipts.get(run_id)
        if not digest:
            return False
        try:
            value = json.dumps(envelope, ensure_ascii=True, sort_keys=True)
        except (TypeError, ValueError):
            return False
        return hashlib.sha256(value.encode()).hexdigest() == digest

    def capability_report(self) -> dict:
        return {
            "sdk": "AGNO_3.1.10_INSTALLED",
            "agent_os": "NATIVE_APP_AVAILABLE_NOT_NETWORK_SERVED",
            "model_id": self.model_id,
            "purpose": self.purpose,
            "model_policy": classify_provider(
                self.policy_provider, self.purpose,
                local_model_verified=(self._native_health_run_verified if self.purpose == "HEALTHCHECK" else self._native_quality_run_verified)
            ).as_dict(),
            "run": "QWEN3_8B_REAL_QUALITY_RUN_REQUIRES_EVIDENCE"
                   if self.purpose == "QUALITY_EVAL" else ("LOCAL_AGNO_CONNECTIVITY_VERIFIED_NOT_QUALITY" if self._native_health_run_verified else "LOCAL_AGNO_CONNECTIVITY_NOT_YET_VERIFIED"),
            "sessions": "NATIVE_SQLITE_TESTED_SYNTHETIC",
            "team": "QWEN3_8B_REAL_QUALITY_RUN_REQUIRES_EVIDENCE"
                    if self.purpose == "QUALITY_EVAL" else "HEALTHCHECK_ONLY",
            "tools": "SDK_REGISTERED_REAL_QWEN3_TOOL_SELECTION_HOLD",
            "memory": "NATIVE_USER_MEMORY_READ_WRITE_RESTART_TESTED_SYNTHETIC",
            "trace": "NATIVE_SQLITE_TRACE_TESTED_SYNTHETIC",
            "approval": "SDK_CONFIRMATION_DECORATOR_REGISTERED_ADMIN_RESUME_HOLD",
            "control_plane": "NOT_CONNECTED_NO_EXTERNAL_SERVICE",
            "chatgpt_siwc_v2": v2_chatgpt_siwc_status().as_dict(),
            "w24_grant": "NOT_IN_W43_SCOPE",
            "w45_candidates": "NOT_IN_W43_SCOPE",
            "w25_delivery": "DISABLED",
            "production": "FORBIDDEN",
        }
