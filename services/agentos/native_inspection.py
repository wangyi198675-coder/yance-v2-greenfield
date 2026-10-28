"""Read-only native Agno 3.1.10 Tools / Runs / Traces projection.

No second executor, workflow, history database, trace store or HTTP server.
The original W47 host selects a verified local person and SAME scoped SQLite,
then passes an internal PRIVATE scope into this adapter. It must never accept
client-supplied user_id, session_id, db_file or unrestricted trace identifiers.

Agno's own RunOutput, ToolExecution and Trace/Span records are authoritative.
Tool/Span data is shown only after exact Run/user/session/agent scoping;
system/developer prompt, reasoning and arbitrary tracing attributes are not
exported to a browser.
"""
from __future__ import annotations

from agno.db.sqlite import SqliteDb
from agno.run.base import RunStatus
from capability_catalog import stable_catalog, describe_yance_capability
from private_scope import is_native_private_scope


_AGENT_ID = "w43-private-brain"
_SAFE_NAME = "describe_yance_capability"
_NATIVE_REGISTRY = (_SAFE_NAME, "synthetic_source_lookup", "review_synthetic_draft")


class NativeInspectionAccessError(ValueError):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def _scope(scope):
    # Existing fixture Scope is restricted to a synthetic tenant; a real W47
    # request must derive NativePrivateScope from the existing W47 resolver.
    if is_native_private_scope(scope):
        return scope
    from yance_agentos import Scope
    if isinstance(scope, Scope) and scope.space == "PRIVATE":
        return scope
    raise NativeInspectionAccessError("PRIVATE_SCOPE_REQUIRED")


def _thread(thread):
    if not isinstance(thread, str) or not 1 <= len(thread) <= 128:
        raise NativeInspectionAccessError("THREAD_INVALID")
    if any(ord(x) < 32 or x in r"\/|?" for x in thread):
        raise NativeInspectionAccessError("THREAD_INVALID")
    return thread


def _run_id(run_id):
    if not isinstance(run_id, str) or not 6 <= len(run_id) <= 256:
        raise NativeInspectionAccessError("RUN_ID_INVALID")
    if any(ord(x) < 33 or ord(x) > 126 for x in run_id):
        raise NativeInspectionAccessError("RUN_ID_INVALID")
    return run_id


def _status(value):
    return getattr(value, "value", value)


def _tool_calls(run, *, details):
    """Only SDK-persisted ToolExecution can prove native tool execution."""
    messages = getattr(run, "messages", None) or []
    native_tool_messages = {
        getattr(m, "tool_call_id", None): m.content
        for m in messages if getattr(m, "role", None) == "tool"
        and isinstance(getattr(m, "content", None), str)
    }
    # Require the model's actual assistant function_call as well as original
    # ToolExecution and tool-role message. Neither isolated DB field alone
    # is accepted as proof that the Agno model requested the tool.
    selected_calls = {}
    for message in messages:
        if getattr(message, "role", None) != "assistant":
            continue
        for call in getattr(message, "tool_calls", None) or []:
            if not isinstance(call, dict):
                continue
            identifier = call.get("id")
            function = call.get("function") or {}
            if isinstance(function, dict) and isinstance(identifier, str):
                selected_calls[identifier] = function.get("name")
    items = []
    for t in getattr(run, "tools", None) or []:
        call_id = getattr(t, "tool_call_id", None)
        name = getattr(t, "tool_name", None)
        if not isinstance(name, str):
            continue
        requires_approval = bool(getattr(t, "requires_confirmation", False))
        confirmed = getattr(t, "confirmed", None) is True
        actual_result = getattr(t, "result", None)
        has_persisted_tool_message = (
            isinstance(call_id, str)
            and isinstance(actual_result, str)
            and native_tool_messages.get(call_id) == actual_result
            and selected_calls.get(call_id) == name
        )
        is_error = bool(getattr(t, "tool_call_error", None))
        waiting = requires_approval and not confirmed
        state = (
            "WAITING_USER_APPROVAL" if waiting else
            "SDK_TOOL_ERROR" if is_error else
            "SDK_TOOL_RESULT_PERSISTED" if has_persisted_tool_message
            and _status(getattr(run, "status", None)) == "COMPLETED" else
            "SDK_TOOL_RESULT_NOT_PROVEN"
        )
        item = {
            "toolCallId": call_id,
            "toolName": name,
            "status": state,
            "requiresApproval": requires_approval,
            "approved": confirmed if requires_approval else None,
            "hasPersistedResult": has_persisted_tool_message,
            "runId": run.run_id,
            "businessSucceeded": False,  # separate native Owner qualification
        }
        if details:
            if has_persisted_tool_message and not waiting:
                # Only the original audited public StableID catalogue tool
                # is safe for browser-visible result text. Unknown upstream
                # tool outputs can contain keys, private records or blobs and
                # require their own original Owner's safe projection.
                if name == _SAFE_NAME:
                    item["result"] = actual_result[:4000]
                else:
                    item["resultVisibility"] = "NATIVE_OWNER_REDACTION_REQUIRED"
            if name == _SAFE_NAME:
                args = getattr(t, "tool_args", None) or {}
                if isinstance(args, dict) and isinstance(args.get("stable_id"), str):
                    item["stableId"] = args["stable_id"]
        items.append(item)
    return items


def native_tool_directory() -> dict:
    """Directory of 252 declared StableIDs versus THREE registered SDK tools."""
    records = stable_catalog()
    return {
        "sdk": "AGNO_3.1.10",
        "agentId": _AGENT_ID,
        "stableIdCount": len(records),
        "capabilities": list(records.values()),
        "registeredTools": [
            {
                "name": _SAFE_NAME, "registered": True,
                "canInvoke": True, "readOnly": True,
                "requiresApproval": bool(describe_yance_capability.requires_confirmation),
                "businessExecutable": False,
                "qualification": "NATIVE_READ_ONLY_CATALOG_TOOL",
            },
            {
                "name": "synthetic_source_lookup", "registered": True,
                "canInvoke": False, "readOnly": True,
                "requiresApproval": False, "businessExecutable": False,
                "qualification": "SYNTHETIC_TEST_ONLY",
            },
            {
                "name": "review_synthetic_draft", "registered": True,
                "canInvoke": False, "readOnly": False,
                "requiresApproval": True, "businessExecutable": False,
                "qualification": "SYNTHETIC_TEST_ONLY_REQUIRES_USER_APPROVAL",
            },
        ],
        "status": "NATIVE_SDK_CATALOG_READY_UPSTREAM_EXECUTION_NOT_ATTESTED",
    }


class NativeAgnoReadback:
    """Model-free native SQLite viewer; caller owns and verifies local scope."""

    def __init__(self, original_agno_db: SqliteDb):
        if not isinstance(original_agno_db, SqliteDb):
            raise TypeError("ORIGINAL_AGNO_SQLITE_REQUIRED")
        self._db = original_agno_db

    def _identity(self, scope, thread):
        scoped = _scope(scope)
        session_id = scoped.session_id(_thread(thread))
        return scoped.scoped_user_id, session_id

    def _run(self, scope, thread, run_id):
        user_id, session_id = self._identity(scope, thread)
        row = self._db.get_run(_run_id(run_id))
        if (row is None or row.user_id != user_id
                or row.session_id != session_id or row.agent_id != _AGENT_ID):
            # Mask foreign Run existence; no cross-user metadata leakage.
            raise NativeInspectionAccessError("RUN_NOT_FOUND_IN_PRIVATE_SCOPE")
        return row

    @staticmethod
    def _summary(run):
        tools = _tool_calls(run, details=False)
        status = _status(run.status)
        return {
            "runId": run.run_id,
            "sessionId": run.session_id,
            "status": status,
            "modelId": getattr(run, "model", None),
            "modelProvider": getattr(run, "model_provider", None),
            "createdAt": getattr(run, "created_at", None),
            "toolCallCount": len(tools),
            "requiresApproval": any(t["status"] == "WAITING_USER_APPROVAL" for t in tools)
            or status == "PAUSED",
            "qualityQualified": False,
            "canSend": False,
        }

    def list_runs(self, scope, *, thread="default", limit=25):
        user_id, session_id = self._identity(scope, thread)
        if type(limit) is not int or not 1 <= limit <= 100:
            raise NativeInspectionAccessError("LIMIT_INVALID")
        runs = self._db.get_runs(
            user_id=user_id, session_id=session_id, agent_id=_AGENT_ID,
            limit=limit,
        )
        return {"status": "NATIVE_RUNS_READ",
                "sessionId": session_id, "runs": [self._summary(r) for r in runs],
                "qualityQualified": False, "canSend": False}

    def get_run(self, scope, *, thread="default", run_id):
        run = self._run(scope, thread, run_id)
        summary = self._summary(run)
        summary.update({
            "status": _status(run.status),
            "tools": _tool_calls(run, details=True),
            "answer": run.content[:6000] if (
                _status(run.status) == "COMPLETED"
                and isinstance(run.content, str)
            ) else None,
            "approval": "WAITING_FOR_HUMAN_NOT_AUTO_EXECUTED"
                if summary["requiresApproval"] else None,
            "traceStatus": "READ_SEPARATELY_FROM_NATIVE_TRACES",
        })
        return summary

    def get_trace(self, scope, *, thread="default", run_id):
        run = self._run(scope, thread, run_id)
        traces, count = self._db.get_traces(
            run_id=run.run_id, user_id=run.user_id,
            session_id=run.session_id, agent_id=_AGENT_ID,
            limit=50,
        )
        entries = []
        for trace in traces:
            # Agno's native get_spans is scoped only by traceId; we have
            # already proven trace ownership via get_traces(user/session/run).
            spans = self._db.get_spans(trace_id=trace.trace_id)
            entries.append({
                "traceId": trace.trace_id, "runId": run.run_id,
                "status": trace.status,
                "durationMs": trace.duration_ms,
                "totalSpans": trace.total_spans,
                "errorCount": trace.error_count,
                "spans": [
                    {
                        "spanId": s.span_id,
                        "parentSpanId": s.parent_span_id,
                        "name": s.name,
                        "spanKind": s.span_kind,
                        "status": s.status_code,
                        "durationMs": s.duration_ms,
                    } for s in spans
                ],
            })
        return {
            "status": "NATIVE_TRACES_FOUND" if entries else "NATIVE_TRACE_NOT_FOUND",
            "runId": run.run_id,
            "traceCount": count,
            "traces": entries,
            "noTraceFabricated": True,
        }
