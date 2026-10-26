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


def request_identity(scope, thread_id, request_id, text):
    canonical = scope.canonical_k
    fingerprint = _hash(["PRIVATE_REQUEST_V1", canonical, thread_id, request_id])
    prompt_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
    native_id = str(uuid.UUID(hex=fingerprint[:32]))
    return {
        "fingerprint": fingerprint,
        "prompt_sha256": prompt_hash,
        "run_id": native_id,
        "metadata": {
            "w43_private_request_fingerprint": fingerprint,
            "w43_private_prompt_sha256": prompt_hash,
        },
    }
