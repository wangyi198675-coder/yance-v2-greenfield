# W24 -> W09-2 / W44 / W25 / W46 — actual strict durable native integration

**Nonproduction synthetic only.** W24 Owner scope only. W44's existing
`requireDurableIdentity:true` database, W25 sole MessageDelivery/Outbox,
and W46 original Composer are NOT modified or duplicated.

Inputs verified on DESKTOP-029FH47, 2026-10-25:
- W24 prior `8ba69e64f53157fba7997bc844b8db2dea82a911`.
- W44 Owner `174a2c4582a476e6b563599144bdaed6450544b0`.
- W25 Owner `7f6fabd9f35d3cf3c27bd661d9627db731ec9ae7`.
- W46 Owner `88f6c30094a3d6217491c3d1f410a040d91ab3f0`.
- W09-2 integration `829911c06f626465bac2da9c1db4305c97209395`.

## Actual W24 source delta / strict construction

Original `IdentityConsentService` now accepts
`{requireDurableIdentity:true,durableAuthority:existingW44Store,
proofAuthority,grantAuthority}`. The constructor refuses missing or
non-native W44 transaction ports. Every existing identity/Consent read and
all six mutation entrypoints select the W44-backed driver, not W24 RAM:

- registerAccount (requires peer/full K, explicit verified binding proof)
- bindPeer (explicit verified peer proof)
- createConsent (verified typed Consent proof, exact purpose/operation)
- revokeConsent (requires full K + per-Consent expected revision)
- invalidateAccount / REVOKE_ACCOUNT (GLOBAL account+channel)
- relinkAccount / RELINK_ACCOUNT (verified channel proof and explicit new peer bind)

The durable driver reads `readIdentityAuthority` on every K/Consent/epoch
operation, reads `readMutationFence` from SQLite, writes
`requestMutationFence` with exact generation + four expected native epochs,
and calls `finalizeMutationFence` with an immutable typed payload. It then
checks `mutationResult` for the committed result. It never calls a callback
which changes W24 memory as part of the SQLite transaction. Separate
`finalizePendingMutation(ctx,requestId,typedPayload)` and
`mutationResult(ctx,requestId)` allow evidence-based restart continuation;
a PENDING attempt remains PENDING rather than reporting success. No unsafe
`cancelMutationFence` call is made without separate proof.

W24 `createW24DurableProofVerifier({proofAuthority,authorizeOperator})` is
the native synchronous, pure proof validator injected into W44's existing
`verifyOwnerMutation`. It rechecks the trusted owner and independently
evaluates typed binding/peer/Consent proof inside W44 BEGIN IMMEDIATE.
**The injected real proofAuthority itself must be independently audited for
pure/synchronous behavior.** Synthetic test proofs are fixture labels only,
NOT actual provider authority proof.

### Strict W44 factory wiring example (server-only)

```js
const store = openEligibilityStore({
  path: trustedExistingW44DbPath,
  requireDurableIdentity: true,
  authorizeMutation: trustedServerActorAuthorizer,
  verifyOwnerMutation: createW24DurableProofVerifier({
    proofAuthority: trustedSynchronousW24ProofAuthority,
    authorizeOperator: trustedServerActorAuthorizer
  }),
  verifyDeliveryArm: createW25PersistedArmVerifier({getDelivery}),
  verifySettlement: createW25SettlementVerifier({getDelivery})
});
const ids = new IdentityConsentService({
  requireDurableIdentity: true, durableAuthority: store,
  proofAuthority: trustedSynchronousW24ProofAuthority,
  grantAuthority: createW24GrantAuthority({getStore:()=>store,readAgentState})
});
```

Strict `SEND_MESSAGE` qualification requires exactly one currently active,
unexpired W44-stored Consent matching operation when the existing W44
`createW25EligibilityPort` omits consent_id. Missing or multiple eligible
Consents DENY; sending also requires the existing W44 grant, active W43 agent,
and W25 repeated send fences. Explicit consent_id + purpose remains enforced
where supplied. READ_INBOUND needs current identity and is read-only.

W44's current strict CREATE_CONSENT schema accepts only
`SEND_MESSAGE, TRANSLATE, ANALYZE`. Other legacy W24 Consent operations,
including VOICE_SYNTHESIS, RECORDING, SEND_MEDIA, AVATAR_EDIT and
PERSISTENT_LEARNING, **fail closed** as
`DURABLE_CONSENT_OPERATION_UNSUPPORTED`. No fabricated persist support.
W44 Owner must explicitly extend its typed native schema/operation proof for
any such feature before release. W44 does not expose a native privacy-audit
read port, so W24 strict privacyEvents fails closed instead of returning RAM
events. This remains an Owner contract difference / HOLD for those features.

### Existing W46 GET/POST wire unchanged

W24 strict takeover goes through W44 `HUMAN_TAKEOVER` CONTACT typed
mutation and confirms same K, mode=HUMAN, custody epoch +1 via actual second
GET. W46 passes existing four CAS values unchanged. Focus, view, switch
remain GET-only. When an original W25 attempt is already ARMED, POST returns
HTTP **202** with `{accepted:false,pending:true,status:'PENDING',requestId,
generation}`. Do NOT show HUMAN until verified after original W25 settlement.
W46 currently treats a non-accepted takeover as BLOCKED, not a specialized
pending banner; W46 UI Owner may separately consider a truthful PENDING view.
W24 does not modify W46.

## Actually executed native tests (Windows Node 24)

`node --test` committed files in this directory, with
`YANCE_PR32_ROOT` pointing to real W09-2 Owner composition,
`YANCE_W25_ROOT` actual W25 Owner (or W09 composition fallback), and
`YANCE_W46_ROOT` exact W46 Owner.

- **28/28 legacy synthetic IdentityConsent** (compatibility; NOT durable).
- **16/16 legacy synthetic takeover HTTP** (prior full CAS contract).
- **4/4 old P0 audit diagnostics**: deliberately prove old legacy in-memory
  mode is unsafe, NOT 4 security passes.
- **12/12 NEW W24 strict durable native tests**: account/peer/Consent/epoch
  reopen across W44 SQLite handles and fresh OS process, actual two separate
  OS workers CAS one legal CREATE_CONSENT, old-K / wrong Actor / missing proof,
  original RAM bypass blocked by persistent mutation barrier, negative
  missing Consent, GLOBAL revocation/rebind, deterministic fault inside
  W44 transaction leaves unchanged authority and recoverable PENDING.
- **5/5 NEW W24+W44+W25+W46 native integration tests**: real W25 SQLite
  Outbox PRE_NETWORK revoke DENIED/zero sink calls; ARM then UNKNOWN
  preserves send lease + budget and repeated dispatch never re-sends; verified
  original fake late ACK allows settlement then persisted account revoke;
  CONTACT HUMAN takeover leaves B/C AUTO; ARMED HUMAN takeover stays PENDING;
  W46 current native loopback PASTE becomes same-K HUMAN epoch+1, HTTP
  409 stale K/epoch and 422 missing CAS rejected.

**Total executed 65/65 TAP assertions, no failures.** The four legacy
diagnostic cases are intentionally still witnessing insecure legacy behavior;
the strict-mode negative test proves the same direct revoke cannot bypass
W44 PENDING fence.

## Remaining P0/rollout safety HOLD

1. W09-2 must actually compose the new W24 HEAD with W44 strict mode factory
   and ensure every real server entrypoint, W25 eligibility and W46 takeover
   uses `requireDurableIdentity:true` with authenticated server actors.
   Legacy mode remains for isolated synthetic historical tests ONLY; it is NOT
   approved to be used as deployed authority.
2. W25 Owner independent irreversible-boundary/late-ACK security review on
   exact joined SHA, plus W44 Owner independent proof/cancellation and all
   required Consent-operations expansion. Neither synthetic sink nor SQLite
   can certify external provider effects.
3. Formal real auth/identity proof, live provider consent, app/IPC session
   authentication, actual Windows graphical Composer UAT, legal/privacy audit
   read endpoint, independent SEC and deployment review remain HOLD.
4. Strict scope today is **SYNTHETIC_TEST_ONLY**; no real social login,
   real contacts, paid model execution or production deployment performed.

Passing isolated Owner GitHub CI is NOT authorization for release.
