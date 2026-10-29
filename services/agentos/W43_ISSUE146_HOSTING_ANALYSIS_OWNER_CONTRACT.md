# W43 → W09 | Issue #146 | Original Agno Hosting / Message Analysis

Date 2026-10-29. Owner: services/agentos/** only. Incremental branch owner/w43/issue146-hosting-analysis-20261029 based on prior W43 original branch. No second Agent, scheduler, ChatHistory, HTTP server, grant system, budget ledger, or message sender.

## Availability and evidence boundary

DESKTOP-029FH47 was Online, but Desktop Commander explicitly returned monthly usage exhausted and instructed not to retry. Therefore this turn could not read the latest local MasterController document, test the actual remote original Agno process, or refresh the fixed 44751 site. GitHub Issue #146 W09 Coordinator reported (earlier, not re-verified by W43) Web SHA 706e934b983ad80da0132ab2ce84440f58975e68, API SHA abc106ee18f425f99de26dafcf24e49c4779b399, canSend=false, externalEffects=false, DESIGN_ACCEPTANCE_RED. No new local-model Run ID, real Grant, Browser UI success, or live message analysis is claimed.

## Confirmed existing owner sources, not reimplemented

W44 original services/api/src/domains/grant-custody-budget/GRANT_MANAGEMENT_W09_2_P0_CONTRACT.md supplies readGrantState({identity,actor,scope}) and grantAction({identity,actor,scope,action:ISSUE|PAUSE|RESUME|REVOKE,idempotencyKey,expectedGeneration,expectedBindingRevision,expectedAccountEpoch,expectedConsentEpoch,expectedCustodyEpoch,payload}). PENDING/ARMED/UNKNOWN and budget stay in W44/W25 custody. W44 currently says authorityClass SYNTHETIC_FIXTURE_ONLY, realUserAuthorized:false, realAccountVerified:false. Never promote synthetic grants to actual human hosting.

W24 original services/api/src/domains/identity-consent/TAKEOVER_CONTRACT.md uses canonical K fields tenant, account, channel, peer_id, binding_revision and actual GET/POST takeover CAS; passive menu, analysis and contact selection NEVER trigger HUMAN takeover. W25 remains sole outbound sender; the W43 model has no actual message send authority.

## New server-only W43 native adapter

File: services/agentos/contact_hosting_message_analysis.py.

- OriginalPorts is a server-only callback contract. W47 must supply CURRENT trusted W24 canonical K, W44 qualification, W45 persisted message read, existing Agno runtime, existing genuine task-state owner, W44 original grant action and an existing durable request fence. Every dependency is required. No browser-provided identity, Key, raw original or translated text can establish authorization.
- OriginalAgnoContactPort.read_hosting(context): read current W44 grant and actual task state RUNNING/PAUSED/STOPPED/UNKNOWN/NOT_STARTED, custody, run/session IDs and budget. isHosting requires task RUNNING, committed grant, realUserAuthorized:true and realAccountVerified:true. Synthetic RUNNING does not imply actual hosted conversation.
- change_hosting(context,action,expected): W24/W44 current signed qualification, full K and epoch CAS, original W44 ISSUE/RESUME/PAUSE, followed by real task-source GET. A committed grant with no corresponding Agno task state is returned as GRANT_COMMITTED_AGNO_TASK_NOT_CONFIRMED rather than false success. Pause is possible even if model budget or grant expired; stopping must not consume model credits.
- analyze_message(context,source_mid,request_id): requires W24 ANALYZE permission, W44 model budget, valid current account/peer K and MID from W45 original persisted message. SHA256 verifies original content; optional translation is included ONLY if bound to that original SHA. K is hashed into a unique Agno CONTACT user/session, so A/B/C and two accounts with the same peer cannot mix history. Original W43 Agent object is reused; original Agno run must persist matching completed RunOutput, source MID, original hash, K hash, request fingerprint and reply. Recheck current grant, consent, custody, expiry and budget before and after Run; revoked answers are suppressed. No request is automatically sent or adopted.
- Actual native trace IDs are read from the SAME existing Agno SqliteDb where available; absence is reported as zero, never fabricated. Original existing W43 PRIVATE request ledger cannot be relabelled into a CONTACT grant. W47 must connect an existing signed per-contact durable CLAIMED→EXECUTING→COMPLETED|UNKNOWN fence; otherwise analysis cannot start and remains HOLD. UNKNOWN never blindly retries.

## W47 minimum IPC boundary, not yet implemented

The current native callback qualifier must be derived ONLY from original W24 and W44 current actor/K and may return status ALLOWED, operation ANALYZE|ISSUE|RESUME|PAUSE, canonicalK, accountEpoch, consentEpoch, custodyEpoch, grantGeneration, expiresAtMs and budgetStatus AVAILABLE. This is a W47 owner translation layer, NOT proof by browser supplied booleans. W44 ELIGIBLE_SYNTHETIC must NOT become ALLOWED for real accounts. Canonical K is exactly tenant/account/channel/peer_id/binding_revision.

W45 original message callback returns canonicalK, sourceMid, originalText, originalSha256, translatedText if valid, translationOriginalSha256; all sourced from original persisted account/peer/MID and checked for current K. Never take source text/translation from client input.

Suggested W47 endpoints only (W43 did not create them): GET /api/v2/contacts/:id/hosting-state; POST /api/v2/contacts/:id/hosting-action; POST /api/v2/messages/:mid/analyze; GET /api/v2/contacts/:id/agno-tasks. W47 alone owns the HTTP routes/current local session and actual W44/24/45 IPC mapping. W09-3 exclusively owns BCLiveChatWorkspace.vue menu bindings.

## Tests / truthful HOLD

New tests/test_w43_contact_hosting_analysis.py uses fake W24/W44/current message and fake Agno result/db ONLY to test: cross-account A/B/C identity/session isolation, exact MID, source and translation hashes, paid budget/expiry, pending/duplicate UNKNOWN, revocation during inference, no model reply unless matching original RunOutput, GRANT COMMITTED versus actual task RUNNING distinction, and pause with exhausted budget. No user privacy data, actual paid call or W25 sender.

Remaining HOLD: remote monthly limit prevents real local test/Run; actual W24/W44 real-user proofs are not signed; original Agno hosting task worker/state callback is not yet identified (existing W43 AgentOS scheduler is disabled); W45 real MID snapshot and W47 current durable CONTACT request fence are not wired; no W47 HTTP or 44751 Browser UAT. Do not claim NATIVE_VERIFIED or close Issue #146. No main merge, no frontend change and no deployment.
