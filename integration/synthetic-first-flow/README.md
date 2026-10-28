# W09 Synthetic vertical M0: running interface contract, not live business

Run: `node --test integration/synthetic-first-flow/flow.test.mjs`

This is only an isolated, deterministic **nonproduction integration test harness** using the already frozen 120 fictional contacts and four channel enums. Its explicit ports are stand-ins for native IdentityConsent, Translation, Agno SDK/AgentOS and MessageDelivery. The included mock ports are labeled `MOCK_NOT_AGNO`, `MOCK_TRANSLATOR_NOT_REAL`, and `simulated:true`. No actual platform account, network, model fees, provider send, ACK or production DB. It does NOT implement a second agent, generic scheduler, or sending engine.

Owner handoff contract: canonical tenant/account/channel/peer/binding key; original MID and text preserved; translated provenance; exactly 0–3 sourced proposals to draft only; view/focus no takeover; edit only selected contact; synthetic revocation/expiry/budget/HUMAN fail-closed; duplicate MID and UNKNOWN idempotency. Ports must be replaced by actual official Agno/native services before any M1/M2 authentic workflow can be claimed.

M0 synthetic baseline means runnable bounded contract only. M1 = native API receive/translation + official Agno local test model to Composer; M2 = real code for authorization and canonical Outbox in an isolated synthetic environment; M3 concurrent retries/restarts. Real platform usage requires separate explicit authorization.
