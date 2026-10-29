# W24 ORIGINAL OWNER ACK | PR #102 | Real Contact five-part K + W44 typed MODE_* approval | 2026-10-27

**W24 exact implementation source-code CLEAN SHA:** `3d5833db3be0f5a8ed9616beb51fcdc762c7e226` (parent inherited `7ca7d800de2e863933807f867834b8a1ffbd5535`). Review this source commit for the two executable files; this ACK will be committed as the next Owner-only documentation commit, with its final commit SHA supplied in the shared receipt/GitHub handoff.\n\n**OWNER** W24 original IdentityConsent only. **Task** integrate original authenticated ChannelAccount / Peer / five-part K and owner-signed explicit MODE_MANUAL, MODE_ASSIST, MODE_AUTO user actions into pre-existing W44 Grant/Custody/Budget. **No duplicate model, store, proof authority, login, or sender.**

## 1. Source precisely inspected

- Required authority: `docs/PROJECT_HIGHEST_EXECUTION_RULE.md`.
- Dispatch: `COORD_AGGREGATE/W09_3_20261027_R4_PR102_W44_W46_W47_UNION_5730D39_CI6_SIGNED_BUILD_HOLD.md`.
- W09-3 exact union `5730d390861865126e4a4748d05a92aafad5f917` on `Worktrees/W09_3_R4_POPUP_EXPERT_MODE_UNION_20261027`.
- W44 original owner exact `e7d50cdb8231c69d35098651158600a760ca04ac` on `Worktrees/W44_GRANT_CUSTODY_BUDGET_ISSUE8_20261025`. W44 original `openEligibilityStore` already implements `readModeState/switchMode`, Mode CAS, original immutable same-W44 SQLite, effective Grant/budget/expiry, mutation PENDING and W25 UNKNOWN. W24 DID NOT touch those files.
- W24 inherited clean `7ca7d800de2e863933807f867834b8a1ffbd5535` plus original durable `IdentityConsentService/currentK/assertCurrent/readConsentEpoch` and `native-owner-reads.mjs`.
- Actual running fixed Web QA `127.0.0.1:44767/version.json` Web/API same SHA **`e9333d5969d07b26369448bad13e89ff79442431`**. Health `trustedSession:false,connectedAccountCount:null,realContacts:null,countsAuthoritative:false,canSend:false,mode:NATIVE_PROVIDER_OWNER_PORTS_NOT_CONNECTED`. W26 actual official `127.0.0.1:29321/api/v2/providers/fb-personal/status` HTTP200, official Bridge RUNNING but `realAccountState:WAITING_USER_AUTH,accountIdentityVerified:false,accountCount:null,canSend:false`. NO EVIDENCE of the owner's real authorized ChannelAccount or Peer. `REAL_ACCOUNT_AUTH_HOLD` — DO NOT synthesize a real K.

## 2. Actual W24-only implementation

New under **original W24 path only**:
`services/api/src/domains/identity-consent/native-mode-approval.mjs`
and `native-mode-approval.test.mjs`.
Export:

```js
createW24ModeApprovalPort({
  readW24AuthorizedAccounts,readW24VerifiedContacts,
  resolveNativePrincipal,resolveSignedUserGesture,verifySignedUserGesture,
  readW44ModeState,readW44GrantState,clock
}) => {
  readModeEligibility,
  prepareModeChange,
  verifyW44ModeMutation
}
```

Those W24 owner read callbacks are the existing `createW24NativeOwnerReadPorts(...)` original ports; actual accounts and peers only from W26–29 current authenticated original native source + W24 original W44 durable IdentityConsent, **never client JSON**. Inbound `contactSelector` is a LOOKUP SELECTOR only: `contactSelector === canonicalK(W24-current-contact.identity)` must appear inside the current **server-verified** account + peer enumeration. A browser's claimed tenant/account/peer, approvalRef, actor or `isAuthorized` is NEVER accepted as native proof. Cross-account and stale binding fail. Current W54 source must match principal, installation reference and revocation generation.

Read-only `readModeEligibility({session,principal,contactSelector})`: returns `{identity,identityKey,accountRef,selectedMode,effectiveMode,identityEpochs:{bindingRevision,accountEpoch,consentEpoch,custodyEpoch},barriers,authorityClass,realAccountVerified,realUserAuthorized,realAutoAuthorized:false,canSend:false}`. Does NOT mutate mode/custody, issue a W25 Intent, takeover, or grant AUTO.

**Typed MODE user action**: W47, after actual first-party action, passes selector + `targetMode: MANUAL | ASSIST | AUTO` to W24's
`prepareModeChange({session,principal,contactSelector,targetMode})`.
W24 independently:
1. Reconstructs K ONLY by current W24 verified account and Peer + W54 principal.
2. Reads original W44 mode state and compares K binding, accountEpoch, consentEpoch, custodyEpoch + barrier generation. W44 fixture returns `realAccountVerified:false,realUserAuthorized:false,authorityClass:'SYNTHETIC_FIXTURE_ONLY'`; W24 therefore **returns `REAL_ACCOUNT_AUTH_HOLD` before asking the user for a new approval**.
3. Only on a real signed owner source, delegates W54's already-verifiable `resolveSignedUserGesture` to obtain immutable `approvalRef` + `serverRequestId`, then synchronously independently verifies the original W54 gesture reference via `verifySignedUserGesture` with exact `MODE_*`, Actor, K, CONTACT scope, typed selected mode, expected W44 CAS epoch tuple, issuance and expiry.
4. MODE_AUTO additionally requires original signed continuous-delegation consent for that exact contact or qualified Global scope, explicit `grantScope`, positive bounded `maxBudgetUnits`, W44 original Grant epoch/expiry, current unpaused Grant, effectiveBudget.available > 0, non-active lease, non-pending barrier. Grant is NEVER created by mode switching.
5. Re-reads original W24 account/Peer/Native user and original W44 epochs and mode generation immediately before returning.
6. Supplies W47 with **the existing W44.switchMode typed arguments**, WITHOUT itself invoking/duplicating W44 mutation:

```js
{
 identity: {tenant,account,channel,peer_id,binding_revision},
 actor: verifiedNativePrincipal,
 targetMode:'MANUAL'|'ASSIST'|'AUTO',
 idempotencyKey: serverScopedOriginalW54RequestId,
 expectedGeneration: currentW44Barriers.generation,
 expectedBindingRevision: currentW44.identityEpochs.bindingRevision,
 expectedAccountEpoch: currentW44.identityEpochs.accountEpoch,
 expectedConsentEpoch: currentW44.identityEpochs.consentEpoch,
 expectedCustodyEpoch: currentW44.identityEpochs.custodyEpoch,
 payload: {targetMode,approvalRef: immutableOriginalSignedUserGestureRef}
}
```

`verifyW44ModeMutation({actor,kind,identity,mutation,requestId})`: synchronous W24 typed proof callback for **the original W44 `verifyOwnerMutation` in the same existing transaction**, requires signed valid original native W54 gesture, expected type `MODE_MANUAL/MODE_ASSIST/MODE_AUTO`, exact Actor/full K/CONTACT, request ID, no expiry, epoch shape, and for AUTO continuous signed delegation/grant limits. **W44 itself remains authoritative** for CURRENT identity CAS, grant mutation fencing, native budget/expiry, global/account revocation, and W25 UNKNOWN; must not replace W44's preexisting verifier for other kinds of mutation. A standalone W24 verified proof is NOT a mode commit or a sending license. W47 must call original `store.switchMode(typedArgs)`, then original GET `store.readModeState`, and return `COMMITTED` only after persistent readback. `PENDING` is not success. A change for A has CONTACT-scoped K: it does not change B/C modes.

**Precise limitation for W44/W47 real-only integration**: Original W44 `verifyOwnerMutation` callback presently receives `{actor,kind,identity,mutation,requestId}`, not W44's trusted `current: {bindingRevision,accountEpoch,consentEpoch,custodyEpoch}`. W44 independently CAS-checks caller-provided expected epochs, but that does **not** atomically compare a gesture proof's signed epoch tuple to those same epochs. Before claiming `REAL_AUTO_AUTHORIZED`, the W44 original Owner must expose its already computed trusted transaction snapshot to its existing proof callback (minimum extension, no new DB or second system), or equivalently arrange original W54 proof verifier to independently reject a proof superseded by W24 epoch revocation. Until that original trust binding and real actor K are signed, W24's default preparation stays `REAL_ACCOUNT_AUTH_HOLD`. **Never infer proof validity solely from payload.approved.**

## 3. Contract and negative tests

Original W24 all tests and original W44 all tests were rerun on Windows Node v24:
- W24 complete original + new suite: **106/106 PASS** (new 10 typed-mode cases).
- Original W44 unchanged three-mode/full budget suite: **63/63 PASS**.
- **Correctly scoped cross-owner CI difference:** The old W24 PR #17 GitHub native workflow fetches the independently pinned old PR32 W44 sibling, which does **not yet contain** W44 #102 `readModeState/switchMode`. Previous accurate HEAD CI Run #40513991688 was RED with `TypeError: store.readModeState is not a function`, cascading evidence/merge-gate RED. New W24 test runner checks the exact ORIGINAL W44 store API before attempting W44 feature tests: **on that old PR32 sibling 106 total / 97 PASS / 9 marked SKIP / 0 FAIL**; on exact W44 original `e7d50c...` **106/106 PASS / 0 SKIP**. The SKIPs are transparent `original W44 mode owner not in CI sibling`, NEVER reported as business PASS. Original W44 standalone still 63/63 PASS. W09-3/W30 should update the existing CI sibling pin when original W44 source is joined; W24 does not edit .github or CI-system ownership.
- New cases test actual original W44 SQLite fixture transaction for MANUAL / ASSIST / AUTO typed operation (no realAccount flag), deny unauthorized context, fake/bogus K, forged actor, mismatched mode, mismatched proof, proof expiry, stale generation/custody epoch, Grant absence/expiry/budget, W44 account revocation, A mode change does not change B/C. **Every such positive K is marked `SYNTHETIC_TEST_ONLY`, fake-* and W44.readModeState `realAutoAuthorized:false`**. No fake ID is treated as a real login.
- W44 original existing 63 cases independently cover W25 ARMED/UNKNOWN PENDING, Global vs CONTACT grants, arbitration, budget exhaust and original concurrency. W24 tests deliberately do not duplicate W44 modes/DB.

## 4. W47 + W09-3 exact next action and HOLD

W47 original contact-context API from union `5730d...`:
`/api/v2/contact-context/effective-mode` and
`/api/v2/contact-context/change-mode`
currently only return 503 `W24_W44_SIGNED_CONTACT_GRANT_BUDGET_MODE_PORT_NOT_CONNECTED` after native session validation. W47 is responsible for wiring the present W24 ports into this existing HTTP route, calling original W44.store mode methods and checking readback; **not writing any new private auth, UI, mode DB or endpoint**. W09-3 alone source-joins precise W24 Owner SHA after W47 independent signed build checks and deploys the fixed `44767` later; PR102 exact `5730d...` is not currently served by 44767 (currently e933d). Original W47 protected Signed Build remains RED from latest combined report; no forged bypass. Users have not approved actual Meta/Pancake/WhatsApp/TDLib account for Yance, so AUTO switch/send remains disabled. W09-3 and W47 must not synthesize `realAccountVerified:true` or `realAutoAuthorized:true` to get a green UI.

**Exact delivery level:** `W24_TYPED_APPROVAL_SOURCE_PASS`; `REAL_ACCOUNT_AUTH_HOLD`; `W44_REAL_K_GESTURE_EPOCH_ATOMIC_MATCH_HOLD`; `W47_MODE_HTTP_OWNER_CONSUMER_HOLD`; `PR102_W47_SIGNED_BUILD_HOLD`; `FIXED_WEB_USER_DELIVERED_HOLD`. No USER social login, WinCred read, QR, actual send, or 44767/44751 deployment.
