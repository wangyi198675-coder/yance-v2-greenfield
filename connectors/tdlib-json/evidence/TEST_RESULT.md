# W29 Issue #13 | executable nonproduction test receipt
DATE: 2026-10-25
RUN_DEVICE: DESKTOP-029FH47
NODE: v24.18.0
COMMAND: cd connectors/tdlib-json && npm run test:coverage
RESULT: TESTS 27 / PASS 27 / FAIL 0 / SKIP 0 / NOT_RUN 0
COVERAGE: line 98.74%; branch 91.98%; functions 96.00% (Node built-in coverage)
TESTS: connectors/tdlib-json/test/adapter.test.mjs
RUNTIME: connectors/tdlib-json/src/adapter.mjs
CRITICAL_CASES: synthetic-only input; full K tenant/account/chat/binding revision isolation; same TDLib client with multiple chats; duplicate MID; account rebind and revoked authority; integer precision; @extra with @client_id; quick ACK not sent/read; pending not ACK; old/new MID map; malformed errors; UNKNOWN no blind retry; late success reconciles; stale/late ACK quarantine; no native td_send, no Bot API, no second queue; emitted-event consumer failure replay.
LIMITS: only injected synthetic fixtures; no TDLib binary/tag build/SBOM, no login/account/provider calls/real MIDs/ACK, no W24/W25/W45 native integration, no durable crash recovery, no P4/UAT.
P0: Telegram AI/platform terms/legal consent and official API registration HOLD; W24 native K auth/binding fence and W25 sole Outbox integrate pending.
P1: W25 persistent consumer/transactional event cursor and restart-recovery must be proven after cross-Owner merge. No release authority inferred from this synthetic PASS.
