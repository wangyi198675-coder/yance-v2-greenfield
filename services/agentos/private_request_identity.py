"""W43 PRIVATE request identity: deterministic Agno Run ID, not a new Agent.

The exact request fingerprint is bound to native PRIVATE Principal, thread
and client requestId, never the short-lived W47 cookie/session reference.
"""
from __future__ import annotations
import hashlib
import json
import uuid


def _hash(values):
    return hashlib.sha256(
        json.dumps(values, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def request_identity(scope, thread_id, request_id, text, *,
                     model_backend="llamacpp", model_id="qwen3:8b",
                     selection_epoch=0):
    canonical = scope.canonical_k
    fingerprint = _hash(["PRIVATE_REQUEST_V1", canonical, thread_id, request_id])
    prompt_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
    native_id = str(uuid.UUID(hex=fingerprint[:32]))
    # Same client requestId must NOT execute a different paid model after a
    # switch or falsely label an old original Agno Run as the new provider.
    model_hash = _hash(["EXACT_USER_MODEL_V1", model_backend, model_id, selection_epoch])
    return {
        "fingerprint": fingerprint,
        "prompt_sha256": prompt_hash,
        "model_selection_sha256": model_hash,
        "run_id": native_id,
        "metadata": {
            "w43_private_request_fingerprint": fingerprint,
            "w43_private_prompt_sha256": prompt_hash,
            "w43_private_model_selection_sha256": model_hash,
            "w43_private_model_backend": model_backend,
            "w43_private_model_id": model_id,
        },
    }
