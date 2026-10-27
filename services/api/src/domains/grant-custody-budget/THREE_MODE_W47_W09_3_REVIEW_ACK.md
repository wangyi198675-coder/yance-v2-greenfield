# W44 Original Owner REVIEW_ACK | MANUAL / ASSIST / AUTO native modes | 2026-10-27

Owner: W44, original Grant/Custody/Budget. No separate auth, Agent, sender, DB, HTTP gateway or Vue.
Branch: owner/grant-custody-budget/issue-8-native-eligibility-20261025
Parent: 9c1388665b51e3d3b6396eb5d2ff243000e1682f
Scope: services/api/src/domains/grant-custody-budget/** only.
Review: W44_SOURCE_REVIEW_ACK; real-account W24 proof, W47 Web/HTTP consumer and user-browser UAT HOLD.

## Exact semantics implemented on the EXISTING SQLite + W24 typed CAS

* MANUAL -> existing custody `HUMAN`: no autonomous message. Existing W24 `HUMAN_TAKEOVER` from actual USER_EDIT remains unchanged. A click to merely select, focus or read history MUST use GET only. Explicit mode settings POST to MANUAL require signed user action; no silent edit/takeover of B/C.
* ASSIST -> new value `ASSIST` of the ORIGINAL `custody` row; same K and custody epoch. `qualify` denies with `ASSIST_MODE_NO_AUTO`. AI suggestions are W43/W45 and manual Composer/W25 ownership; W44 does not suggest, decide, send or consume a new Agent.
* AUTO -> custody `AUTO` **AND** current valid W24 Account/Peer/binding + signed W44 Grant/consent eligibility, non-revoked GLOBAL/CONTACT scope, unexpired Grant, remaining budget, non-paused scope, no pending mutation, and no W25 UNKNOWN lease. W24's existing Grant `ISSUE` signs the user-approved contact/global budget and expiry separately; entering AUTO does not invent or renew a Grant.
* CONTACT A mode changes remain CONTACT scoped. B/C retain their own custody and already-approved GLOBAL/CONTACT grants. GLOBAL grant pause/revoke continues to bar every covered recipient. No new sender; W25 PRE_NETWORK checks original W44 `qualify`/lease before each irreversible send.
* W25 ARMED/UNKNOWN -> mode POST returns PENDING, persistent STOP barrier immediately prevents any new A arm; no success, retry, refund, or lease release. Only W25 trusted original attempt evidence settles, then original `finalizeMutationFence` + `mutationResult` + GET can confirm COMMITTED.
* W24 account revoke, binding revision, approval proof and CAS epochs checked before entering pending and rechecked in the same existing `BEGIN IMMEDIATE` transaction before commit. GLOBAL PENDING blocks CONTACT mode transitions.

## W47 native owner DTO (signed W44 source, not yet mounted HTTP)

Open original `openEligibilityStore({path,requireDurableIdentity:true,authorizeMutation,verifyOwnerMutation,...})` from `index.mjs` with existing W24 owner callbacks. K always server-validated 5-part `{tenant,account,channel,peer_id,binding_revision}`, actor from native verified current user, never browser JSON.

Read-only GET handler should invoke:

```js
store.readModeState({identity:K,actor:serverVerifiedActor})
```

Response: `{ok:true,selectedMode:'MANUAL'|'ASSIST'|'AUTO',effectiveMode:'MANUAL'|'ASSIST'|'AUTO',nativeAutoEligible:boolean,realAutoAuthorized:false,realUserAuthorized:false,realAccountVerified:false,authorityClass:'SYNTHETIC_FIXTURE_ONLY',status,reason,identityKey,bindingRevision,identityEpochs:{bindingRevision,accountEpoch,consentEpoch,custodyEpoch},budget,effectiveScope,grant,barriers:{generation,pending,globalPending,activeLease,requestId},globalPaused,contactPaused,canSend:false}`. The legacy unset custody row defaults AUTO internally, but without a Grant `nativeAutoEligible:false` and `effectiveMode:MANUAL`; this is NOT approval. `realAutoAuthorized:false` is intentional for fixture-only source.

After verified user request to change this same CONTACT K, POST handler should invoke:

```js
store.switchMode({
 identity:K, actor:serverVerifiedActor,
 targetMode:'MANUAL'|'ASSIST'|'AUTO',
 idempotencyKey:serverScopedRequestId,
 expectedGeneration:fromLastGET.barriers.generation,
 expectedBindingRevision:fromLastGET.identityEpochs.bindingRevision,
 expectedAccountEpoch:fromLastGET.identityEpochs.accountEpoch,
 expectedConsentEpoch:fromLastGET.identityEpochs.consentEpoch,
 expectedCustodyEpoch:fromLastGET.identityEpochs.custodyEpoch,
 payload:{targetMode,approvalRef:serverVerifiedW24ModeApproval}
})
```

W24 MUST approve the immutable typed operations `MODE_MANUAL`, `MODE_ASSIST`, `MODE_AUTO` with server-verified actor, exact K/CONTACT, binding/consent/custody epochs, authorization expiry and user action. The W44 adapter has no authority to mint a W24 approvalRef. No client-supplied boolean or fake proof.

Response: `{ok:true,status:'COMMITTED',requestId,generation,readback}` only when native commit was durably proven and GET mode equals target; W47 must independently GET again for UI. `{ok:true,status:'PENDING',reason,requestId,generation,readback}` when W25 has original ARMED/UNKNOWN. `{ok:false,status:'CONFLICT',reason}` on stale version, insufficient/expired/revoked Grant, global pause, bad proof, duplicate selected mode etc -> HTTP409. `DENIED` for missing user approval/account -> 401/403/422 as appropriate. For a pending native attempt, the owner-only `finalizeMutationFence({requestId,generation,actor,ownerValidatedMutation:sameApprovedPayload})` and `mutationResult({requestId,actor})` are still authoritative, not the UI.
Mode GET and switching do not create or dispatch W25 intents.

## Inherited components / limitations

Original W44 `grantAction`, `readGrantState`, `qualify`, `reserve`, `armSend`, `settleBoundary`, `readMutationFence`, `mutationResult` are unchanged.
Original W24 actual USER_EDIT takeover remains authoritative and cannot be triggered by GET, focus, inspection or model suggestions.
**Current W24/W44 canonicalK supports SYNTHETIC_TEST_ONLY fixture identity and fake actor ONLY**. Verified module code proves transaction semantics but NOT real-account readiness, ChatGPT model budget billing, or an actual authorized social account. W24 must provide trusted real owner proof/current five-segment K; W47 must mount the thinnest existing HTTP interface and W09-3 must test Chrome/Opera 44767. Never report synthetic `COMMITTED` as real logged-in user permission.

## Test evidence required for review

`node --test services/api/src/domains/grant-custody-budget/*.test.mjs`.
Ten added three-mode targeted tests: no read side effect and reopen, MANUAL/ASSIST no-auto, explicit Grant/Auto, A/B/C separation, invalid proof, stale CAS/other actor, budget exhausted, grant expiry/revoke/global pause/account revoke, original W25 ARMED/UNKNOWN persisted PENDING then actual verified synthetic receipt, Global pending vs contact mode, competing SQLite handles, original USER_EDIT takeover.
Existing 53 W44 tests retained. Do not claim tests as real Web/account/Provider UAT.

Signed scope W44_SOURCE_REVIEW_ACK only; W47/W09-3 integration pending.
