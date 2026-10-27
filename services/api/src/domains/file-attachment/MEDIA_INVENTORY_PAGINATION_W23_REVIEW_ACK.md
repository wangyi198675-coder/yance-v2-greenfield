# W23 FileAttachment | 2026-10-28 | Native authorized inventory/pagination Owner REVIEW_ACK

**Owner scope:** only `services/api/src/domains/file-attachment/**`. User request: complete the pre-existing `PersistentMediaAssets` authorized inventory list. This W23 ChatGPT Owner ACK is a scope/code review and local test acknowledgment, **not** independent W24/W44/W47 review, legal/security attestation, 44767 user acceptance, or verified real-user identity.

## Existing implementation retained unchanged

The original AES-256-GCM encrypted disk store and `begin/upload/metadata/read/delete` flows are reused; no new database, attachment sender, K provider, account login, media generation, W25 outbox, extra credential manager, or Windows installation required.

## Exact new native service contract

```js
const page = await existingPersistentMediaAssets.list({
  actor: currentTrustedPrincipal,
  k: currentW24FivePartK, // {tenant,account,channel,peer_id,binding_revision}, never from browser body
  cursor: null,           // opaque cursor from previous response, default null
  limit: 20,              // 1..50 inclusive, default 20
  kind: null,             // null | "image" | "video" | "audio"
  mime: null,             // null | a supported original W23 MIME
  query: ''               // optional filename/MIME case-insensitive substring, max 80 chars
});
// {items:[{asset_id,purpose,message_id,original_name,mime,kind,byte_size,
//   sha256,created_at,status:"READY"}],has_more,next_cursor,order:"created_at_desc_asset_id_desc"}
```

Authorization per request is NOT inferred from in-memory assets: first `authority.check({action:"list",actor,k,asset_id:null,...})` requires an active current account, valid grant/consent and live expiry/revision/revocation/custody epoch. Each candidate attachment is rechecked using existing `authority.check({action:"read",actor,k,asset_id,consent_id,grant_id,purpose,message_id})`. Denied assets are excluded, and each included asset plus top-level list scope is rechecked immediately before response. If authority/revisions change, fail closed with no partial items. Missing current W24/W44 authority yields `ACCESS_DENIED`, not synthetic empty-user success.

The signed opaque HMAC cursor uses a key **derived** from the existing protected W23 key (not stored/returned independently), binds the trusted actor, all five K fields, normalized filters, current authorization revisions/epochs, and a snapshot fingerprint **of this K only**. New items/deletes/status changes in the same K invalidate old pagination (`LIST_SNAPSHOT_CHANGED`); unrelated other-account items do not. The 5-minute cursor has no embedded plaintext index/filename/account/actor/key. Stable sort is `created_at DESC, asset_id DESC`; no total count of other accounts, reserved/revoked assets, secret paths, ciphertext or raw `index.json` exposed.

Cursor errors: `CURSOR_INVALID` (invalid MAC/subject/filter), `CURSOR_EXPIRED`, `AUTH_REVISION_CHANGED`, `LIST_SNAPSHOT_CHANGED`. Filter errors `BAD_FILTER`, `BAD_PAGE_LIMIT`. Revoked or expired accounts/grants/consents fail `ACCESS_DENIED`. No alternate authentication or synthetic account fallback.

## Exact native W23 HTTP handler route

`GET /v2/media/assets?limit=20&kind=image&q=camera&mime=image%2Fpng&cursor=<URL-encoded-opaque-cursor>`

The original `createWebMediaHttpHandler({service,resolveIdentity,checkCsrf})` also accepts its established same-origin `/api/v2/media/assets` prefix. It resolves existing trusted server identity first and returns HTTP200 JSON with `Cache-Control: no-store`; missing identity HTTP401; scope denied HTTP403; expired/stale inventory HTTP409; bad/duplicate/unknown parameters HTTP400. `limit` 1–50; unknown query keys rejected; cursor can only be reused with identical actor/K/filters and current authorization version. **The existing binary PUT/GET, DELETE, upload-session contracts are untouched.**

## W47 minimal gateway integration required (W23 DOES NOT modify W47)

Actual W47 original `services/api/runtime/w47-w23-media-bridge.mjs` currently only allows capabilities/upload and `/{asset_id}` routes and unconditionally denies any URL query with `W23_MEDIA_QUERY_NOT_SUPPORTED`. W47 must **ONLY**:
1. Add `GET /api/v2/media/assets` to its existing strict `allowedMethod`, before `/{asset_id}` matching.
2. Allow strict `cursor,limit,kind,mime,q` query for only this GET route (no query allowed for all existing W23 routes), delegating final input validation to this W23 HTTP handler.
3. Reuse existing W47 first-party session/realAccountVerified five-part K + W24/W44 effective grant/consent/current epoch and W55 actual owner-protected 32-byte media key. No W47 fallback to synthetic actor, raw index filesystem, or client-supplied K.
4. In MEDIA UI consume returned `items,next_cursor,has_more` and actual GET-by-id; no new media engine. W09-3 owns coordinated 44767 update/Chrome+Opera readback.

If there is no real current user W24 identity/grant/key, W47 must preserve existing `REAL_ACCOUNT_MEDIA_UPLOAD_HOLD`, `libraryListing.available:false` and not invent files. The fixed Web version with W23 SOURCE merged is **not** evidence of real account upload or authenticated pagination.

## Actual validation (synthetic permissions; not claims of real account)

`node --test services/api/src/domains/file-attachment/*.test.mjs`

Original 26 tests retained. New tests include authenticated loopback GET, stable pagination, case-insensitive search and kind/MIME, tampered/foreign cursor, wrong principal/tenant/account/peer/binding, per-asset denied grants, account/consent/grant expiry/revoke and revision changes, snapshot mutation and deleted/reserved hidden, cursor TTL, and a fresh independent Node process listing from encrypted disk with the current test key. All local test accounts are explicitly synthetic QA fixture identities, not current live customer accounts.

**Out of scope / HOLD:** real W24/W44/W55 authorized K+key injection, W47 gateway path and actual 44767 integration, real user media, multi-process transactional locking, malicious file scanning, AI image/video/TTS provider or RTC, actual platform media/ACK. Production and real social sends not tested.
