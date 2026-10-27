# W24 → W47 + W09-3 | Approved R4 Compact V1 | complete five-part K contact projection

Read authoritative Windows design root `DESIGN_APPROVED_20261027_R4_COMPACT_V1/00_START_HERE.md`, `01_USER_APPROVED_CHANGELOG.md`, and `YANCE_CONTACT_SIDEBAR_DESIGN_SPEC_20261027.md` before code. **DESIGN_APPROVED does not imply USER_DELIVERED.** This W24 change is a narrow backend contract; it neither redesigns the UI nor adds a second contact store or sender.

## Existing W24 source retained

Existing W24 `IdentityConsentService` / original W44 SQLite are the sole persistent account/Peer/binding/Consent/epoch authority. Original W26–W29 official SDK/REST account and peer inventory is the only evidence of provider identity. Original `native-owner-reads.mjs` now returns exact
`{accountRef,channel,peerRef,bindingRevision,displayName,identity:{tenant,account,channel,peer_id,binding_revision},identityKey,accountEpoch,consentEpoch,w24CurrentKVerified:true,w24ConsentCurrent:true}`.
The canonical identityKey is exactly `canonicalK(identity)`; **never** concatenate displayName or raw Peer ID in a UI, nor replace it with four-field, cross-tenant `contactRef`. Owner reads check trusted W54 current Principal, actual provider session, original W44 active account and binding, and each W24 Peer identity/epoch, **again before returning**. No GET/selection/focus invokes TAKEOVER. Uncommitted W24 in-flight complete-K delta was preserved and validated; new module is additive.

## New W24 authorized Smart Inbox projection API (original W24 domain only)

```js
import {createW24NativeOwnerReadPorts} from './native-owner-reads.mjs';
import {createW24ScopedContactProjection} from './native-contact-projection.mjs';

const original = createW24NativeOwnerReadPorts({
 identityConsent,resolveNativePrincipal,
 listVerifiedPlatformAccounts,listVerifiedPlatformPeers,readW44IdentityAuthority
});
const scoped = createW24ScopedContactProjection({
 ...original,
 // OPTIONAL, only if W25/other original Owner supplies authoritative persisted
 // metadata with exactly matching current original W24 full K and epochs.
 readOriginalContactMetadata
});
const dto = await scoped.readContacts({
 principal: currentVerifiedW54Principal,
 session: currentOriginalW47NativeSession,
 filter: {channel:'ALL',accountRef:'ALL',query:''}
});
```

Returns `{authoritative:true,source:'W24_CURRENT_K_AND_NATIVE_CHANNEL_OWNERS',connectedAccountCount,contacts:[...],canSend:false}`. Every contact contains:
```json
{
 "contactRef":"canonical five-part identityKey, no synthetic placeholder",
 "identityKey":"canonical five-part identityKey",
 "identity":{"tenant":"...","account":"...","channel":"FB_PAGE","peer_id":"...","binding_revision":1},
 "tenant":"...","accountId":"...","accountRef":"...","channel":"FB_PAGE",
 "peerRef":"...","bindingRevision":1,"accountEpoch":0,"consentEpoch":1,
 "displayName":"provider-verified name",
 "w24CurrentKVerified":true,"w24ConsentCurrent":true
}
```
**This is a field-shape illustration, NOT an authorized live account and NOT a reason to display ONLINE.** No record is generated unless the already-installed original W24 account and peer read ports return current valid records. A real K must never be mapped to `SYNTHETIC_TEST_ONLY`, `fixture-` or `fake-` to make tests pass; W24/W44 current strict format will still reject it until independently authorized original Owner adaptation.

Scoped filters: `channel` (ALL or one of four canonical channels), `accountRef` (ALL or an already authorized exact account), and `query` (Unicode NFKC normalized search of authorized display name / Peer / account ref). Unknown fields or account not in original verified scope fail closed; no cross-account merging even when two people share exactly the same name and provider Peer locator. Search of **message contents** is not supported without original W25 indexed/persisted message metadata. For optional `unreadOnly`, `pinnedOnly`, `archivedOnly`, `managedOnly`, `needsReplyOnly` and `tag` the optional injected original owner metadata callback must return one **authoritative matching K, account, bindingRevision, accountEpoch, consentEpoch** per already-authorized W24 contact. If absent/stale, explicit `CONTACT_FILTER_NATIVE_METADATA_NOT_CONNECTED` / `ORIGINAL_CONTACT_METADATA_SCOPE_STALE`, no fake 0 unread, fake pin, fake archive or phantom contacts. On metadata retrieval the current W24 account and Peer roster is reread to detect mid-query revocation.

No new DB: contact identity survives process restart because original W44 durable database records and provider-authorized account/Peer mapping are independently reloaded. K is deterministic and stable until account revocation, Peer rebinding or bindingRevision changes. W24 does not store unread, tags, avatar, drafts or provider messages.

## Exact W47 and W46 R4 consumer mismatch; next OWNER-only minimum

Checked exact W47 R4 worktree `W47_R4_LIVE_K_20261027`, current head `5e890fb0b14437f0c35324f4a30c42edc831a183` **with in-flight uncommitted edits**:
- `services/api/runtime/native-authoritative-reads.mjs` **already** validates complete original `identity` and `identityKey`, and its current in-flight version now includes both in `contacts:visible.map(...)`. W47 Owner must finish/test/commit that own change, then W09-3 alone integrate into fixed Web; **do not overwrite current W47 worktree**. The fixed Web still needs actual W54/W24/SDK ports injected before real contacts.
- `apps/web/src/live-chat-source.mjs` currently recomputes `contactRef` using `[accountRef,channel,peerRef,bindingRevision].join('|')`. This omits tenant/current W24 canonical K and can cause stale selected-contact identity after a tenant or account binding changes. W47/W46 owner should prefer the W24 **exact `identityKey`** as stable `contactRef` after original `fullK(identity)===identityKey` validation; **do not** derive a new UUID or merge by displayName, and never use the K alone as consent to send.
- `apps/web/src/BCLiveChatWorkspace.vue` currently expects `contactRef` for selection and `identity`+`identityKey` for messages/Composer. W47/W46 can preserve search/scope/selection/scroll in their Vue layers; W24 must not modify their source.
- `/api/v2/contacts` read remains current-session gated. W47 does not yet use this new `readContacts` convenience projection nor support genuine W25 unread/pin/archive metadata; **do not report those filters as USER_DELIVERED**.
- `/api/v2/messages` original W47/W25 must independently authenticate the browser-selector `identityKey`, current W24 identity and READ_INBOUND consent before reading any private original. New W24 projection is never a substitute for this separate check.

## Tests and gates

On DESKTOP-029FH47, W24 all tests (original+new) **96/96 PASS** using original W44 durable SQLite, actual W47 R4 code and original W25/W46 test source roots (isolated fixtures, **not live platform logins**). New tests 9/9 PASS for same-name and same-JID two-account full-K noncoalescing, original W44 SQLite close/reopen K/epoch equality, revoke A persistent/removes A but B survives, unauthorized account filter denied, status metadata fail closed, read-only no custody changes, SDK disconnect no phantom ONLINE, and spoofed metadata denied.

Original R4 W47 test routing changed to require `URL.searchParams`; W24 test fixture was updated to pass an actual URL. W47 R4 deliberately denies synthetic tenant fixture (expected 503) rather than faking a real contact. No physical send, model bill or genuine social login performed.

**W47 next**: preserve complete identity/identityKey through trusted GET to live-chat-source, consume only W24 current scope, propagate stable five-part contactRef, retrieve metadata from original W25 when actually available. **W09-3 next**: exact SHA join and fixed 44767 Web/API readback and Chrome/Opera real UAT; until user-authorized channel platform identity exists, show `WAITING_USER_AUTH` not sample contacts.

**Status**: W24 SOURCE_ONLY_PASS; W47_R4_CONSUMER_IN_FLIGHT; AUTHORIZED_PLATFORM_ACCOUNT_WAITING_USER_AUTH; FIXED_WEB_USER_DELIVERED_HOLD. No 44751 or existing 44767 deployment in W24 scope.
