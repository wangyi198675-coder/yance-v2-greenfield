# W24 → W26–W29/W44/W25/W09-2 | Issue #61 native upstream identity thin seam

Scope: **W24 Owner Issue #4**; only `identity-consent/**`. This is executable code and tests, not an invented provider connection.

## Exact W24 new code

`native-channel-authority.mjs` exports:
`createW24NativeInboundIdentityPort({identityConsent,resolveVerifiedChannelBinding})`
→ `readW24Identity({k,nativePrincipalId,channelAccount,peerId})`.

W26–W29's actual SDK binding resolver MUST derive and verify real account and peer from independently authenticated upstream connection / signed W54-W47 native app session, never from inbound payload or browser claims. It returns authoritative:true, nativeSessionCurrent:true, platformConnectionAuthorized:true, platformProofVerified:true, principalId, tenant, account, channel, peerId, bindingRevision. The W24 adapter binds this to exact complete K and uses the **original** durable IdentityConsentService.assertCurrent/readConsentEpoch. Its result includes identityKey, bindingRevision, accountEpoch, consentEpoch and canSend:false. **Legacy in-memory IdentityConsent is not accepted.** No grants/mutations/sends are minted by an inbound event.

Critical: Existing W24 `canonicalK` enforces `SYNTHETIC_TEST_ONLY`, W24 strict `durable-identity.mjs` expects fake-Actor and W44 `index.mjs`/ `authority-db.mjs` enforce fake-/fixture identities. Real K fails closed. Tests include actual existing W44 SQLite strict identity: 5/5 PASS; a real-looking upstream K is rejected, while account revoke invalidates binding. This is NOT a real user authorization pass.

## Required exact W44/Owner follow-on (do not change original W44 here)

Only after W54/W47 has a signed, revocable local app principal and W26–W29 return verified ownership proof:
- W24+W44 approve a native account/Peer ID format scoped to channel/account, retaining existing canonicalK / bindingRevision / accountEpoch / consentEpoch / custodyEpoch. Do not remove existing synthetic gating for tests without an explicit, independently authenticated production path.
- W44 native `readIdentityAuthority/readMutationFence/requestMutationFence/finalizeMutationFence/mutationResult` must use real verified Actor and K from signed original platform binding. Do not accept arbitrary `actor/isNative` flags from JSON, header, Origin, localhost, or fake account conversion.
- Trusted `resolveVerifiedChannelBinding` must validate upstream connection epoch and account revocation/relink. READ_INBOUND does NOT create Consent for SEND_MESSAGE. Sending requires separate valid W24 Consent, W44 Grant/Custody/Budget, W25 send fence and real user authorization.
- W26/W27/W28/W29 must publish actual SDK/bridge source version, running worker, verified native binding proof for account and peer, real inbound MID and transport-native ACK provenance. The new W24 seam never performs login, receives SDK frames, stores credentials, or sends.
- W25 new `createW25NativeInboundPort` attaches to its existing SQLite and accepts normalized source/MID only after W24 current identity and SDK Owner independent verification. No second message DB or Outbox.

W09-2 may merge independently signed W24/W25 source only into a separate integration branch and validate authentic real platform proof. Until real signed session and user account approval, status **WAITING_USER_AUTH / NATIVE_ACCOUNT_BINDING_HOLD**, all real sending off.

Nonproduction actual owner tests:
`node --test services/api/src/domains/identity-consent/*.test.mjs` on Windows Node24 with exact `YANCE_W44_ROOT/YANCE_W25_ROOT/YANCE_W46_ROOT`: **70/70 PASS** (65 prior and 5 new). Four legacy memory-audit PASS tests still document unsafe historical mode and are not production attestations.

## 2026-10-26 4fc924b4 joint native W47 read API
New native-owner-reads.mjs + native-owner-reads.test.mjs provide readW24AuthorizedAccounts/readW24VerifiedContacts using original W47 createNativeOwnerReadHttp. W54 current principal + platform-owner verified account and peer are mandatory, original W24 strict durable K, current binding and consent epoch rechecked. W47 response never gives send privilege. Synthetic SQLite+original W47 handler targeted 5/5 PASS; NOT signed live platform authorization. Real account trust remains WAITING_USER_AUTH and W44 live actor adaptation gate.
