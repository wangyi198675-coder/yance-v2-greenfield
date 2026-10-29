"""W43 Issue #146 adapter contract unit tests: ALL inputs are fake fixtures.

These tests do NOT constitute a live W44 grant, real user login, real Agno
model execution, provider ACK or browser acceptance. No account messages sent.
"""
from __future__ import annotations
from hashlib import sha256
from pathlib import Path
from types import SimpleNamespace
import sys
import time

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from contact_hosting_message_analysis import (
    OriginalAgnoContactPort, OriginalPorts, NativeContactHold, _digest,
)


def k(peer="fake-A", account="fixture-one", revision=1):
    return {"tenant": "SYNTHETIC_TEST_ONLY", "account": account,
            "channel": "FB_PERSONAL", "peer_id": peer,
            "binding_revision": revision}


class Fixture:
    def __init__(self):
        self.identity = k()
        self.current_epoch = 3
        self.authority_status = "ALLOWED"
        self.grant_status = "COMMITTED"
        self.budget = "AVAILABLE"
        self.expires = int(time.time() * 1000) + 60000
        self.auth = False
        self.task = "PAUSED"
        self.original = "Fake message: Can we talk tomorrow?"
        self.translation = "虚构译文：明天能聊吗？"
        self.translated_hash = sha256(self.original.encode()).hexdigest()
        self.mid = "fixture-provider-mid-A001"
        self.claim_state = "CLAIMED"
        self.calls = []
        self.model = FakeRuntime(self)
        self.precheck_count = 0
        self.revoke_on_postrun = False

    def qualify(self, ctx, identity, operation):
        assert ctx is self
        assert identity == self.identity
        self.precheck_count += 1
        if self.revoke_on_postrun and self.precheck_count >= 3:
            self.current_epoch += 1
            self.revoke_on_postrun = False
        return {"status": self.authority_status, "operation": operation,
                "canonicalK": dict(self.identity),
                "consentEpoch": self.current_epoch, "accountEpoch": 1,
                "custodyEpoch": 1, "grantGeneration": 1,
                "expiresAtMs": self.expires,
                "budgetStatus": self.budget}

    def message(self, ctx, identity, mid):
        assert ctx is self
        return {"canonicalK": dict(self.identity),
                "sourceMid": self.mid, "originalText": self.original,
                "originalSha256": sha256(self.original.encode()).hexdigest(),
                "translatedText": self.translation,
                "translationOriginalSha256": self.translated_hash}

    def task_state(self, ctx, identity):
        return {"canonicalK": dict(self.identity),
                "state": self.task, "custody": "AUTO",
                "lastRunId": None, "lastSessionId": None}

    def grant_state(self, ctx, identity, operation):
        if operation == "READ_HOSTING":
            return {"canonicalK": dict(self.identity),
                    "status": self.grant_status,
                    "grantGeneration": 1, "budgetStatus": self.budget,
                    "realUserAuthorized": self.auth,
                    "realAccountVerified": self.auth,
                    "authorityClass": "SYNTHETIC_FIXTURE_ONLY"}
        return self.qualify(ctx, identity, operation)

    def grant_action(self, ctx, identity, action, expected):
        self.calls.append(("grantAction", action))
        if action == "PAUSE": self.task = "PAUSED"
        return {"status": "COMMITTED", "generation": 2,
                "requestId": "fixture-W44-001"}

    def claim(self, ctx, req, fingerprint):
        self.calls.append(("claim", req))
        return {"state": self.claim_state}

    def begin(self, ctx, req, fingerprint):
        self.calls.append(("begin", req))
        return {"state": "EXECUTING"}

    def complete(self, ctx, req, fingerprint, run_id):
        self.calls.append(("complete", run_id))
        return {"state": "COMPLETED"}

    def unknown(self, ctx, req, fingerprint):
        self.calls.append(("unknown", req))

    def port(self):
        return OriginalAgnoContactPort(OriginalPorts(
            current_k=lambda ctx: dict(self.identity),
            qualify=self.grant_state, read_message=self.message,
            task_state=self.task_state, grant_action=self.grant_action,
            request_claim=self.claim, request_begin=self.begin,
            request_complete=self.complete, request_unknown=self.unknown,
            agno_runtime=lambda ctx: self.model,
        ))


class FakeRuntime:
    """Fake SDK RunOutput/db, not an actual Agno or real model run."""
    def __init__(self, env):
        self.env = env
        self.db = self
        self.rows = []
        self.agents = {"CONTACT": FakeAgent(self)}
        self.model_id = "fixture-no-real-model"

    def _selected_model_ready(self):
        return True

    def get_runs(self, **kwargs):
        return [r for r in self.rows if r.user_id == kwargs["user_id"]
                and r.session_id == kwargs["session_id"]]

    def get_traces(self, **kwargs):
        return [], 0


class FakeAgent:
    id = "w43-private-brain"
    def __init__(self, runtime):
        self.runtime = runtime
        self.runs = []

    def run(self, prompt, *, user_id, session_id, metadata):
        self.runs.append({"prompt": prompt, "user_id": user_id,
                          "session_id": session_id, "metadata": metadata})
        run_id = "fixture-Agno-run-0001"
        status = SimpleNamespace(value="COMPLETED")
        row = SimpleNamespace(run_id=run_id, user_id=user_id,
            session_id=session_id, agent_id=self.id, status=status,
            content="FAKE ANALYSIS ONLY", metadata=dict(metadata))
        self.runtime.rows.append(row)
        return row


def test_hosting_read_is_not_a_grant_or_automatic_task_start():
    f = Fixture()
    f.task = "RUNNING"
    state = f.port().read_hosting(f)
    assert state["taskState"] == "RUNNING"
    assert state["isHosting"] is False
    assert state["canSend"] is False
    f.auth = True
    state = f.port().read_hosting(f)
    assert state["isHosting"] is True


def test_pause_is_possible_when_model_budget_exhausted_and_grant_expired():
    f = Fixture()
    f.task = "RUNNING"
    f.budget = "EXHAUSTED"
    f.expires = int(time.time() * 1000) - 5000
    result = f.port().change_hosting(f, action="PAUSE", expected={
        "expectedGeneration": 1, "expectedBindingRevision": 1,
        "expectedAccountEpoch": 1, "expectedConsentEpoch": 3,
        "expectedCustodyEpoch": 1,
    })
    assert result["status"] == "COMMITTED"
    assert result["taskState"] == "PAUSED"
    assert not result["isHosting"]


def test_expired_or_budget_revoked_resume_rejected_before_w44_action():
    f = Fixture()
    f.budget = "EXHAUSTED"
    with pytest.raises(NativeContactHold, match="MODEL_BUDGET_NOT_AUTHORIZED"):
        f.port().change_hosting(f, action="RESUME", expected={
            "expectedGeneration": 1, "expectedBindingRevision": 1,
            "expectedAccountEpoch": 1, "expectedConsentEpoch": 3,
            "expectedCustodyEpoch": 1,
        })
    assert not any(x[0] == "grantAction" for x in f.calls)


def test_stale_takeover_custody_epoch_rejected_before_action():
    f = Fixture()
    with pytest.raises(NativeContactHold, match="HOSTING_STALE_AUTHORITY_409"):
        f.port().change_hosting(f, action="RESUME", expected={
            "expectedGeneration": 1, "expectedBindingRevision": 1,
            "expectedAccountEpoch": 1, "expectedConsentEpoch": 3,
            "expectedCustodyEpoch": 0,
        })


def test_contact_message_and_translation_provenance_use_one_unique_session():
    f = Fixture()
    reply = f.port().analyze_message(f, source_mid=f.mid,
                                     request_id="fixture_abcdef123456")
    assert reply["status"] == "AGNO_MESSAGE_ANALYSIS_COMPLETED"
    assert reply["usedVerifiedTranslation"] is True
    assert reply["sourceMid"] == f.mid
    assert reply["externalEffects"] is False and reply["canSend"] is False
    assert reply["traceCount"] == 0 and reply["traceIds"] == []
    run = f.model.agents["CONTACT"].runs[0]
    assert f.original in run["prompt"] and f.translation in run["prompt"]
    assert f.mid in run["prompt"]
    assert run["metadata"]["w43_message_analysis"]["sourceMid"] == f.mid
    assert "contact-user" in run["user_id"]
    assert ("claim", "fixture_abcdef123456") in f.calls
    assert ("begin", "fixture_abcdef123456") in f.calls
    assert ("complete", "fixture-Agno-run-0001") in f.calls


def test_stale_translation_is_dropped_not_mixed_into_original():
    f = Fixture()
    f.translated_hash = sha256(b"old source").hexdigest()
    result = f.port().analyze_message(f, source_mid=f.mid,
                                      request_id="fixture_abcdef123457")
    assert result["usedVerifiedTranslation"] is False
    assert f.translation not in f.model.agents["CONTACT"].runs[0]["prompt"]


def test_cross_account_same_peer_keeps_distinct_session():
    a, b = Fixture(), Fixture()
    b.identity = k(peer="fake-A", account="fixture-other-account")
    a.port().analyze_message(a, source_mid=a.mid, request_id="fixture_AAA12345")
    b.port().analyze_message(b, source_mid=b.mid, request_id="fixture_BBB12345")
    a_run = a.model.agents["CONTACT"].runs[0]
    b_run = b.model.agents["CONTACT"].runs[0]
    assert a_run["user_id"] != b_run["user_id"]
    assert a_run["session_id"] != b_run["session_id"]


def test_contact_B_and_C_have_separate_sessions_from_A():
    ids = []
    for peer in ("fake-A", "fake-B", "fake-C"):
        f = Fixture()
        f.identity = k(peer=peer)
        f.port().analyze_message(f, source_mid=f.mid, request_id="fixture_" + peer)
        ids.append(f.model.agents["CONTACT"].runs[0]["session_id"])
    assert len(set(ids)) == 3


def test_foreign_mid_rejected_without_claim_or_model():
    f = Fixture()
    with pytest.raises(NativeContactHold, match="MESSAGE_MID_MISMATCH"):
        f.port().analyze_message(f, source_mid="fixture-forged-MID",
                                 request_id="fixture_abcdef123456")
    assert not f.model.agents["CONTACT"].runs
    assert not f.calls


def test_foreign_source_k_rejected_without_model():
    f = Fixture()
    original = f.message
    def alien(ctx, ident, mid):
        row = original(ctx, ident, mid)
        row["canonicalK"] = k(peer="fake-attacker")
        return row
    f.message = alien
    with pytest.raises(NativeContactHold, match="MESSAGE_CONTACT_MISMATCH"):
        f.port().analyze_message(f, source_mid=f.mid,
                                 request_id="fixture_abcdef123456")
    assert not f.model.agents["CONTACT"].runs


def test_revoke_during_model_run_suppresses_response_and_marks_unknown():
    f = Fixture()
    f.revoke_on_postrun = True
    with pytest.raises(NativeContactHold, match="CONTACT_AUTHORITY_REVOKED_DURING_RUN"):
        f.port().analyze_message(f, source_mid=f.mid,
                                 request_id="fixture_abcdef123456")
    assert any(x[0] == "unknown" for x in f.calls)
    assert not any(x[0] == "complete" for x in f.calls)


def test_duplicate_or_unknown_request_never_calls_model_again():
    f = Fixture()
    f.claim_state = "UNKNOWN"
    with pytest.raises(NativeContactHold, match="ALREADY_CLAIMED_OR_UNKNOWN"):
        f.port().analyze_message(f, source_mid=f.mid,
                                 request_id="fixture_abcdef123456")
    assert not f.model.agents["CONTACT"].runs


def test_missing_budget_or_expired_permission_rejected_pre_model():
    f = Fixture()
    f.budget = "EXHAUSTED"
    with pytest.raises(NativeContactHold, match="MODEL_BUDGET_NOT_AUTHORIZED"):
        f.port().analyze_message(f, source_mid=f.mid,
                                 request_id="fixture_abcdef123456")
    assert not f.calls
    f.budget = "AVAILABLE"
    f.expires = int(time.time() * 1000) - 1000
    with pytest.raises(NativeContactHold, match="CONTACT_AUTHORITY_EXPIRED"):
        f.port().analyze_message(f, source_mid=f.mid,
                                 request_id="fixture_abcdef123456")


def test_invalid_mid_source_hash_and_request_id_rejected():
    f = Fixture()
    for req in ("", "bad", "../../evil"):
        with pytest.raises(NativeContactHold, match="REQUEST_ID_INVALID"):
            f.port().analyze_message(f, source_mid=f.mid, request_id=req)
    f.original = "Changed original without matching hash"
    f.message = lambda ctx, ident, mid: {
        "canonicalK": dict(f.identity), "sourceMid": f.mid,
        "originalText": f.original, "originalSha256": "wrong"}
    with pytest.raises(NativeContactHold, match="MESSAGE_ORIGINAL_HASH_MISMATCH"):
        f.port().analyze_message(f, source_mid=f.mid,
                                 request_id="fixture_abcdef123456")
    assert not f.model.agents["CONTACT"].runs


def test_native_run_without_persisted_provenance_is_not_success():
    f = Fixture()
    def unpersisted(*args, **kwargs):
        return SimpleNamespace(run_id="fixture-run",session_id="fake",
            content="fake answer",status=SimpleNamespace(value="COMPLETED"))
    f.model.agents["CONTACT"].run = unpersisted
    with pytest.raises(NativeContactHold, match="AGNO_NATIVE_ANALYSIS_PROVENANCE_UNVERIFIED"):
        f.port().analyze_message(f, source_mid=f.mid,
                                 request_id="fixture_abcdef123456")
    assert any(x[0] == "unknown" for x in f.calls)
