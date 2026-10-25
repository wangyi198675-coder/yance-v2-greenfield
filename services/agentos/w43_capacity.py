"""W43 bounded one-slot admission for existing 127.0.0.1:11605 llama.cpp.

This DOES NOT start, stop, change, or proxy the user's model server.
Inter-thread + inter-process admission for W43 clients only; external GUI
requests are not governed by this lock. Fails closed on inability to lock.
"""
from __future__ import annotations

from contextlib import contextmanager
import os
from pathlib import Path
import tempfile
import threading
import time

_THREAD_GATE = threading.Lock()
MAX_WAIT_SECONDS = 90.0
_LOCK_FILE = Path(
    os.environ.get("LOCALAPPDATA") or tempfile.gettempdir()
) / "YanceV2" / "W43" / "llamacpp-11605-single-slot.lock"


def _try_lock(handle) -> bool:
    try:
        handle.seek(0)
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        return True
    except (OSError, BlockingIOError):
        return False


def _unlock(handle):
    handle.seek(0)
    if os.name == "nt":
        import msvcrt
        msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
    else:
        import fcntl
        fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


@contextmanager
def one_slot(timeout_seconds: float = MAX_WAIT_SECONDS):
    """Yield True if admitted; False when capacity unavailable by deadline.

    Never report a successful Agno run if admission fails. Release locks
    even when the SDK raises. Never put credentials or source text in file.
    """
    timeout_seconds = max(0.0, min(float(timeout_seconds), MAX_WAIT_SECONDS))
    started = time.monotonic()
    admitted = _THREAD_GATE.acquire(timeout=timeout_seconds)
    if not admitted:
        yield False
        return
    handle = None
    file_locked = False
    try:
        try:
            _LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
            handle = open(_LOCK_FILE, "a+b", buffering=0)
            if handle.seek(0, 2) == 0:
                handle.write(b"1")
            while True:
                if _try_lock(handle):
                    file_locked = True
                    break
                if time.monotonic() - started >= timeout_seconds:
                    break
                time.sleep(0.05)
        except OSError:
            file_locked = False
        yield file_locked
    finally:
        if file_locked and handle is not None:
            try:
                _unlock(handle)
            except OSError:
                pass
        if handle is not None:
            handle.close()
        _THREAD_GATE.release()
