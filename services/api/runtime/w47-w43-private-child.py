"""W47's private stdio transport into ORIGINAL W43 private_principal_port.
No HTTP listener, no alternate Agent or ChatHistory DB. Never run directly
as an authorization service. Actual verified claims arrive only after an
in-flight call to the W47 parent process resolver over private stdio.
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
    return json.loads(row)


def main():
    # W43/Agno SDK diagnostic prints must never become stdio protocol frames.
    # Protocol frames are emitted explicitly via sys.__stdout__ only.
    sys.stdout = sys.stderr
    if len(sys.argv) != 2:
        raise RuntimeError("W43_ORIGINAL_MODULE_ROOT_REQUIRED")
    source = Path(sys.argv[1]).resolve(strict=True)
    if not source.is_dir():
        raise RuntimeError("W43_ORIGINAL_MODULE_ROOT_INVALID")
    # Module path set by W47 launcher ONLY; never supplied by HTTP query/body.
    sys.path.insert(0, str(source))
    from private_principal_port import (
        W43NativePrivateBrainPort, W47VerifiedPrincipal, W47PrivateAccessError
    )
    request = read()
    if not isinstance(request, dict):
        raise RuntimeError("W47_PRIVATE_REQUEST_REQUIRED")
    method = request.get("method")
    thread = request.get("threadId")
    if method not in {"turn", "history"}:
        raise RuntimeError("W47_UNSUPPORTED_BRIDGE_METHOD")

    def resolve_current(_opaque, operation):
        emit({"kind": "VERIFY", "operation": operation})
        verified = read()
        if verified.get("kind") != "CLAIM":
            raise W47PrivateAccessError("LOCAL_SESSION_REQUIRED", 401)
        # This type merely transfers a W47-authenticated private callback
        # across a process. Dataclass construction itself is NOT a verifier.
        return W47VerifiedPrincipal(
            principal_ref=verified["principalRef"],
            installation_ref=verified["installationRef"],
            session_ref=verified["sessionRef"],
            session_revision=verified["sessionRevision"],
            revocation_generation=verified["revocationGeneration"],
            expires_at_ms=verified["expiresAtMs"],
            app_local_data_root=Path(verified["appLocalDataRoot"]),
        )

    # Original Agno 3.1.10 runtime, Qwen3 local key and native SqliteDb.
    agent = W43NativePrivateBrainPort(
        resolve_current=resolve_current,
        local_key_file=os.environ.get("YANCE_W43_LOCAL_KEY_FILE"),
    )
    try:
        if method == "turn":
            result = agent.turn("W47_SERVER_CONTEXT", thread_id=thread,
                                text=request["text"], request_id=request["requestId"])
        else:
            result = agent.history("W47_SERVER_CONTEXT", thread_id=thread)
        emit({"kind": "RESULT", "result": result})
    except W47PrivateAccessError as exc:
        emit({"kind": "W43_ERROR", "error": exc.code, "httpStatus": exc.http_status})


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Do not print user prompts, provider secrets, paths or model data.
        emit({"kind": "BRIDGE_UNAVAILABLE"})
        sys.exit(2)
