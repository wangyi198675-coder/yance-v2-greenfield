# W44 -> W09-2: P0 native grant / budget / pause / revoke management handoff
Date 2026-10-27; User's authorized DESKTOP-029FH47. Source scope: services/api/src/domains/grant-custody-budget/** only.
Issue https://github.com/wangyi198675-coder/yance-v2-greenfield/issues/77: actual Opera fixed Web 44767 AUTOPILOT displays fixed unauthorized/budget unverified/revoke disabled. This is WEB NOT WIRED, not evidence that a user authorized any account.
MasterController: latest applicable Windows static design audit W512_20261025_VIEW40_W42_R3_INDEPENDENT_WINDOWS_CHROME_UI_RED_TO_W09-2.md flags revoked/budget insufficiency UI states missing; latest specific source/runtime audit W512_20261023_1601_LATEST_SOURCE_FIXED_NOT_LIVE_VS_DEPLOYED_AND_REBOOT_INCIDENT_AUDIT.md concerns separate prior W512 runtime and does NOT establish V2 44767 source readiness. GitHub #77 2026-10-27 is the authoritative Web-first acceptance requirement.
Inherited W44 parent: 66a70a15af885274b74c0124d0e914924579bebf. Preserve original W44 SQLite and W25 sole Outbox / workers / UNKNOWN mechanism.

## Minimal owner delta
- Existing W44 SQLite grant, custody, budget, reservations, boundary leases, native identity+Consent and mutation barriers reused; ONE small additional scoped grant_pauses table within the SAME database/path/WAL/BEGIN IMMEDIATE. No new DB, sender, Agent engine, HTTP gateway or W46 page.
- Native typed grant operations added to existing W44 mutation transaction: ISSUE_GRANT, PAUSE_GRANT, RESUME_GRANT; existing REVOKE_GRANT reused. New kinds cannot bypass W24 trusted PURE verifyOwnerMutation callback. Defective budgets, stale expected grant epochs, repeated pauses/unpaused resumes and W24 proof failures reject BEFORE writing a new pending barrier. Actual grants preserve spent and W25 unresolved reserved budget across renew/revoke.
- CONTACT pause masks a specific peer even when eligibility comes from a GLOBAL grant. GLOBAL pause masks all peers under the account/channel even when B has a CONTACT grant. No false "stop all completed" when any peer is ARMED/UNKNOWN. New reservations and PRE_NETWORK fencing fail closed. HUMAN takeover A remains separate from B/C, and no resume silently overrides HUMAN custody.
- Read and command ports are exported from existing openEligibilityStore with requireDurableIdentity:true: readGrantState and grantAction. They do NOT themselves create HTTP routes or resolve real authorization.

## Exact W09-2 / W24 typed interface
1. Server trusted actor (never user-supplied browser actor), full K {tenant,account,channel,peer_id,binding_revision}, and scope GLOBAL or CONTACT:
   GET native: store.readGrantState({identity:K,actor,scope})
   -> {ok:true,status,reason,scope,identityValid,custodyMode,authorityClass,realUserAuthorized,realAccountVerified,
   grant:{enabled,epoch,expiresAt,budgetLimit,spent,reserved,available}|null,
   effectiveScope,effectiveBudget,paused,pauseEpoch,globalPaused,contactPaused,
   barrier:{generation,pending,globalPending,activeLease,requestId,status,blockingRequestId},
   identityEpochs:{bindingRevision,accountEpoch,consentEpoch,custodyEpoch}}.
   The returned statuses ELIGIBLE_SYNTHETIC, DENIED, and reasons ACCOUNT_NOT_CONFIGURED, ACCOUNT_OR_PEER_UNBOUND,
   AUTHORITY_MUTATION_PENDING, GLOBAL_PAUSED, CONTACT_PAUSED, GLOBAL_REVOKED, CONTACT_REVOKED,
   GLOBAL_EXPIRED, CONTACT_EXPIRED, HUMAN_CUSTODY, NO_EFFECTIVE_GRANT, BUDGET_EXHAUSTED are grounded W44 data.
   authorityClass=SYNTHETIC_FIXTURE_ONLY and realUserAuthorized=false / realAccountVerified=false are intentional:
   W44's inherited canonicalK accepts only synthetic IDs. This query MUST NOT be treated as real user OAuth/channel consent.
2. W24 or authorized server POST: store.grantAction({identity:K,actor,scope,action:'ISSUE'|'PAUSE'|'RESUME'|'REVOKE',
   idempotencyKey,expectedGeneration,expectedBindingRevision,expectedAccountEpoch,expectedConsentEpoch,
   expectedCustodyEpoch,payload:{
      grantScope:scope, approvalRef:serverVerifiedW24ApprovalReference,
      ... ISSUE only: expiresAt, budgetUnits, expectedGrantEpoch
   }});
   Synchronous W44 requestMutationFence writes durable PENDING before attempting finalization; same SQLite CAS.
   APPROVAL REF IS NOT SELF-AUTHORIZING. W24 Owner MUST expand its current createW24DurableProofVerifier
   to verify real user approval, account/channel/peer ownership, kind/scope, approval revision, expiry and budget
   terms for ISSUE_GRANT, PAUSE_GRANT, RESUME_GRANT and REVOKE_GRANT. A browser boolean or fake receipt does not count.
   Until actual W24 user auth/provider authority is present, fail closed (WAITING_USER_AUTH / NOT_CONFIGURED).
3. action response:
   {ok:true,status:'COMMITTED',requestId,generation,readback} only after authoritative transaction and mutationResult confirms.
   {ok:true,status:'PENDING',reason:'ACTIVE_SEND_MUST_SETTLE_FIRST',requestId,generation,readback}
   means operation NOT effective yet; show '处理中'/'停止中' and deny new affected sends.
   {ok:false,status:'CONFLICT',reason} for stale generation/epochs/budget, repeated pause/resume etc (map to HTTP 409 by W47).
   {ok:false,status:'DENIED',reason} for invalid account, absent user approval etc (map to accurate 401/403/422).
   Existing store.mutationResult({requestId,actor}) always resolves pending vs applied after restart; W09 must confirm
   COMMITTED via readback and never infer from local UI toggle.
4. W25 original attempt ARMED/UNKNOWN: W44 grant mutation stays PENDING; W25 authoritative persisted ACK
   or independently proven never sent evidence required for settleBoundary. UNKNOWN does NOT trigger retry,
   refund, lease release or unauthorized send. Post-settlement W09 Owner can retry original finalizeMutationFence
   using unchanged requestId,generation and original approved typed payload, and read mutationResult before UI success.
5. W46/W47 owners wire original AUTOPILOT buttons to real HTTP -> W44 via W09-2 only after W24 proof/real identity
   eligibility. W44 Owner DOES NOT modify Web/UI/gateway. Browser 44767 Web-first UAT remains HOLD.
   A UI may show actual source state but never 'real user enabled' while W44 authorityClass is synthetic-only.

## Deterministic observed test suite, distinctly counted
node --test services/api/src/domains/grant-custody-budget/grant-management.test.mjs
New cases: no account and fake claims denied; global/contact scopes; grant issuance + budget readback;
CONTACT A PAUSE/RESUME while B/C continue; GLOBAL PAUSE/RESUME/REVOKE across all; USER_EDIT HUMAN A;
budget exhausted and time-expired; invalid proof, stale grant epoch and 409 no stuck pending;
W25 synthetic ARMED/UNKNOWN + late verified ACK and reopen; global pending visible in contact B/C readback;
reissue conserves previously spent unit.
Other historical W44 tests, W25 multiworkers and provider behavior are not claimed as new evidence.

## P0 RELEASE HOLD
No provider account, OAuth, ChatGPT budget billing, actual model token metering, human message sending, real screenshot of
W46 AUTOPILOT clicking 44767, 44767 gateway integration, W24 signed production grant, independent security attestation
or production deployment in this W44 task. W09-2 must coordinate W24 proof and W46/W47 actual route/readback
and independently verify same user's real Opera session and locked Web/API SHAs. Do not present synthetic COMMITTED as
real user authorization or approve spending actual money.
