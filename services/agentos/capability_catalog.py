"""Read-only 252 StableID directory, not 252 synthetic executable tools.

Source is V2 contracts/source/10_authority252.csv; never import V1 code.
Native Agno Tool only inspects what an ID means. Every business execution
needs an independent live native owner + authenticated scope + grant proof.
"""
from __future__ import annotations
import csv
import json
import re
from pathlib import Path
from agno.tools import tool

CATALOG = Path(__file__).resolve().parents[2] / "contracts" / "source" / "10_authority252.csv"
_VALID = re.compile(r"^(?:[A-Z]{1,3}[0-9]{2,3}|UIE-[0-9]{3})$")


def stable_catalog():
    if not CATALOG.is_file():
        return {}
    with CATALOG.open("r", encoding="utf-8-sig", newline="") as handle:
        records = list(csv.DictReader(handle))
    entries = {}
    for rec in records:
        sid = rec.get("stable_id", "")
        if not _VALID.fullmatch(sid) or sid in entries:
            raise ValueError("STABLE_ID_CATALOG_INVALID_OR_DUPLICATED")
        entries[sid] = {
            "stableId": sid,
            "capability": rec.get("capability", ""),
            "canonicalOwner": rec.get("canonical_owner", ""),
            "category": rec.get("classification", ""),
            "qualification": "CATALOG_ONLY_REQUIRES_REAL_UPSTREAM_AND_OWNER_AUTHORIZATION",
            "executable": False,
        }
    return entries


@tool
def describe_yance_capability(stable_id: str) -> str:
    """Look up a declared V2 StableID. Never execute an unapproved business action.

    Args:
        stable_id: The A01-style YANCE StableID from the V2 capability catalogue.
    """
    if not isinstance(stable_id, str) or not _VALID.fullmatch(stable_id):
        return json.dumps({"status": "INVALID_STABLE_ID", "executable": False})
    rec = stable_catalog().get(stable_id)
    if rec is None:
        return json.dumps({"status": "STABLE_ID_NOT_REGISTERED", "executable": False})
    return json.dumps({"status": "DECLARED_NOT_AUTHORIZED_FOR_EXECUTION", **rec}, ensure_ascii=False)
