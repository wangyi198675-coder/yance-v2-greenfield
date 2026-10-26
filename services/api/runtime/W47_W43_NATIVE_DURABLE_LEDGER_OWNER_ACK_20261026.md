# W47 | Original W43 Agno SQLite durable requestId ledger join — scoped Owner ACK
2026-10-26; works only inside services/api/runtime/**. Strict NO_DEPLOY/NO_SEND.

## Signed authoritative dependencies
- W47 parent canonical HTTP+Python IPC: dc56b6316bd3b0f24fd900113e106ac059eb5402.
- W43 original native Agno SqliteDb request ledger: 3d3992c80d16e5e4431db53c6f2072d99a9f0f33, Draft PR #54. 90PASS+1SKIP were W43's own tests and must not be re-counted as W47 tests.
- W54 latest Windows native process-only profile/ref/source: 9a3dc464deb97a0de69bb8ff3b43048d3805611a (not yet a secure authenticated W47 cross-process transport). W54 explicitly states same-user file/JS identity claims are not authority.
- W09-2 last preexisting isolated three-owner QA HEAD bd3ac955b577286a2ad90c5328eea50fda96eea1; no new combined HEAD or production deployment is signed yet.

## Real source delta
W47 original Node HTTPSafe/private session route remains POST /api/v2/private-brain/turn {threadId,text,requestId}, GET /api/v2/private-brain/history?threadId=personal.
- Extend existing w47-w43-private-child.py ONLY: methods turn/history/claim/finish/markUnknown/reconcile through ORIGINAL W43NativePrivateBrainPort and ORIGINAL NativePrivateRequestLedger(originalPort) in the SAME native SqliteDb file. Each W43 current principal read triggers private stdio VERIFY, answered only by Node after its own live current server-issued Session + separately verified W54 profile. No new HTTP listener, model runtime, ChatHistory schema/table/DB or sender.
- private-python-port.mjs now exposes matching six private methods. private-native-ledger-port.mjs adapts W47 existing server-owned {context:{checkCurrent},threadId,requestId,text,receipt?} to those ORIGINAL W43 Python methods. W43 itself has the only durable identity fingerprint and prompt hash; W47 removes its parallel computed JS ledger key.
- HTTP claim BEFORE W43 run; W43 original begin_execute atomically transitions IN_PROGRESS->EXECUTING before SDK run; native finish must verify actual persisted Agno Run; Node only acknowledges after committed native finish. Same id+different text =>409; concurrent in-flight =>409; UNKNOWN invokes W43 reconcile which reads only persisted ORIGINAL native Agno run metadata and NEVER reruns model; unreconciled=>409; confirmed native persisted result=>200 replay without Agent.run.
- Any error after a possibly executed model marks UNKNOWN where permission permits. Stale revision/generation/expired Session before, during and after W43 calls=>401/409; no W54 native profile=>503; incorrect DTO=>422; missing/incorrect Origin/CSRF=>403. Native ledger port is deliberately NOT installed into server.mjs without W54 authenticated producer and W09 independent SEC signature. Production real PRIVATE POST remains default 503; do not treat test-only Principal as signed native Windows identity.

## Independent W47 evidence boundaries
- Existing W47 local Session/Host/Origin/SEND deny tests continue without reconstructing owner code.
- New genuine W47 Node->W43 Python native SQLite ledger integration with test-only W54 principal and private temp root: first CLAIMED, concurrent duplicate IN_PROGRESS, same id different text CONFLICT, mark UNKNOWN, reconcile UNKNOWN without model execution, fresh Python/Node port still sees UNKNOWN, different test users/threads separate, mid-operation revision change returns409. No model run (0), no external sender (0), no real W54 OS-user/attacker-tested authentication.
- Original W43 owner tests verify persisted native SDK RunOutput reconciliation and original Agent/Session/Prompt metadata. Their historical fixture model records do not count as new real Qwen3 authorized user reply from this W47 join.
- Isolation root C:\Users\1\Documents\YanceV2\W47_W43_NATIVE_IPC_QA_20261026, no copy to actual W54 protected user AppData.
- Further tests/new HEAD exact regression and per-user Windows UAT are mandatory after W54 source/SEC approval.

## Strict remaining gates
1. W54 original Owner must sign secure child process authenticated provenance / current OS user current-install root and generation, not just copied W54 fields. W47 resolver remains NULL in the actual server; forbid forged source:W54_NATIVE_CURRENT_USER to bypass native check.
2. W09-2 SEC signs exact combined W47/W43/W54 native module/source hashes, Windows OS user/install isolation and minimal native connection. Only then W47 may wire original native port and ledger together inside server.mjs and run genuine PRIVATE Qwen3 8B Run/ChatHistory.
3. W46 sole existing BRAIN UI stays original, no new Composer. W24/W44/W25 channel sending authorization remains entirely separate.
4. No actual 44751 human terminal-pair, no real W54-approved private Agno two-turn Qwen3 cold restore yet. Keep USER_DELIVERED_HOLD, NO_MAIN_MERGE and no real platform send.
