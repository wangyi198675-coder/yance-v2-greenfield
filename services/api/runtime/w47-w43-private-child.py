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
    # The ONE W43 Agno 3.1.10 agent now supports official cloud SDKs.
    # This selection comes ONLY from the W47 server-private signed model port,
    # not directly from a browser. Match it against EACH fresh W54/W55 claim.
    selected = request.get("modelSelection")
    expected_backend = {
        "LLAMACPP_LOCAL_QWEN3_8B_FREE": "llamacpp",
        "OPENROUTER_USER_API": "openrouter",
        "OPENAI_USER_API": "openai",
    }
    if selected is not None:
        if (not isinstance(selected, dict)
                or set(selected) != {"provider", "modelId"}
                or selected.get("provider") not in expected_backend
                or not isinstance(selected.get("modelId"), str)):
            emit({"kind": "W43_ERROR", "error": "MODEL_SELECTION_INVALID", "httpStatus": 422})
            return
    if method not in {
        "turn", "history", "claim", "finish", "markUnknown", "reconcile",
        "nativeTools", "nativeRuns", "nativeRun", "nativeTrace"
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
        if selected is not None and (
            verified.get("modelBackend") != expected_backend[selected["provider"]]
            or verified.get("modelId") != selected["modelId"]
        ):
            raise W47PrivateAccessError("SIGNED_MODEL_SELECTION_CHANGED", 409)
        native_secret = None
        if verified.get("cloudSecretMode") == "W55_NATIVE_CALLBACK":
            if (verified.get("cloudKeyFile") is not None
                    or verified.get("modelBackend") not in {"openrouter", "openai"}):
                raise W47PrivateAccessError("W55_NATIVE_CREDENTIAL_SOURCE_INVALID", 503)
            def request_cloud_secret():
                # Ephemeral original W55 WinCred/DPAPI secret through this
                # existing private Python child stdio. No browser or file.
                emit({"kind": "CLOUD_KEY_REQUEST",
                      "backend": verified["modelBackend"],
                      "modelId": verified["modelId"]})
                answer = read()
                if answer.get("kind") != "CLOUD_KEY_SECRET":
                    raise W47PrivateAccessError("W55_NATIVE_CREDENTIAL_UNAVAILABLE", 503)
                return answer.get("secret")
            native_secret = request_cloud_secret
        # Reuse the ORIGINAL W43 cloud_secret_resolver hook. The key is
        # requested only from the server-private W47 -> W55 native port and
        # passed to the official Agno SDK, never a browser/request body.
        def native_cloud_secret():
            backend=verified.get("modelBackend")
            if backend not in {"openrouter","openai"}:
                raise W47PrivateAccessError("CLOUD_MODEL_NOT_SELECTED",409)
            if (verified.get("modelUserSelected") is not True or
                    verified.get("extraChargeApproved") is not True or
                    verified.get("protectedCredentialAttested") is not True):
                raise W47PrivateAccessError("CLOUD_COST_OR_KEY_NOT_APPROVED",403)
            provider="OPENROUTER_USER_API" if backend=="openrouter" else "OPENAI_USER_API"
            emit({"kind":"CLOUD_SECRET_REQUEST","provider":provider,
                  "modelId":verified["modelId"]})
            frame=read()
            if frame.get("kind")!="CLOUD_SECRET":
                raise W47PrivateAccessError("CLOUD_PROTECTED_CREDENTIAL_UNAVAILABLE",503)
            key=frame.get("value")
            if (not isinstance(key,str) or not 16<=len(key)<=400 or
                    any(ch.isspace() for ch in key)):
                raise W47PrivateAccessError("CLOUD_PROTECTED_CREDENTIAL_INVALID",503)
            return key

        return W47VerifiedPrincipal(
            principal_ref=verified["principalRef"],
            installation_ref=verified["installationRef"],
            session_ref=verified["sessionRef"],
            session_revision=verified["sessionRevision"],
            revocation_generation=verified["revocationGeneration"],
            expires_at_ms=verified["expiresAtMs"],
            app_local_data_root=Path(verified["appLocalDataRoot"]),
            model_backend=verified.get("modelBackend", "unconfigured"),
            model_id=verified.get("modelId", ""),
            cloud_key_file=(Path(verified["cloudKeyFile"])
                            if verified.get("cloudKeyFile") else None),
            cloud_secret_resolver=(native_secret if verified.get("cloudSecretMode") == "W55_NATIVE_CALLBACK" else
                                   native_cloud_secret if verified.get("cloudCredentialSource") == "W55_NATIVE_WIN_CRED" else None),
            model_user_selected=verified.get("modelUserSelected") is True,
            extra_charge_approved=verified.get("extraChargeApproved") is True,
            protected_credential_attested=verified.get("protectedCredentialAttested") is True,
            model_selection_epoch=verified.get("modelSelectionEpoch", 0),
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
        elif method == "nativeTools":
            result = original.native_tools(context)
        elif method == "nativeRuns":
            result = original.native_runs(
                context, thread_id=thread, limit=request.get("limit", 25))
        elif method == "nativeRun":
            result = original.native_run(
                context, thread_id=thread, run_id=request.get("runId"))
        elif method == "nativeTrace":
            result = original.native_trace(
                context, thread_id=thread, run_id=request.get("runId"))
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
