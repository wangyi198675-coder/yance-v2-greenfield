"""W43 native PRIVATE scope derived ONLY from a W47 server-resolved principal.

This module is not a verifier or session issuer. W47 controls the trusted
resolver and must not expose any object constructor or principal reference to
HTTP clients. WITHOUT W47 resolver the production entry is SEALED.

Identity and run context are pure server-side: no OS username, browser actor,
SID, DB path, account/peer or arbitrary principal strings from a request.
"""
from __future__ import annotations

import hashlib
import json

_SCOPE_CREATION = object()


def _valid_opaque(value, name):
    if not isinstance(value, str) or not 8 <= len(value) <= 256:
        raise ValueError("W47_" + name + "_INVALID")
    if any(ord(ch) < 33 or ord(ch) > 126 or ch in r'\/|?&#:"<>' for ch in value):
        raise ValueError("W47_" + name + "_INVALID")
    return value


def _digest(parts):
    return hashlib.sha256(
        json.dumps(parts, ensure_ascii=True, separators=(",", ":")).encode()
    ).hexdigest()


def valid_thread(thread):
    if not isinstance(thread, str) or not 1 <= len(thread) <= 128:
        raise ValueError("THREAD_INVALID")
    if any(ord(c) < 32 or c in r'\/|?' for c in thread):
        raise ValueError("THREAD_INVALID")
    return thread


class NativePrivateScope:
    """Immutable, W43-internal PRIVATE Agno identity; not an HTTP input."""

    __slots__ = ("_installation", "_principal", "_seal")

    def __init__(self, installation, principal, *, _seal=None):
        if _seal is not _SCOPE_CREATION:
            raise PermissionError("W47_VERIFIED_PRINCIPAL_REQUIRED")
        self._installation = _valid_opaque(installation, "INSTALLATION")
        self._principal = _valid_opaque(principal, "PRINCIPAL")
        self._seal = _SCOPE_CREATION

    @property
    def space(self):
        return "PRIVATE"

    @property
    def canonical_k(self):
        return ("LOCAL_VERIFIED_PRIVATE", self._installation, self._principal, "PRIVATE")

    @property
    def scoped_user_id(self):
        return "w43-private-user-" + _digest(self.canonical_k)

    def session_id(self, thread="default"):
        return "w43-private-session-" + _digest([self.canonical_k, valid_thread(thread)])

    @property
    def storage_partition(self):
        return _digest(["v1", self._installation, self._principal])


def _scope_from_w47_verified_claim(claim):
    """Call only after W47 resolver verified live current session/OS scope."""
    return NativePrivateScope(
        claim.installation_ref, claim.principal_ref, _seal=_SCOPE_CREATION
    )


def is_native_private_scope(scope):
    return (
        type(scope) is NativePrivateScope
        and getattr(scope, "_seal", None) is _SCOPE_CREATION
        and scope.space == "PRIVATE"
    )
