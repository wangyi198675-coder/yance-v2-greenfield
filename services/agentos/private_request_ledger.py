"""W43 persistent PRIVATE request ledger in the EXISTING Agno SqliteDb file.

No second database or chat history. One small transactional request fence
table alongside official Agno tables, indexed by authenticated PRIVATE K,
thread and requestId. All operations require W47's CURRENT trusted server
request context. There is NO auth issuer, HTTP server or SDK model fallback.

Important: W47 must independently wire this through its original trusted
Node↔Python bridge and sign safe native W54 storage before production.
"""
from __future__ import annotations

from contextlib import contextmanager
import sqlite3
import time

from private_principal_port import W43NativePrivateBrainPort, W47PrivateAccessError
from private_request_identity import request_identity
from private_scope import valid_thread


class NativePrivateRequestLedger:
    """Cross-process SQLite claim / finish / unknown / native reconciliation."""

    def __init__(self, original_port: W43NativePrivateBrainPort):
        if not isinstance(original_port, W43NativePrivateBrainPort):
            raise TypeError("ORIGINAL_W43_PRIVATE_PORT_REQUIRED")
        self._port = original_port

    def _scope(self, context, thread_id, request_id, text):
        from re import fullmatch
        if not isinstance(thread_id, str) or not fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", thread_id):
            raise W47PrivateAccessError("THREAD_INVALID", 422)
        if not isinstance(request_id, str) or not fullmatch(r"[A-Za-z0-9_-]{8,100}", request_id):
            raise W47PrivateAccessError("REQUEST_ID_INVALID", 422)
        if not isinstance(text, str) or not text.strip() or len(text) > 4000:
            raise W47PrivateAccessError("PRIVATE_TEXT_INVALID", 422)
        claim = self._port._verified(context, "PRIVATE_TURN")
        scope, runtime = self._port._runtime(claim)
        self._port._recheck(context, "PRIVATE_TURN", claim)
        return claim, scope, runtime, request_identity(
            scope, thread_id, request_id, text,
            model_backend=runtime.backend, model_id=runtime.model_id,
            selection_epoch=claim.model_selection_epoch,
        )

    @staticmethod
    @contextmanager
    def _db(runtime):
        # Same ORIGINAL official Agno SqliteDb file, NOT an independent DB.
        # Single atomic BEGIN IMMEDIATE serializes actors and processes.
        try:
            db = sqlite3.connect(str(runtime.db_file), timeout=5, isolation_level=None)
        except sqlite3.Error:
            raise W47PrivateAccessError("DURABLE_REQUEST_DB_UNAVAILABLE", 503) from None
        try:
            db.execute("PRAGMA busy_timeout=5000")
            db.execute("BEGIN IMMEDIATE")
            db.execute("""CREATE TABLE IF NOT EXISTS w43_private_request_fence (
                fingerprint TEXT PRIMARY KEY,
                prompt_sha256 TEXT NOT NULL,
                model_selection_sha256 TEXT NOT NULL,
                run_id TEXT NOT NULL UNIQUE,
                state TEXT NOT NULL CHECK(state IN ('IN_PROGRESS','EXECUTING','UNKNOWN','COMPLETED')),
                created_at_ms INTEGER NOT NULL,
                updated_at_ms INTEGER NOT NULL
            )""")
            # Old W43 fixture DBs had no model-selection column. Preserve
            # rows but mark provenance UNKNOWN/NOT_ATTESTED, never allow a
            # legacy claim to spend credits after a model change.
            columns = {row[1] for row in db.execute("PRAGMA table_info(w43_private_request_fence)")}
            if "model_selection_sha256" not in columns:
                db.execute(
                    "ALTER TABLE w43_private_request_fence "
                    "ADD COLUMN model_selection_sha256 TEXT NOT NULL "
                    "DEFAULT 'LEGACY_MODEL_UNATTESTED'"
                )
            try:
                yield db
            except Exception:
                db.execute("ROLLBACK")
                raise
            else:
                db.execute("COMMIT")
        except sqlite3.Error:
            raise W47PrivateAccessError("DURABLE_REQUEST_DB_UNAVAILABLE", 503) from None
        finally:
            db.close()

    @staticmethod
    def _stored(db, identity):
        row = db.execute(
            "SELECT prompt_sha256,model_selection_sha256,run_id,state FROM w43_private_request_fence WHERE fingerprint=?",
            (identity["fingerprint"],),
        ).fetchone()
        if row and row[0] != identity["prompt_sha256"]:
            return ("CONFLICT", None)
        if row and row[1] != identity["model_selection_sha256"]:
            return ("CONFLICT", None)
        if row and row[2] != identity["run_id"]:
            raise W47PrivateAccessError("DURABLE_RUN_ID_MISMATCH", 503)
        return (row[3], row[2]) if row else (None, None)

    @staticmethod
    def _native_receipt(scope, runtime, thread_id, identity):
        try:
            rows = runtime.db.get_runs(
                session_id=scope.session_id(thread_id),
                user_id=scope.scoped_user_id,
                agent_id=runtime.agents["PRIVATE"].id,
            )
            verified = [
                r for r in rows
                if r.run_id == identity["run_id"]
                and r.user_id == scope.scoped_user_id
                and r.session_id == scope.session_id(thread_id)
                and r.agent_id == runtime.agents["PRIVATE"].id
                and getattr(getattr(r, "status", None), "value", None) == "COMPLETED"
                and isinstance(r.content, str) and bool(r.content.strip())
                and isinstance(r.metadata, dict)
                and r.metadata.get("w43_private_request_fingerprint") == identity["fingerprint"]
                and r.metadata.get("w43_private_prompt_sha256") == identity["prompt_sha256"]
                and r.metadata.get("w43_private_model_selection_sha256") == identity["model_selection_sha256"]
                and (not getattr(r, "model", None) or r.model == runtime.model_id)
                and (runtime.backend not in {"openrouter", "openai"}
                     or not getattr(r, "model_provider", None)
                     or r.model_provider == ("OpenRouter" if runtime.backend == "openrouter" else "OpenAI"))
            ]
        except Exception:
            verified = []
        if len(verified) != 1:
            return None
        r = verified[0]
        return {
            "status": "COMPLETED",
            "threadId": thread_id,
            "runId": r.run_id,
            "sessionId": r.session_id,
            "modelProvider": runtime.provider,
            "modelId": runtime.model_id,
            "assistantText": r.content,
            "qualityQualified": False,
            "canSend": False,
        }

    def claim(self, context, *, thread_id, request_id, text):
        principal, scope, runtime, identity = self._scope(context, thread_id, request_id, text)
        with self._db(runtime) as db:
            state, _ = self._stored(db, identity)
            if state is None:
                stamp = int(time.time() * 1000)
                db.execute(
                    "INSERT INTO w43_private_request_fence "
                    "(fingerprint,prompt_sha256,model_selection_sha256,run_id,state,created_at_ms,updated_at_ms) "
                    "VALUES (?,?,?,?,?,?,?)",
                    (identity["fingerprint"], identity["prompt_sha256"],
                     identity["model_selection_sha256"], identity["run_id"],
                     "IN_PROGRESS", stamp, stamp),
                )
                state = "CLAIMED"
        self._port._recheck(context, "PRIVATE_TURN", principal)
        if state == "EXECUTING":
            return {"state": "IN_PROGRESS", "runId": identity["run_id"]}
        if state == "COMPLETED":
            receipt = self._native_receipt(scope, runtime, thread_id, identity)
            if receipt is None:
                raise W47PrivateAccessError("DURABLE_NATIVE_RECEIPT_UNVERIFIED", 503)
            self._port._recheck(context, "PRIVATE_TURN", principal)
            return {"state": "COMPLETED", "receipt": receipt, "runId": identity["run_id"]}
        return {"state": state, "runId": identity["run_id"]}

    def begin_execute(self, context, *, thread_id, request_id, text):
        """Atomically admit exactly ONE SDK execution after durable claim."""
        principal, scope, runtime, identity = self._scope(context, thread_id, request_id, text)
        with self._db(runtime) as db:
            state, _ = self._stored(db, identity)
            if state != "IN_PROGRESS":
                raise W47PrivateAccessError("DURABLE_RUN_ALREADY_STARTED_OR_NOT_CLAIMED", 409)
            db.execute(
                "UPDATE w43_private_request_fence SET state='EXECUTING',updated_at_ms=? WHERE fingerprint=? AND state='IN_PROGRESS'",
                (int(time.time() * 1000), identity["fingerprint"]),
            )
            if db.execute("SELECT changes()").fetchone()[0] != 1:
                raise W47PrivateAccessError("DURABLE_RUN_CONCURRENT_CONFLICT", 409)
        self._port._recheck(context, "PRIVATE_TURN", principal)
        return {"state": "EXECUTING", "runId": identity["run_id"]}

    def finish(self, context, *, thread_id, request_id, text, receipt):
        principal, scope, runtime, identity = self._scope(context, thread_id, request_id, text)
        native = self._native_receipt(scope, runtime, thread_id, identity)
        if native is None or not isinstance(receipt, dict) or receipt != native:
            raise W47PrivateAccessError("DURABLE_NATIVE_RECEIPT_UNVERIFIED", 503)
        self._port._recheck(context, "PRIVATE_TURN", principal)
        with self._db(runtime) as db:
            state, _ = self._stored(db, identity)
            if state not in {"EXECUTING", "UNKNOWN", "COMPLETED"}:
                raise W47PrivateAccessError("DURABLE_REQUEST_NOT_CLAIMED", 409)
            db.execute(
                "UPDATE w43_private_request_fence SET state='COMPLETED',updated_at_ms=? WHERE fingerprint=?",
                (int(time.time() * 1000), identity["fingerprint"]),
            )
        self._port._recheck(context, "PRIVATE_TURN", principal)
        return {"state": "COMPLETED", "receipt": native}

    def mark_unknown(self, context, *, thread_id, request_id, text):
        principal, scope, runtime, identity = self._scope(context, thread_id, request_id, text)
        with self._db(runtime) as db:
            state, _ = self._stored(db, identity)
            if state is None:
                raise W47PrivateAccessError("DURABLE_REQUEST_NOT_CLAIMED", 409)
            if state == "CONFLICT":
                raise W47PrivateAccessError("REQUEST_ID_PAYLOAD_CONFLICT", 409)
            if state in {"IN_PROGRESS", "EXECUTING"}:
                db.execute(
                    "UPDATE w43_private_request_fence SET state='UNKNOWN',updated_at_ms=? WHERE fingerprint=?",
                    (int(time.time() * 1000), identity["fingerprint"]),
                )
                state = "UNKNOWN"
        self._port._recheck(context, "PRIVATE_TURN", principal)
        return {"state": state}

    def reconcile(self, context, *, thread_id, request_id, text):
        """Recover ONLY an existing original Agno Run; NEVER invoke the model."""
        principal, scope, runtime, identity = self._scope(context, thread_id, request_id, text)
        with self._db(runtime) as db:
            state, _ = self._stored(db, identity)
            if state is None:
                raise W47PrivateAccessError("DURABLE_REQUEST_NOT_CLAIMED", 409)
            if state == "CONFLICT":
                raise W47PrivateAccessError("REQUEST_ID_PAYLOAD_CONFLICT", 409)
        native = self._native_receipt(scope, runtime, thread_id, identity)
        if native is None:
            # Ambiguous/absent persisted Run = UNKNOWN forever until audit.
            if state in {"IN_PROGRESS", "EXECUTING"}:
                self.mark_unknown(context, thread_id=thread_id, request_id=request_id, text=text)
            return {"state": "UNKNOWN"}
        self._port._recheck(context, "PRIVATE_TURN", principal)
        return self.finish(context, thread_id=thread_id, request_id=request_id,
                           text=text, receipt=native)
