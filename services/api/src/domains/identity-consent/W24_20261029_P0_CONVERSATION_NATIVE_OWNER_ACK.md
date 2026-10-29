# W24 original Owner ACK | W512 2026-10-29 | Issue #146 P0 Conversation context menu

STATUS: W24_PERMISSION_PORT_SOURCE_SUBMITTED / CONVERSATION_DB_OWNER_UNASSIGNED / NO_WEB_DELIVERY / NO_DEPLOY

## Authoritative source actually inspected
- `C:\Users\1\Documents\YanceAuthority\20261005\MasterController\W512_20261029_W09_P0_PRO_CONTEXT_NATIVE_OWNER_MATRIX_DISPATCH_HOLD.md`, GitHub Issue #146.
- Desktop `DESKTOP-029FH47`, running `127.0.0.1:44751/version.json` Web SHA `706e934b983ad80da0132ab2ce84440f58975e68`, API SHA `abc106ee18f425f99de26dafcf24e49c4779b399`; `/api/v2/runtime/health`: `trustedSession:false,canSend:false,externalEffects:false,mode:NATIVE_PROVIDER_OWNER_PORTS_NOT_CONNECTED`.
- V2 repository `wangyi198675-coder/yance-v2-greenfield`. Original W24 Owner branch `owner/identity-consent/issue-4-native-k-20261025`, parent-before-this-task `a4e5bf1c621a07550c4815c311daaba0844d2b83`.
- W24 domain: `services/api/src/domains/identity-consent/**`, original `identity-consent.mjs`, `native-owner-reads.mjs`, `native-contact-projection.mjs`. Original W25: `services/api/src/domains/message-delivery/**`, `index.mjs` currently persists `send_intents`, `recipient_leases`, `outbox_attempts`, `receipt_events`, `audit_events`; these are not conversation state metadata tables.
- Current W47 route `services/api/runtime/native-authoritative-reads.mjs` allows ONLY authenticated `GET /api/v2/contacts`, reports `filterSupport:{unread:false,pinned:false,archived:false}` and `unreadCount:null`. `services/api/runtime/native-message-reads.mjs` exposes authenticated read-only `GET /api/v2/messages?identityKey=...`, not favorite/mute/delete. `services/api/runtime/server.mjs` routes GET /contacts, GET /messages, CONTACT model/mode; there is no integrated writable conversation-state endpoint. W47 Runtime owns those HTTP files, W24 cannot edit.
- `services/api/src/domains` contains only `file-attachment`, `grant-custody-budget`, `identity-consent`, `message-delivery`, `people-translation-reply`. **No actual Conversation/Inbox state domain, state migration or signed Conversation DB Owner exists in this V2 source.** GitHub Issue #146 asks the actual original Conversation API/DB Owner to identify themselves; this W24 view cannot claim or assign that ownership without that evidence.

## W24 actual minimal source delta

Only `services/api/src/domains/identity-consent/native-conversation-access.mjs` and `native-conversation-access.test.mjs`, plus this handoff. New `createW24ConversationAccessPort` requires the ORIGINAL signed callbacks:
```js
createW24ConversationAccessPort({
 resolveNativePrincipal, // existing W54 active first-party owner
 readW24AuthorizedAccounts, // original W24 native-owner-reads
 readW24VerifiedContacts, // original W24 native-owner-reads
 authorizeOwnerRbac, // inject existing authorized operator policy; never default allow
 newServerScopedRequestId, // injected original service-side idempotency
 verifyOriginalDeleteConfirmation, // OPTIONAL; mandatory for delete
 clock
});
```
Only W24 verifies a **server-reconstructed** `{tenant,account,channel,peer_id,binding_revision}`. A browser `contactSelector` is a LOOKUP value in original current authenticated W24 account+Peer roster; it is never treated as authorized K, Actor, Credential, Provider identity, Grant or RBAC token. W24 checks same W54 principal/installation/revocationGeneration, original account owner+channel/tenant/account/ref/binding, W24 Peer consent+accountEpoch, canonical identityKey and RBAC `{actor,identityKey,scope:'CONTACT',action}`, then re-reads current W24 account/Peer to catch revoke/rebind races.

Public W24-only in-process contract (there is NO HTTP listener):
```js
const access=await port.readAccess({session,principal,contactSelector,
 operation:'READ_CONVERSATION'|'READ_PROFILE'|'READ_CONVERSATION_INFO'});
const typed=await port.prepareMutation({
 session,principal,contactSelector,
 operation:'PIN'|'UNPIN'|'MARK_UNREAD'|'MARK_READ'|'MUTE_UNTIL'|
  'UNMUTE'|'ARCHIVE'|'RESTORE'|'FAVORITE_MESSAGE'|'UNFAVORITE_MESSAGE'|
  'LOCAL_HIDE'|'SOFT_DELETE',
 expectedConversationVersion,
 expectedBindingRevision,expectedAccountEpoch,expectedConsentEpoch,
 muteUntil,providerMid,confirmationRef
});
```
`typed` returns `{authorized:true,persisted:false,scope:'CONTACT',identity,identityKey,actor,accountRef,operation,idempotencyKey,expectedConversationVersion,expectedBindingRevision,expectedAccountEpoch,expectedConsentEpoch,canSend:false}` with optional `muteUntil`, `providerMid`, or explicit `deleteSemantics:LOCAL_HIDE|SOFT_DELETE,confirmationVerified:true`. **This is an authorization eligibility envelope, not a database write/ACK/HTTP response.** W24 rejects unknown Provider delete via `W24_CONVERSATION_ACTION_INVALID`; Provider deletion needs independent native SDK sender, currently HOLD.

- Favorite requires a real original provider MID input; W24 does NOT assert message ownership. Original W25/Conversation Owner must validate the MID belongs to same K and is currently readable before durable favorite write.
- Mute end is bounded to future 30 days; original Conversation DB/notification Owner must persist expiration, re-read after restart and implement suppression/expiry.
- `LOCAL_HIDE` means only hide this operator's conversation view, *not* delete provider messages. `SOFT_DELETE` must retain recoverable audit/tombstone per original Conversation DB Owner. `PROVIDER_DELETE` is explicitly disallowed at W24 metadata boundary. Both local delete operations need independently verifiable second confirmation, original W54 user principal, exact K, operation, expectedConversationVersion and expiry. A raw front-end Boolean cannot satisfy proof.
- Two W24 accounts with same contact name/Peer remain different K and version/CAS scopes. Revoke/missing W54 session/current provider Account/Peer fail closed. Selecting/viewing/contact menu opens READ only; no TAKEOVER. Explicit human takeover remains original W24 USER_EDIT Composer permission and W44 grant/custody source, not a context-menu hover side effect.

## Accurate original DB and HTTP Owner handoff — owner not yet signed

DO NOT edit `services/api/src/domains/message-delivery/index.mjs` or W47 route `server.mjs` from W24.
- Conversation/Inbox Database **NEW original Owner claim required**, recommended scoped file target to be approved by W09 before coding: `services/api/src/domains/conversation-state/**` (this path **DOES NOT currently exist**, not claimed as an implemented service), or the pre-existing Conversation DB Owner's actually identified native source. No W24-added migration.
- Persisted state should be keyed by stable server W24 five-part K + W54 owner, not contact name/raw Peer; original migration/DDL Owner must choose `conversation_state`, `message_favorites`, `conversation_state_events/audit` or equivalent *within their own existing DB*. These are **proposed names, not existing tables**.
- W47 owns native same-origin HTTP route integration. Proposed (NOT IMPLEMENTED) existing-API extension: `GET /api/v2/conversations/:selector/state`, `POST /api/v2/conversations/:selector/actions`, `GET /api/v2/conversations/:selector/info`, `GET /api/v2/messages/:mid/favorite`, `POST /api/v2/messages/:mid/favorite`. Request carries `operation`, `expectedConversationVersion`, original CAS epochs, and delete-specific `confirmationRef`; W47 derives actual current identity from W24 server, never client K. State Owner must enforce version compare/update **in one transaction**, return HTTP `409` on stale state/CAS/epoch, maintain idempotency persisted by `idempotencyKey` and distinguish `PENDING/CONFLICT/COMMITTED`. GET→real write→GET after crash/restart required for real acceptance, as well as cross-account and revoked-owner negatives. These are proposals only, not live routes.
- At present, all user-requested menu operations `PIN,UNPIN,MARK_UNREAD,MARK_READ,MUTE_UNTIL,UNMUTE,ARCHIVE,RESTORE,READ_PROFILE,READ_CONVERSATION_INFO,FAVORITE_MESSAGE,UNFAVORITE_MESSAGE,LOCAL_HIDE,SOFT_DELETE` have **UI_DISABLED_HOLD** for real user/database end-to-end. Existing UI read/search/copy is not proof of persisted rights; no Provider capability marked UNSUPPORTED without independent SDK Owner signed matrix.
- Original W25 alone may handle real message MID and ACK/UNKNOWN; metadata favorites are NOT an external provider ACK. A local-only soft delete cannot be promoted to provider deletion.
- W09 identifies/assigns and obtains signed ACK for true Conversation DB owner, W47 for HTTP, W25/Providers for MID/remote delete, W09-3 for Vue. W24 must not preempt them or deploy `44751`.

## Tests / source honesty

The new W24 contract test covers missing Owner ports, two accounts with same name and peer, current authenticated actor, deny unbound/revoked/other principal, RBAC denial, epoch/CAS validation, staged typed operations (not persisted), bounded mute, favorite MID required, deletion second confirmation and explicit provider-delete denial. Run `node --test services/api/src/domains/identity-consent/native-conversation-access.test.mjs` on the exact W24 Owner branch. GitHub native-node CI is the available execution source while remote Desktop Commander usage is paused. **No Conversation state DB exists to prove GET→POST→GET, version 409, crash durability or deletion audit**; do not claim any of those as passed or produce fictitious DB migrations. This is W24 `SOURCE_ONLY` awaiting exact hosted CI result and original Conversation DB Owner.

## Remote and release limitation

During execution Desktop Commander reported **monthly usage exhausted, do not retry/reconnect**. The existing device remains connected. New source and this ACK were pushed via authorized GitHub connector, not through Windows filesystem. Therefore this ACK could not be written into the local MasterController file and no Windows test, user Chrome/Opera click, real DB write, audit trail, or 44751 deploy was performed by W24. GitHub Issue #146 serves as immediate actual dispatch to W09; when remote quota returns, W09 may copy this exact committed ACK into MasterController under its own coordination duty.
