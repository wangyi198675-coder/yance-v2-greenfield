"""W43 server-only DTO mapping for the existing W47 HTTP contract.

W47 must provide a W54-backed trusted request context. Raw profile data
from a browser is never authenticated by this module. No HTTP server,
new Agent, history DB or sender.
"""
from __future__ import annotations

import re
from private_principal_port import W43NativePrivateBrainPort, W47PrivateAccessError

SDK_PIN = "3.1.10"
PROVIDER = "LLAMACPP_LOCAL_QWEN3_8B_FREE"
MODEL = "qwen3:8b"


def _thread(args):
    if not isinstance(args, dict):
        raise W47PrivateAccessError("PRIVATE_INPUT_NOT_OBJECT", 422)
    value = args.get("thread", "personal")
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", value):
        raise W47PrivateAccessError("PRIVATE_THREAD_INVALID", 422)
    return value


class W43W47PrivateBridge:
    """Same method names and result shape expected by W47 private-brain-http."""

    def __init__(self, port: W43NativePrivateBrainPort):
        if not isinstance(port, W43NativePrivateBrainPort):
            raise TypeError("ORIGINAL_W43_PRIVATE_PORT_REQUIRED")
        self._port = port

    @staticmethod
    def _context(trusted_request_context):
        if trusted_request_context is None or isinstance(trusted_request_context, (str, dict, list, bytes)):
            raise W47PrivateAccessError("W47_TRUSTED_SERVER_REQUEST_BINDING_REQUIRED", 503)
        return trusted_request_context

    def runPrivateTurn(self, args, *, trusted_request_context=None):
        context = self._context(trusted_request_context)
        thread = _thread(args)
        if set(args) != {"profile", "thread", "message", "requestId"}:
            raise W47PrivateAccessError("W47_PRIVATE_BRIDGE_ARGS_INVALID", 422)
        # The profile object remains untrusted: ONLY the W47 server resolver
        # invoked by the original port can authenticate a current Principal.
        if not isinstance(args["message"], str):
            raise W47PrivateAccessError("PRIVATE_MESSAGE_INVALID", 422)
        run = self._port.turn(
            context, thread_id=thread,
            text=args["message"], request_id=args["requestId"],
        )
        # Original native W43 Port has checked Agno COMPLETED + persisted
        # original RunOutput in the SAME SqliteDb; never trust a model-text DTO.
        if run.get("status") != "COMPLETED":
            raise W47PrivateAccessError("AGNO_RUN_NOT_COMPLETED", 503)
        if (run.get("modelProvider") != PROVIDER or run.get("modelId") != MODEL
                or run.get("qualityQualified") is not False
                or run.get("canSend") is not False):
            raise W47PrivateAccessError("AGNO_MODEL_SOURCE_UNVERIFIED", 503)
        run_id, session_id = run["runId"], run["sessionId"]
        if (not isinstance(run_id, str) or not 6 <= len(run_id) <= 256
                or not isinstance(session_id, str) or not 6 <= len(session_id) <= 256):
            raise W47PrivateAccessError("AGNO_RUN_IDENTITY_INVALID", 503)
        provenance = {
            "type": "AGNO_RUN_RESULT", "sdk_pin": SDK_PIN,
            "run_id": run_id, "session_id": session_id,
            "source": PROVIDER, "model_id": MODEL,
            "purpose": "QUALITY_EVAL", "quality_qualified": False,
        }
        return {
            "status": "AGNO_RUN_COMPLETED",
            "original_response": run["assistantText"],
            "run_id": run_id, "session_id": session_id,
            "model_id": MODEL, "provider": PROVIDER,
            "sdk_pin": SDK_PIN, "provenance": provenance,
            "quality_qualified": False, "outbound": "DISABLED",
        }

    def readNativeHistory(self, args, *, trusted_request_context=None):
        context = self._context(trusted_request_context)
        thread = _thread(args)
        if set(args) != {"profile", "thread"}:
            raise W47PrivateAccessError("W47_PRIVATE_BRIDGE_ARGS_INVALID", 422)
        result = self._port.history(context, thread_id=thread)
        messages = result["messages"]
        run_count, complete_turn_count = result["runCount"], result["completeTurnCount"]
        if (result["qualityQualified"] is not False
                or result["canSend"] is not False
                or not isinstance(run_count, int)
                or not isinstance(complete_turn_count, int)
                or complete_turn_count > run_count
                or not isinstance(messages, list)):
            raise W47PrivateAccessError("AGNO_NATIVE_HISTORY_UNVERIFIED", 503)
        return {
            "status": result["status"], "messages": messages,
            "run_count": run_count, "complete_turn_count": complete_turn_count,
            "source": "W43_NATIVE_AGNO_CHAT_HISTORY",
            "quality_qualified": False, "outbound": "DISABLED",
        }
