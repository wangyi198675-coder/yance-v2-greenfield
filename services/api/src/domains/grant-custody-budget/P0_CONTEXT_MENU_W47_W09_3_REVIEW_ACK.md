# W44 | Issue #146 P0 AI托管二级菜单原生 Owner REVIEW_ACK | 2026-10-29

Source Owner: W44 Grant/Custody/Budget. Repository wangyi198675-coder/yance-v2-greenfield.
Parent: e7d50cdb8231c69d35098651158600a760ca04ac.
Scope: services/api/src/domains/grant-custody-budget/** only.
Sources actually read: Issue #146, MasterController W09_3_20261029_P0_PRO_CONTEXT_MENU_DESIGN_GAP_NATIVE_OWNER_DISPATCH.md and W512_20261029_W09_P0_PRO_CONTEXT_NATIVE_OWNER_MATRIX_DISPATCH_HOLD.md.
Do not modify Composer, W24/W43/W47 source, original sender, existing DB or fixed 44751 release.

## Exact W44 native menu state GET

Original store: openEligibilityStore({path,requireDurableIdentity:true,authorizeMutation,verifyOwnerMutation,readAgentState,...existing W24 and W25 callbacks}).
New OPTIONAL fail-closed W43 port: synchronous readAgentState({identity:K,actor,operation:'CONTACT_MANAGED_MENU_READ'}) -> {active:true,revision:'verified-nonempty'}.
Missing/throwing/async/inactive/unversioned callback is treated as AGENT_HOLD; this source does NOT fabricate agent activation.

Original new read-only call:
```js
const menu=store.readContactManagedMenuState({identity:currentW24K,actor:currentTrustedActor});
```
Returns {ok,identityKey,selectedMode,effectiveMode,contact,global,mode,agent:{active,revision,reason},canAuto,status,reason,canSend:false,authorityClass}.
contact/global are existing readGrantState({scope:'CONTACT'|'GLOBAL'}) exact DTO. mode is existing readModeState DTO. Includes grant enabled/epoch/expiry/budget spent/reserved/available, account and consent/custody epochs, pending barrier/lease, paused global/contact state and selected/effective three-mode custody.

READ-ONLY: no GET should issue a mutation, freeze another peer, or start original W24 TAKEOVER. No real account is authorized from this synthetic store; canAuto stays false, realAutoAuthorized false, canSend false until authoritative real owner integration exists.

## W47/W09-3 thin HTTP responsibilities

GET for submenu + settings should resolve only W24 trusted account, channel, peer and full K, never trust browser actor or identity. W47 should call readContactManagedMenuState. It must reject/stale safely on W24 account rebind, revoked identity, unverified W43 agent or unavailable W24 session. W44 native fixture K is synthetic-only; W47 cannot expose synthetic allowed as real user authorized.

POST 'pause current contact' uses existing store.grantAction({identity:K,actor,scope:'CONTACT',action:'PAUSE', idempotencyKey, expectedGeneration, expectedBindingRevision,expectedAccountEpoch,expectedConsentEpoch,expectedCustodyEpoch,payload:{grantScope:'CONTACT',approvalRef:serverVerifiedW24GrantApproval}}). Resume same contract with action:'RESUME'. For first activation require verified CONTACT ISSUE with budgetUnits,expiresAt,expectedGrantEpoch, then existing switchMode(targetMode:'AUTO', signed W24 approval) only when W43 Agent truly ACTIVE and original W25 PRE_NETWORK gate can enforce same source.

Every POST must independently GET same K CONTACT+GLOBAL+MODE+W43 and verify committed effects. PENDING after W25 ARMED/UNKNOWN is NOT a completed pause. Conflict is HTTP409. Expired/revoked/budget exhausted/account rebind/Agent inactive are DENIED/HOLD. GLOBAL pause is never lifted by CONTACT resume. A manual takeover affects only A, not B/C.

W24 TAKEOVER owner original routes: GET /api/v2/identity-consent/takeover-state and POST /api/v2/identity-consent/takeover. Composer actual TYPE/IME_COMMIT/PASTE/ATTACH/DROP/VOICE/SEND_ATTEMPT -> strict W24 GET/POST/GET. Merely opening context menu, hover, switching contact, reading or focus must NOT call takeover POST. W24 original takeover GET currently rejects ASSIST; this needs exact W24 owner fix, not W44 cross-file modification.

## Real owner test / evidence boundary

Original source parent had 63/63 PASS. This delta adds read-only W43 effective status and 2 tests: inactive/active/disabled W43 and pure GET epoch stability, plus A HUMAN/B/C segregation. Windows Node test command: node --test services/api/src/domains/grant-custody-budget/*.test.mjs. 65/65 PASS / 0FAIL / EXIT0. No separate table, no duplicate agent, no second sender.

Current real 44751 Web sha 706e934b983ad80da0132ab2ce84440f58975e68; API sha abc106ee18f425f99de26dafcf24e49c4779b399; canSend=false, trustedSession=false. This W44 source is NOT deployed, not verified by real Opera account. W09-3/W47/W24/W43 original owner ACK and controlled Web UAT required. Issue #146 remains OPEN DESIGN_ACCEPTANCE_RED / NO_DEPLOY.
