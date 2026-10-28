"""Contract-only test: fake model callback, REAL Agno Agent/SqliteDb."""
import tempfile
import unittest
from pathlib import Path
from agno.agent import Agent
from agno.db.sqlite import SqliteDb
from agno.models.message import Message
from siwc_agno_model import ChatGPTSiwcModel


class SiwcAgnoContract(unittest.TestCase):
    def test_exact_messages_and_model_id(self):
        called = []
        model = ChatGPTSiwcModel(model_id="gpt-test", invoke_official=lambda **k: (
            called.append(k) or "real-callback-result"))
        response = model.invoke([
            Message(role="system", content="Follow instructions"),
            Message(role="user", content="Hello")
        ])
        self.assertEqual(response.content, "real-callback-result")
        self.assertEqual(called[0]["model_id"], "gpt-test")
        self.assertEqual(called[0]["messages"][0]["role"], "developer")

    def test_agno_run_and_sqlite_history(self):
        prompts = []
        def invoke_official(**kwargs):
            prompts.append(kwargs)
            return "sample response through official adapter"
        with tempfile.TemporaryDirectory() as tmp:
            db = SqliteDb(db_file=str(Path(tmp) / "agno.sqlite"))
            agent = Agent(id="original-brain", model=ChatGPTSiwcModel(
                model_id="gpt-test", invoke_official=invoke_official),
                db=db, add_history_to_context=True, telemetry=False)
            out = agent.run("hello", user_id="local-test", session_id="same-thread")
            self.assertEqual(out.content, "sample response through official adapter")
            self.assertEqual(out.status.value, "COMPLETED")
            rows = db.get_runs(user_id="local-test", session_id="same-thread",
                               agent_id="original-brain")
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0].run_id, out.run_id)
            self.assertEqual(rows[0].content, out.content)
            self.assertEqual(len(prompts), 1)
            db.close()

    def test_original_w43_private_runtime_uses_agno_and_original_db(self):
        from yance_agentos import NativeAgnoRuntime
        with tempfile.TemporaryDirectory() as tmp:
            def provider(**kwargs):
                return "W43 stored answer"
            runtime = NativeAgnoRuntime(
                str(Path(tmp) / "native.sqlite"), backend="siwc",
                model_id="official-test-model", purpose="QUALITY_EVAL",
                user_selected=True, official_response_resolver=provider)
            self.assertEqual(runtime.provider, "CHATGPT_PLAN_SIWC")
            self.assertFalse(runtime.agents["PRIVATE"].tools)
            receipt = runtime.agents["PRIVATE"].run(
                "question", user_id="user-private", session_id="session-private")
            self.assertEqual(receipt.status.value, "COMPLETED")
            self.assertEqual(receipt.content, "W43 stored answer")
            rows = runtime.db.get_runs(
                user_id="user-private", session_id="session-private",
                agent_id="w43-private-brain")
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0].run_id, receipt.run_id)
            runtime.db.close()

    def test_w43_ledger_native_turn_and_history_with_selected_siwc(self):
        import time
        from private_principal_port import W43NativePrivateBrainPort, W47VerifiedPrincipal
        from private_request_ledger import NativePrivateRequestLedger
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            answers = []
            def official(**kwargs):
                answers.append(kwargs)
                return "original W43 persistent SIWC answer"
            principal = W47VerifiedPrincipal(
                principal_ref="principal_SIWC123", installation_ref="install_SIWC123",
                session_ref="session_SIWC123", session_revision=1,
                revocation_generation=0,
                expires_at_ms=int(time.time()*1000)+120000,
                app_local_data_root=Path(tmp), model_backend="siwc",
                model_id="official-test-model", model_user_selected=True,
                model_selection_epoch=1, official_response_resolver=official)
            port = W43NativePrivateBrainPort(resolve_current=lambda *_: principal)
            ledger = NativePrivateRequestLedger(port)
            try:
                request = dict(thread_id="personal", request_id="req_siwc_10001",
                               text="Reply in one sentence.")
                claimed = ledger.claim("private", **request)
                self.assertEqual(claimed["state"], "CLAIMED")
                result = port.turn("private", **request)
                self.assertEqual(result["status"], "COMPLETED")
                self.assertEqual(result["modelProvider"], "CHATGPT_PLAN_SIWC")
                self.assertEqual(result["modelId"], "official-test-model")
                self.assertEqual(result["assistantText"], "original W43 persistent SIWC answer")
                ledger.finish("private", **request, receipt=result)
                history = port.history("private", thread_id="personal")
                self.assertEqual(history["status"], "HISTORY_PRESENT")
                self.assertGreaterEqual(history["completeTurnCount"], 1)
                self.assertEqual(len(answers), 1)
            finally:
                for runtime in port._runtimes.values():
                    runtime.db.close()

    def test_existing_agno_tool_history_does_not_block_siwc_text_model(self):
        observed = []
        model = ChatGPTSiwcModel(
            model_id="official-test-model",
            invoke_official=lambda **x: observed.append(x) or "Reply")
        reply = model.invoke([
            Message(role="system", content="Be useful"),
            Message(role="user", content="Earlier question"),
            Message(role="tool", content="A previous local model used a tool"),
            Message(role="assistant", content="Earlier answer"),
            Message(role="user", content="Follow-up question"),
        ])
        self.assertEqual(reply.content, "Reply")
        self.assertEqual(
            [x["role"] for x in observed[0]["messages"]],
            ["developer", "user", "assistant", "user"],
        )

    def test_rejects_nontext(self):
        model = ChatGPTSiwcModel(model_id="gpt-test",
                                 invoke_official=lambda **k: "never")
        with self.assertRaises(ValueError):
            model.invoke([Message(role="user", content=[{"text":"a"}])])


if __name__ == "__main__":
    unittest.main()
