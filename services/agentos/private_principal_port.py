"""W43 consumes W47-verified current local user; W47 owns HTTP/issuer.

NOT a trust oracle. It accepts no request claims, cookies, header, SID or
dbPath. Only the W47 server-owned, security-reviewed resolver supplied at
composition time may decide the current principal. With no resolver, SEALED.
Cross-process transport/proof is W47/W54/security OWNED and currently HOLD.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable
import re
import time

from private_scope import (
    _scope_from_w47_verified_claim, valid_thread,
)
from w43_capacity import one_slot


class W47PrivateAccessError(RuntimeError):
    def __init__(self, code: str, http_status: int):
        self.code = code
        self.http_status = http_status
        super().__init__(code)


@dataclass(frozen=True)
class W47VerifiedPrincipal:
    """Internal W47 resolver result. NEVER deserialize from an HTTP request."""
    principal_ref: str
    installation_ref: str
    session_ref: str
    session_revision: int
    revocation_generation: int
    expires_at_ms: int
    app_local_data_root: Path
    status: str = "VERIFIED"


def _check_claim(value: W47VerifiedPrincipal) -> W47VerifiedPrincipal:
    if type(value) is not W47VerifiedPrincipal:
        raise W47PrivateAccessError("W47_PRINCIPAL_UNAVAILABLE", 503)
    if value.status in {"REVOKED", "EXPIRED"}:
        raise W47PrivateAccessError("LOCAL_SESSION_REVOKED_OR_EXPIRED", 401)
    if value.status == "CONFLICT":
        raise W47PrivateAccessError("LOCAL_SESSION_REVISION_CONFLICT", 409)
    if value.status != "VERIFIED":
        raise W47PrivateAccessError("W47_PRINCIPAL_UNAVAILABLE", 503)
    # Object validity alone is NOT proof; resolver provenance is W47-owned.
    from private_scope import _valid_opaque
    try:
        for x, label in (
            (value.principal_ref, "PRINCIPAL"),
            (value.installation_ref, "INSTALLATION"),
            (value.session_ref, "SESSION"),
        ):
            _valid_opaque(x, label)
    except ValueError:
        raise W47PrivateAccessError("W47_PRINCIPAL_INVALID", 503) from None
    if (type(value.session_revision) is not int or value.session_revision < 0
            or type(value.revocation_generation) is not int
            or value.revocation_generation < 0):
        raise W47PrivateAccessError("W47_SESSION_REVISION_INVALID", 503)
    if type(value.expires_at_ms) is not int or value.expires_at_ms <= int(time.time() * 1000):
        raise W47PrivateAccessError("LOCAL_SESSION_EXPIRED", 401)
    if not isinstance(value.app_local_data_root, Path):
        raise W47PrivateAccessError("W54_APPDATA_AUTHORITY_REQUIRED", 503)
    root = value.app_local_data_root
    if not root.is_absolute() or not root.is_dir() or root.is_symlink():
        raise W47PrivateAccessError("W54_APPDATA_AUTHORITY_REQUIRED", 503)
    return value


def _same_session(a: W47VerifiedPrincipal, b: W47VerifiedPrincipal) -> bool:
    return (
        a.principal_ref == b.principal_ref
        and a.installation_ref == b.installation_ref
        and a.session_ref == b.session_ref
        and a.session_revision == b.session_revision
        and a.revocation_generation == b.revocation_generation
        and a.app_local_data_root.resolve() == b.app_local_data_root.resolve()
    )


class W43NativePrivateBrainPort:
    """Narrow W43 Agno data/model adapter for future W47 GET and POST.

    Private request_context is an opaque server-side reference (not browser
    parameters). W47 must bind the resolver to a *currently* trusted local
    session with stable principal and W54-authoritative per-user AppData.
    """

    def __init__(
        self, *,
        resolve_current: Callable | None = None,
        local_key_file: str | Path | None = None,
    ):
        if resolve_current is not None and not callable(resolve_current):
            raise TypeError("W47_RESOLVER_NOT_CALLABLE")
        self._resolve_current = resolve_current
        self._key_file = local_key_file
        self._runtimes = {}

    def _verified(self, context, operation):
        if self._resolve_current is None:
            raise W47PrivateAccessError("W47_TRUSTED_PRINCIPAL_NOT_CONNECTED", 503)
        if context is None:
            raise W47PrivateAccessError("LOCAL_SESSION_REQUIRED", 401)
        # This must be W47's protected server-side verifier, never request JSON.
        try:
            claim = self._resolve_current(context, operation)
        except W47PrivateAccessError:
            raise
        except Exception:
            raise W47PrivateAccessError("W47_TRUSTED_PRINCIPAL_UNAVAILABLE", 503) from None
        if claim is None:
            raise W47PrivateAccessError("LOCAL_SESSION_REQUIRED", 401)
        return _check_claim(claim)

    def _recheck(self, context, operation, previous):
        current = self._verified(context, operation)
        if not _same_session(previous, current):
            raise W47PrivateAccessError("LOCAL_SESSION_CHANGED_OR_REVOKED", 409)
        return current

    def _runtime(self, claim):
        scope = _scope_from_w47_verified_claim(claim)
        root = claim.app_local_data_root.resolve(strict=True)
        # This is the EXISTING Agno SqliteDb per W54-proven user; no shadow
        # history table or new business Agent. Caller never provides dbPath.
        try:
            partition = root
            for segment in ("YanceV2", "Agno", "private", scope.storage_partition):
                child = partition / segment
                if child.is_symlink() or (hasattr(child, "is_junction") and child.is_junction()):
                    raise OSError("LINKED_PRIVATE_STORAGE_FORBIDDEN")
                child.mkdir(parents=False, exist_ok=True, mode=0o700)
                if child.resolve().parent != partition.resolve():
                    raise OSError("PRIVATE_STORAGE_PATH_ESCAPE")
                partition = child
        except (OSError, RuntimeError):
            raise W47PrivateAccessError("PRIVATE_HISTORY_STORAGE_UNAVAILABLE", 503) from None
        file = partition / "agno-native.sqlite"
        if file.is_symlink() or (hasattr(file, "is_junction") and file.is_junction()):
            raise W47PrivateAccessError("PRIVATE_HISTORY_STORAGE_UNAVAILABLE", 503)
        cache_key = str(file.resolve())
        if cache_key not in self._runtimes:
            from yance_agentos import NativeAgnoRuntime
            try:
                self._runtimes[cache_key] = NativeAgnoRuntime(
                    file, backend="llamacpp", purpose="QUALITY_EVAL",
                    local_key_file=self._key_file,
                )
            except Exception:
                raise W47PrivateAccessError("PRIVATE_AGENT_RUNTIME_UNAVAILABLE", 503) from None
        return scope, self._runtimes[cache_key]

    def turn(self, context, *, thread_id, text, request_id):
        if (not isinstance(text, str) or not text.strip()
                or len(text) > 10000 or "\x00" in text):
            raise W47PrivateAccessError("PRIVATE_TEXT_INVALID", 422)
        if not isinstance(request_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{8,100}", request_id):
            raise W47PrivateAccessError("REQUEST_ID_INVALID", 422)
        try:
            valid_thread(thread_id)
        except ValueError:
            raise W47PrivateAccessError("THREAD_INVALID", 422) from None
        claim = self._verified(context, "PRIVATE_TURN")
        scope, runtime = self._runtime(claim)
        with one_slot() as admitted:
            if not admitted:
                raise W47PrivateAccessError("LOCAL_MODEL_CAPACITY_BUSY", 503)
            self._recheck(context, "PRIVATE_TURN", claim)
            if not runtime._authorized_llamacpp_model_matches():
                raise W47PrivateAccessError("LOCAL_MODEL_UNAVAILABLE", 503)
            try:
                result = runtime.agents["PRIVATE"].run(
                    text, user_id=scope.scoped_user_id,
                    session_id=scope.session_id(thread_id),
                )
            except Exception:
                raise W47PrivateAccessError("LOCAL_MODEL_RUN_FAILED", 503) from None
            # Do not release private history/answer after logout or revision
            # change mid-inference; W47 must resolve every live request.
            self._recheck(context, "PRIVATE_TURN", claim)
        status = getattr(getattr(result, "status", None), "value", None)
        content = result.content if isinstance(result.content, str) else ""
        if (status != "COMPLETED" or not content.strip()
                or not isinstance(getattr(result, "run_id", None), str)
                or not result.run_id
                or getattr(result, "session_id", None) != scope.session_id(thread_id)):
            raise W47PrivateAccessError("LOCAL_MODEL_RUN_NOT_COMPLETED", 503)
        # Provenance is not inferred from a DTO alone. Verify the COMPLETE
        # original Agno SDK RunOutput was persisted in the authoritative DB,
        # with exact PRIVATE agent, user, session, run ID and answer bytes.
        try:
            rows = runtime.db.get_runs(
                session_id=scope.session_id(thread_id),
                user_id=scope.scoped_user_id,
                agent_id=runtime.agents["PRIVATE"].id,
            )
            actual = [row for row in rows
                      if row.run_id == result.run_id
                      and row.user_id == scope.scoped_user_id
                      and row.session_id == scope.session_id(thread_id)
                      and row.agent_id == runtime.agents["PRIVATE"].id
                      and getattr(getattr(row, "status", None), "value", None) == "COMPLETED"
                      and isinstance(row.content, str) and row.content == content]
        except Exception:
            actual = []
        if len(actual) != 1:
            raise W47PrivateAccessError("AGNO_NATIVE_PERSISTED_RUN_UNVERIFIED", 503)
        # A revocation between native database readback and return must also
        # prevent reply disclosure. W47 must recheck before HTTP commit.
        self._recheck(context, "PRIVATE_TURN", claim)
        return {
            "status": "COMPLETED",
            "threadId": thread_id,
            "runId": result.run_id,
            "sessionId": result.session_id,
            "modelProvider": runtime.provider,
            "modelId": runtime.model_id,
            "assistantText": content,
            "qualityQualified": False,
            "canSend": False,
        }

    def history(self, context, *, thread_id):
        try:
            valid_thread(thread_id)
        except ValueError:
            raise W47PrivateAccessError("THREAD_INVALID", 422) from None
        claim = self._verified(context, "PRIVATE_HISTORY")
        scope, runtime = self._runtime(claim)
        try:
            result = runtime.read_private_chat_history(scope, thread=thread_id)
        except Exception:
            raise W47PrivateAccessError("PRIVATE_HISTORY_STORAGE_UNAVAILABLE", 503) from None
        self._recheck(context, "PRIVATE_HISTORY", claim)
        return {
            "status": result["status"],
            "threadId": thread_id,
            "sessionId": result["session_id"],
            "messages": result["messages"],
            "runCount": result["run_count"],
            "completeTurnCount": result["complete_turn_count"],
            "qualityQualified": False,
            "canSend": False,
        }
