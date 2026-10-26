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
from private_request_identity import request_identity


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
    # These optional values MUST be supplied by W47's server-verified model
    # selector, NEVER read from browser JSON/OS usernames or environment.
    # Missing selection keeps legacy local-only test wiring, not cloud billing.
    model_backend: str = "llamacpp"
    model_id: str = "qwen3:8b"
    cloud_key_file: Path | None = None
    # Only W55's nonserializable native callback in the approved Agno
    # process may supply this. Ordinary HTTP/browser input can never mint it.
    cloud_secret_resolver: Callable[[], str] | None = None
    model_user_selected: bool = False
    extra_charge_approved: bool = False
    protected_credential_attested: bool = False
    model_selection_epoch: int = 0


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
            or value.revocation_generation < 0
            or type(value.model_selection_epoch) is not int
            or value.model_selection_epoch < 0):
        raise W47PrivateAccessError("W47_SESSION_REVISION_INVALID", 503)
    if type(value.expires_at_ms) is not int or value.expires_at_ms <= int(time.time() * 1000):
        raise W47PrivateAccessError("LOCAL_SESSION_EXPIRED", 401)
    if not isinstance(value.app_local_data_root, Path):
        raise W47PrivateAccessError("W54_APPDATA_AUTHORITY_REQUIRED", 503)
    root = value.app_local_data_root
    if not root.is_absolute() or not root.is_dir() or root.is_symlink():
        raise W47PrivateAccessError("W54_APPDATA_AUTHORITY_REQUIRED", 503)
    if value.model_backend not in {"llamacpp", "openrouter", "openai", "unconfigured"}:
        raise W47PrivateAccessError("MODEL_PROVIDER_NOT_SUPPORTED", 422)
    # PRIVATE_HISTORY is independent of inference configuration, billing and
    # cloud-key availability. Never block the user's own original Agno
    # ChatHistory because a selected model or API key was removed/revoked.
    # Paid-model eligibility is checked only at the _runtime/turn boundary.
    return value


def _same_session(a: W47VerifiedPrincipal, b: W47VerifiedPrincipal) -> bool:
    return (
        a.principal_ref == b.principal_ref
        and a.installation_ref == b.installation_ref
        and a.session_ref == b.session_ref
        and a.session_revision == b.session_revision
        and a.revocation_generation == b.revocation_generation
        and a.app_local_data_root.resolve() == b.app_local_data_root.resolve()
        and a.model_selection_epoch == b.model_selection_epoch
        and a.model_backend == b.model_backend
        and a.model_id == b.model_id
        and a.cloud_key_file == b.cloud_key_file
        and a.model_user_selected == b.model_user_selected
        and a.extra_charge_approved == b.extra_charge_approved
        and a.protected_credential_attested == b.protected_credential_attested
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

    def _native_storage(self, claim):
        """Resolve exactly ONE existing per-user Agno SQLite storage path.

        No local/cloud Model, Agent, browser login or paid provider is needed
        for reading the current owner's original native ChatHistory.
        """
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
        return scope, file

    def _runtime(self, claim):
        if claim.model_backend == "unconfigured":
            raise W47PrivateAccessError("MODEL_SETUP_REQUIRED", 503)
        if claim.model_backend in {"openrouter", "openai"}:
            if not claim.model_user_selected or not claim.extra_charge_approved:
                raise W47PrivateAccessError("PAID_MODEL_SELECTION_NOT_APPROVED", 403)
            if not claim.protected_credential_attested:
                raise W47PrivateAccessError("W55_PROTECTED_CREDENTIAL_NOT_ATTESTED", 503)
            if claim.cloud_secret_resolver is not None:
                if (claim.cloud_key_file is not None or
                        not callable(claim.cloud_secret_resolver)):
                    raise W47PrivateAccessError("CLOUD_CREDENTIAL_SOURCE_AMBIGUOUS", 503)
            elif not isinstance(claim.cloud_key_file, Path):
                raise W47PrivateAccessError("CLOUD_API_KEY_SETUP_REQUIRED", 503)
        scope, file = self._native_storage(claim)
        # Cache models separately, never histories: ALL selected models keep
        # the original same Agno db_file/private Agent ID/user/session.
        cache_key = (str(file.resolve()), claim.model_backend,
                     claim.model_id, claim.model_selection_epoch,
                     str(claim.cloud_key_file) if claim.cloud_key_file else None)
        if cache_key not in self._runtimes:
            from yance_agentos import NativeAgnoRuntime, LocalOnlyError
            try:
                self._runtimes[cache_key] = NativeAgnoRuntime(
                    file, backend=claim.model_backend, model_id=claim.model_id,
                    purpose="QUALITY_EVAL", local_key_file=self._key_file,
                    cloud_key_file=claim.cloud_key_file,
                    cloud_secret_resolver=claim.cloud_secret_resolver,
                    user_selected=claim.model_user_selected,
                    extra_charge_approved=claim.extra_charge_approved,
                    protected_credential_attested=claim.protected_credential_attested,
                )
            except LocalOnlyError as err:
                code = str(err)
                if code in {"CLOUD_API_KEY_SETUP_REQUIRED",
                            "CLOUD_PROTECTED_CREDENTIAL_UNAVAILABLE",
                            "CLOUD_PROTECTED_CREDENTIAL_INVALID",
                            "PAID_MODEL_USER_APPROVAL_REQUIRED",
                            "CLOUD_MODEL_NOT_EXPLICITLY_SELECTED"}:
                    raise W47PrivateAccessError(code, 503) from None
                raise W47PrivateAccessError("MODEL_SETUP_REQUIRED", 503) from None
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
        identity = request_identity(
            scope, thread_id, request_id, text,
            model_backend=runtime.backend, model_id=runtime.model_id,
            selection_epoch=claim.model_selection_epoch,
        )
        with one_slot() as admitted:
            if not admitted:
                raise W47PrivateAccessError("LOCAL_MODEL_CAPACITY_BUSY", 503)
            self._recheck(context, "PRIVATE_TURN", claim)
            if not runtime._selected_model_ready():
                raise W47PrivateAccessError(
                    "LOCAL_MODEL_UNAVAILABLE" if runtime.backend == "llamacpp"
                    else "CLOUD_MODEL_SELECTION_OR_CREDENTIAL_UNAVAILABLE", 503
                )
            # Defense in depth: W47's signed durable claim MUST exist.
            # Atomically transition it to EXECUTING before any model/tool
            # effects. Crash/retry remains UNKNOWN; never call model twice.
            from private_request_ledger import NativePrivateRequestLedger
            NativePrivateRequestLedger(self).begin_execute(
                context, thread_id=thread_id, request_id=request_id, text=text,
            )
            try:
                result = runtime.agents["PRIVATE"].run(
                    text, user_id=scope.scoped_user_id,
                    session_id=scope.session_id(thread_id),
                    run_id=identity["run_id"],
                    metadata=identity["metadata"],
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
                or result.run_id != identity["run_id"]
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
                      and isinstance(row.content, str) and row.content == content
                      and isinstance(row.metadata, dict)
                      and row.metadata.get("w43_private_request_fingerprint") == identity["fingerprint"]
                      and row.metadata.get("w43_private_prompt_sha256") == identity["prompt_sha256"]
                      and row.metadata.get("w43_private_model_selection_sha256") == identity["model_selection_sha256"]
                      and (not getattr(row, "model", None) or row.model == runtime.model_id)
                      and (runtime.backend not in {"openrouter", "openai"}
                           or not getattr(row, "model_provider", None)
                           or row.model_provider == ("OpenRouter" if runtime.backend == "openrouter" else "OpenAI"))]
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

    def _native_readback(self, context):
        """Current W47 owner -> original Agno SqliteDb; model-free read."""
        from agno.db.sqlite import SqliteDb
        from native_inspection import NativeAgnoReadback
        claim = self._verified(context, "PRIVATE_HISTORY")
        scope, path = self._native_storage(claim)
        try:
            reader = NativeAgnoReadback(SqliteDb(db_file=str(path)))
        except Exception:
            raise W47PrivateAccessError("NATIVE_AGNO_HISTORY_UNAVAILABLE", 503) from None
        return claim, scope, reader

    @staticmethod
    def _inspection_result(operation):
        """Keep normal not-found/validation separate from native DB failures."""
        from native_inspection import NativeInspectionAccessError
        try:
            return operation()
        except NativeInspectionAccessError as exc:
            code = exc.code
            raise W47PrivateAccessError(
                code, 404 if code == "RUN_NOT_FOUND_IN_PRIVATE_SCOPE" else 422
            ) from None
        except Exception:
            raise W47PrivateAccessError("NATIVE_AGNO_READ_FAILED", 503) from None

    def native_tools(self, context):
        """Registered SDK tools vs all 252 declared, never implied executable."""
        from native_inspection import native_tool_directory
        claim = self._verified(context, "PRIVATE_HISTORY")
        data = self._inspection_result(native_tool_directory)
        self._recheck(context, "PRIVATE_HISTORY", claim)
        return data

    def native_runs(self, context, *, thread_id, limit=25):
        """Read current user's original Agno Run statuses and real tool counts."""
        claim, scope, reader = self._native_readback(context)
        result = self._inspection_result(
            lambda: reader.list_runs(scope, thread=thread_id, limit=limit)
        )
        self._recheck(context, "PRIVATE_HISTORY", claim)
        return result

    def native_run(self, context, *, thread_id, run_id):
        """Read original SDK persisted Run and ToolExecution approval/result."""
        claim, scope, reader = self._native_readback(context)
        result = self._inspection_result(
            lambda: reader.get_run(scope, thread=thread_id, run_id=run_id)
        )
        self._recheck(context, "PRIVATE_HISTORY", claim)
        return result

    def native_trace(self, context, *, thread_id, run_id):
        """Read original SDK Trace + Spans; no prompt/secret attributes."""
        claim, scope, reader = self._native_readback(context)
        result = self._inspection_result(
            lambda: reader.get_trace(scope, thread=thread_id, run_id=run_id)
        )
        self._recheck(context, "PRIVATE_HISTORY", claim)
        return result

    def history(self, context, *, thread_id):
        try:
            valid_thread(thread_id)
        except ValueError:
            raise W47PrivateAccessError("THREAD_INVALID", 422) from None
        claim = self._verified(context, "PRIVATE_HISTORY")
        scope, db_file = self._native_storage(claim)
        try:
            from agno.db.sqlite import SqliteDb
            from yance_agentos import NativeAgnoRuntime
            # Read the SAME Agno SqliteDb and original persisted RunOutput,
            # even if NO inference backend is configured on this machine.
            native_db = SqliteDb(db_file=str(db_file))
            result = NativeAgnoRuntime.read_native_private_history(
                native_db, scope, thread=thread_id,
            )
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
