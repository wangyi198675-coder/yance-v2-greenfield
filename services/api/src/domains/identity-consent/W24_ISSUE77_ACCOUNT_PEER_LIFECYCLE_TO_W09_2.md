# W24 → W09-2 | Issue #77 | four original channel account / Peer binding

**W24 Owner source-only ACK; no live social account connected or 44767 deployment.**
Owner branch: `owner/identity-consent/issue-4-native-k-20261025`.
Inherited W24: `8a6cb9fe4444d1766b426c995fa9302862fd1d47`.
Scope: only `services/api/src/domains/identity-consent/**`; no W46, W47, W26–29, W44, W25 source change.

## Existing authority retained
- W24 `IdentityConsentService({requireDurableIdentity:true,durableAuthority: originalW44})`: `registerAccount`, `bindPeer`, `assertCurrent`, `readConsentEpoch`, `invalidateAccount`, `relinkAccount`, TAKEOVER. No new account DB or vault.
- W44 `readIdentityAuthority({actor,identity:K})` is sole persistent registration and epoch authority. Original `canonicalK` and W44 binding fences unchanged.
- W24 `native-channel-authority.mjs` and `native-owner-reads.mjs` inherited; W25 original single MessageDelivery unchanged.

## New executable W24 post-user-authorization lifecycle
`native-account-lifecycle.mjs` exports:

```js
createW24OfficialAccountLifecycle({
 identityConsent, resolveCurrentPrincipal, resolveOfficialAccount,
 resolveOfficialPeer, readW44IdentityAuthority
})
```

Existing W47/Web/original SDK composition provides **private in-process callbacks**, never browser-provided authorization booleans:
- `resolveCurrentPrincipal({session,operation})` → actual current user `{verified:true,principalId,sessionRevision}`.
- `resolveOfficialAccount({session,principal,channel,accountLocator,operation})` → original official W26–29 account Owner's independently confirmed `{verifiedSource:true,platformOwnerVerified:true,userAuthorized:true,nativeSessionCurrent:true,accountOnline:true,principalId,tenant,account,channel,accountLocator,platformAccountId,accountAnchorPeerId,bindingRevision,bindingProofRef}`. Here `accountAnchorPeerId` is the actual provider-authenticated SELF/identity locator (NOT a fabricated contact); original W44 stores GLOBAL account authority. The callback MUST NOT derive approved flags from request headers or an unverified SDK process.
- `resolveOfficialPeer({session,principal,account,peerLocator,operation})` → same-account verified `{verifiedSource:true,platformPeerVerified:true,nativeSessionCurrent:true,tenant,account,channel,accountLocator,platformAccountId,peerLocator,peerId,platformPeerId,peerProofRef,bindingRevision,revoked:false}`. Must prove peer belongs to EXACT account and channel. Different accounts with equal `peerId` remain different FULL-K.
- `readW44IdentityAuthority({actor,identity:K})` → original W44 direct `readIdentityAuthority`; proof refs must be independently reverified by W24 ProofAuthority and W44 `verifyOwnerMutation` inside W44 transaction.

Public in-process methods, **no HTTP listener added**:
```js
await port.registerApprovedAccount({session,channel,accountLocator})
await port.bindApprovedPeer({session,channel,accountLocator,peerLocator})
await port.readApprovedPeer({session,channel,accountLocator,peerLocator})
await port.revokeApprovedAccount({session,channel,accountLocator})
await port.relinkApprovedAccount({session,channel,accountLocator})
```
Only W24/W44 existing mutators persist account, peer, revocation or relink. Mutating calls require explicit native Owner proof and W44 COMMITTED + real readback; PENDING never shows BOUND/REVOKED. Account registration begins revision 1; relink requires previous revoke, new revision, and explicit fresh Peer bind. Revoke continues to work when provider is already offline, using current local Principal + original persisted owner.

`readApprovedPeer` and existing `native-owner-reads.mjs` are **READ-ONLY**. Choosing, focusing, switching, or inspecting a contact never calls TAKEOVER; original Composer edit action alone may call W24 TAKEOVER.

## New stricter W47 existing GET /api/v2/contacts backing ports

Original `createW24NativeOwnerReadPorts` now takes an additional **mandatory** `readW44IdentityAuthority` callback. Each account from `listVerifiedPlatformAccounts` must also specify `tenant`, `accountId`, `accountAnchorPeerId`, and integer `bindingRevision` in addition to existing fields `accountRef,channel,ownerPrincipalRef,authorization:'ONLINE_VERIFIED',nativeSessionCurrent,platformAuthorizationVerified,channelAccountBindingCurrent`.
- Every claimed ONLINE account is checked against current W44 account.owner/active/bindingRevision/epoch before it is returned. SDK installed/worker RUNNING or authenticated API GET alone does NOT create account.
- Every peer from `listVerifiedPlatformPeers` must match that same account's `tenant/accountId/channel/bindingRevision`, then the original `identityConsent.assertCurrent/readConsentEpoch` must pass.
- Read of contacts also rechecks original SDK live account enumeration AND W44 account authority/epoch immediately before returning and fails closed if SDK disconnects, account switches, owner, revocation or binding changes.
- W47 existing `native-authoritative-reads.mjs` accepts these callbacks without modifying W47; it intentionally publishes limited `{accountRef,channel,peerRef,bindingRevision,displayName}` plus `canSend:false`, not raw credentials or provider data.
- Account locator/ref MUST uniquely identify a platform account under the one local operator; W47 currently keys returned accounts by `accountRef`, so W26–29/W09 must namespace colliding ID strings across channels, not reuse a bare contact ID as account ref. A and B on same platform are distinct rows, source and contacts never cross.

## Exact four upstream owners checked

| Owner | Native source observed | W24 cannot interpret as authorized account until |
| --- | --- | --- |
| W26 FB Personal `mautrix-meta`, `3f263c9678cf5eb11d72169807efc557761fe347` | WSL status `bridge-runtime.mjs`, HTTP `bridge-http.mjs`; official Bridge can run without a real Meta account | Official Meta/Matrix account login and remote identity/peer proof; bridge RUNNING alone means WAITING_USER_AUTH |
| W27 FB Page `Pancake`, `d8756ad423351d99950b19d0c87955e72e8817ac` | `official-rest.mjs` principal + Page owner + token lease, `official-inbound.mjs` Page/PSID readback | user-approved Page access token, Page identity and PSID in same bindingRev / accountEpoch |
| W28 WhatsApp `Baileys`, `c28130ee6da5a7997b7acec2a0e89d1c44793ebe` | `native-worker.mjs::getAccountIdentity`, `identity.resolveAccount/resolvePeer`, verified self JID/LID | user-scan approved, actual self JID/accountId, current socket and normalized peer JID per account |
| W29 Telegram `TDLib JSON`, `f7bc537f5af26b11381bda7c28c6d58a52e82b44` | `native-tdjson.mjs::onNativeAccountIdentity` from official getMe, `onTrustedChatIndex`, `verifyCurrentPeerK` | official authorizationStateReady, exact getMe Telegram user id and matching account/chat identity |

W26 actual local read-only GET `127.0.0.1:29321/api/v2/providers/fb-personal/status` **200**: official binary SHA verified, Bridge PID 3748, Tuwunel registered, but `realAccountState:'WAITING_USER_AUTH'`, `accountIdentityVerified:false`, `realContacts:null`, `canSend:false`. Verified on DESKTOP-029FH47 during this issue.
Existing user QA `127.0.0.1:44767/api/v2/runtime/health` **200**, runtimeSha `82de109abad35a1595ef5333d8beff0629b13211`, `trustedSession:false`, `countsAuthoritative:false`, `canSend:false`. Anonymous GET `/api/v2/contacts` **401**. W09 must compose real owner ports in its own Web-first integration branch and recheck fixed 44767 / real Opera after user authorization; W24 Owner does not deploy.

## Exact tests and gating

Windows Node24 using **actual original W44 SQLite and W47 owner source**: `node --test services/api/src/domains/identity-consent/*.test.mjs` → **87/87 PASS** including new official-shaped two-account registration, identical Peer ID isolation, revocation A without impacting B, SDK disconnected revoke, rebind/revision, session change, unapproved account, original W47 HTTP GET, same W44 registered account readbacks and no browsing-triggered TAKEOVER. Additional tests are explicitly nonproduction fixtures, not authorized real social account positive evidence.

**Current blocker not waived**: Original W24 `canonicalK` accepts only `SYNTHETIC_TEST_ONLY`; original W44 `canonicalK` accepts only `fixture-` account and `fake-` Peer/Actor. Existing original source correctly rejects real tenants and account IDs. These new thin ports DO NOT lift the restriction or map true accounts into synthetic identities. W24/W44 original Owner joint native-format adaptation is required AFTER actual provider ownership and user authorization. No authorization means no accounts/peers generated and no AUTO send qualification. No second login/DB/approval platform should be created.

**W24 only source-level OWNER ACK**. True channel accounts ONLINE, fixed 44767 user-visible CONTACT, W25 real Provider ACK and real send remain WAITING_USER_AUTH / integration HOLD. Existing 44751 never touched.
