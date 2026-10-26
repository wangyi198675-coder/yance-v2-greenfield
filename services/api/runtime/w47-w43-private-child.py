"""W47 private stdio bridge into the ORIGINAL W43 Agno PRIVATE port/ledger.
No public listener or identity issuer, no alternate Agent, database or sender.
The parent must revalidate the real W47 Session and W54 native Principal on
EACH W43 VERIFY challenge, including around SQLite transactions.
"""
from __future__ import annotations
import json
import os
from pathlib import Path
import sys

def emit(value):
    sys.__stdout__.write(json.dumps(value, ensure_ascii=True, separators=(",", ":")) + "\n")
    sys.__stdout__.flush()

def read():
    row = sys.stdin.readline()
    if not row or len(row) > 65536:
        raise RuntimeError("W47_PARENT_PROOF_TRANSPORT_CLOSED")
    result = json.loads(row)
    if not isinstance(result, dict):
        raise RuntimeError("W47_PARENT_FRAME_INVALID")
    return result

def main():
    sys.stdout = sys.stderr  # W43/Agno SDK prints can never become IPC frames.
    if len(sys.argv) != 2:
        raise RuntimeError("W43_SIGNED_MODULE_ROOT_REQUIRED")
    source = Path(sys.argv[1]).resolve(strict=True)
    if not source.is_dir():
        raise RuntimeError("W43_SIGNED_MODULE_ROOT_INVALID")
    # Parent-only module path, NEVER browser request.
    sys.path.insert(0, str(source))
    from private_principal_port import (
        W43NativePrivateBrainPort, W47VerifiedPrincipal, W47PrivateAccessError,
    )
    from private_request_ledger import NativePrivateRequestLedger

    request = read()
    method = request.get("method")
    # Original W43 3d3992c has no signed cloud adapter. Never silently
    # substitute local Qwen3 when user chose a cloud model.
    selected = request.get("modelSelection")
    if selected is not None:
        if not isinstance(selected, dict) or set(selected) != {"provider", "modelId"}:
            emit({"kind": "W43_ERROR", "error": "MODEL_SELECTION_INVALID", "httpStatus": 422})
            return
        if selected != {"provider": "local", "modelId": "qwen3:8b"}:
            emit({"kind": "W43_ERROR", "error": "CLOUD_AGNO_OWNER_ADAPTER_NOT_SIGNED", "httpStatus": 503})
            return
    if method not in {
        "turn", "history", "claim", "finish", "markUnknown", "reconcile"
    }:
        raise RuntimeError("W43_UNSUPPORTED_NATIVE_METHOD")
    thread = request.get("threadId")
    identifier = request.get("requestId")
    text = request.get("text")

    def resolve_current(_context, operation):
        emit({"kind": "VERIFY", "operation": operation})
        verified = read()
        if verified.get("kind") != "CLAIM":
            raise W47PrivateAccessError("LOCAL_SESSION_REQUIRED", 401)
        # Constructing a Python dataclass is NEVER proof of trusted identity;
        # this is transfer of a parent server-only, live W54/W47 claim.
        return W47VerifiedPrincipal(
            principal_ref=verified["principalRef"],
            installation_ref=verified["installationRef"],
            session_ref=verified["sessionRef"],
            session_revision=verified["sessionRevision"],
            revocation_generation=verified["revocationGeneration"],
            expires_at_ms=verified["expiresAtMs"],
            app_local_data_root=Path(verified["appLocalDataRoot"]),
        )

    original = W43NativePrivateBrainPort(
        resolve_current=resolve_current,
        local_key_file=os.environ.get("YANCE_W43_LOCAL_KEY_FILE"),
    )
    ledger = NativePrivateRequestLedger(original)
    kwargs = {"thread_id": thread, "request_id": identifier, "text": text}
    context = "W47_SERVER_CONTEXT"
    try:
        if method == "turn":
            result = original.turn(context, **kwargs)
        elif method == "history":
            result = original.history(context, thread_id=thread)
        elif method == "claim":
            result = ledger.claim(context, **kwargs)
        elif method == "finish":
            result = ledger.finish(context, receipt=request.get("receipt"), **kwargs)
        elif method == "markUnknown":
            result = ledger.mark_unknown(context, **kwargs)
        elif method == "reconcile":
            result = ledger.reconcile(context, **kwargs)
        emit({"kind": "RESULT", "result": result})
    except W47PrivateAccessError as e:
        emit({"kind": "W43_ERROR", "error": e.code, "httpStatus": e.http_status})

if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Suppress traceback, credentials, prompts and OS paths from IPC.
        emit({"kind": "BRIDGE_UNAVAILABLE"})
        sys.exit(2)
