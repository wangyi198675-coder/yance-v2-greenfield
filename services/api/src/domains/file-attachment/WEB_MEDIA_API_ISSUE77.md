# W23 / Issue #77 — real browser attachment upload contract (nonproduction owner slice)

## Current state, without pretending UI integration

This **implemented Node HTTP handler** accepts actual binary file bytes from an ordinary Web browser, with actual encrypted local storage. It **does not** require Windows/Tauri/NSIS. It does **not** imply that W47 has mounted these routes or that W46 has wired the Media button in the fixed 44767 UI. W09-2 owns the real integrated 44767 click → HTTP → native persistence → readback UAT.

Legacy `file-attachment.mjs` and `http.mjs` retain their 15 SYNTHETIC-only tests and should not be mistaken for this new media API.

**Files:** `web-media.mjs`, `web-media-http.mjs`, `web-media.test.mjs` in existing W23-only directory.

### Mandatory server-side bootstrap (host supplies identity, grants and custody; do NOT hardcode credentials)

```js
import {PersistentMediaAssets} from './web-media.mjs';
import {createWebMediaHttpHandler} from './web-media-http.mjs';

const service=await new PersistentMediaAssets({
  directory: protectedHostAppDataPath,  // absolute; OUTSIDE the web document root and git worktree
  key: await credentialCustody.getMediaKey32(), // 32-byte stable protected AES key; NEVER generate on each launch
  authority: {check: async ({action,actor,k,asset_id,consent_id,grant_id,purpose,message_id}) =>
    await actualW24W44AssetPermissionCheck({action,actor,k,asset_id,consent_id,grant_id,purpose,message_id})}
}).open();

const handler=createWebMediaHttpHandler({
  service,
  resolveIdentity: async req=> await actualAuthenticatedW47SessionIdentity(req), // {actor,k}
  checkCsrf: async req=> await actualW47SessionCsrfAndOriginGuard(req)
});
// Mount handler in existing same-origin W47 server; do not introduce a second HTTP listener.
// It accepts /v2/media/* or /api/v2/media/* (the latter for the existing Web route convention).
```

This is **integration pseudocode**, not a claim that the named W24/W44/W55/W47 host adapters currently exist or are connected. `key` must come from an already protected vault/key mechanism. The module does not generate a persisted key, create a second login/grant subsystem, or introduce a second sender.

### Precise routes available on the actual handler

Browser same-origin prefix `/api/v2/media` (also accepts `/v2/media`):

| Method | Route | Real input / output |
|---|---|---|
| GET | `/capabilities` | Authenticated JSON `attachment_store`, accepted `mime/kind/max_bytes`, generation states all `PROVIDER_NOT_CONFIGURED` |
| POST | `/upload-sessions` | JSON (below), authenticated and CSRF validated; returns HTTP 201 `{asset_id,status:"RESERVED",expires_at}` |
| PUT | `/{asset_id}/content` | Request body **raw binary File/Blob**, `Content-Type` and bounded `Content-Length`; checks declared type, byte length, file signature, current grant, account, message ownership; returns READY metadata |
| GET | `/{asset_id}` | Authenticated, current-authorized sanitized metadata |
| GET | `/{asset_id}/content` | Authenticated **binary response** with `Content-Type`, `Content-Length`, `Content-Disposition: attachment`, `Cache-Control: no-store, private`, `nosniff`, CSP sandbox |
| DELETE | `/{asset_id}` | Authenticated and CSRF validated, persisted tombstone, encrypted blob removed; `{status:"REVOKED",deleted_at,external_provider_deletion:"NOT_APPLICABLE"}` |

POST JSON format; none of `actor`, `k`, `peer_id`, `account` in this body is an authorization source:

```json
{
 "purpose":"contact_draft",
 "mime":"image/png",
 "byte_size":12345,
 "original_name":"test.png",
 "message_id":null,
 "consent_id":"<reference to existing owner-authorized consent>",
 "grant_id":"<reference to existing effective grant>",
 "idempotency_key":"<per-user unique opaque upload request ID>"
}
```

**Full K (server-derived only):** `tenant/account/channel/peer_id/binding_revision`. All five fields must match owner authority readback on every create/upload/read/delete. A `contact_received` attachment requires a `message_id` already authorized to this canonical identity, and a `private_tool_artifact` cannot claim a contact MID. Draft attachment has `message_id:null`, and any future send binding requires a separate W25 send-intent validation; this module never sends.

The external `authority.check` must return:
`allowed,principal,tenant,account,channel,peer_id,binding_revision,account_active,grant_active,consent_active,expires_at,grant_revision,consent_revision,revocation_epoch,custody_epoch`.
When a `message_id` is supplied, it must additionally return `message_authorized:true,authorized_message_id:<exact matching MID>`; otherwise the attempt fails closed. The `delete` action may permit asset owner erasure after grant revocation, provided the trusted identity authority still establishes ownership and returns `allowed:true`.

### Web-only sample call (illustration, not an already wired W46 component)

```js
const prefix='/api/v2/media';
const session=await fetch(prefix+'/upload-sessions',{
 method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfFromAuthenticatedSession},
 body:JSON.stringify({purpose:'contact_draft',mime:file.type,byte_size:file.size,
  original_name:file.name,message_id:null,consent_id,grant_id,idempotency_key:crypto.randomUUID()})
}).then(r=>{if(!r.ok)throw Error('UPLOAD_RESERVATION_FAILED');return r.json()});
const stored=await fetch(prefix+'/'+session.asset_id+'/content',{
 method:'PUT',credentials:'same-origin',headers:{'Content-Type':file.type,'X-CSRF-Token':csrfFromAuthenticatedSession},body:file
}).then(r=>{if(!r.ok)throw Error('UPLOAD_BYTES_FAILED');return r.json()});
const binary=await fetch(prefix+'/'+stored.asset_id+'/content',{credentials:'same-origin'})
 .then(r=>{if(!r.ok)throw Error('ATTACHMENT_READ_DENIED');return r.blob()});
```

The browser automatically supplies Content-Length for normal Blob uploads. Do not manually attach a bearer/media token or reuse another contact's AssetID.

### MIME and per-file size gates

- Image: `image/png`, `image/jpeg`, `image/webp` each max **8 MiB**.
- Video: `video/mp4`, `video/webm` each max **48 MiB**.
- Audio: `audio/wav`, `audio/mpeg`, `audio/ogg` each max **16 MiB**.
- `image/svg+xml`, executable formats, mismatched MIME/signature, oversize or no fresh scope authorization are rejected. Container signature is **not** full codec decoding, antivirus, content policy scanning or transcoding.

### Proven test / remaining gates

`node --test services/api/src/domains/file-attachment/*.test.mjs`

Tests create their **own** PNG and RIFF/WAV file bytes plus a structurally recognizable MP4 container; never use customer data. Disk bytes AES-256-GCM encrypted; metadata/idempotency survive re-instantiation; a separately started Node process reads persisted WAV with the same test key; DELETE survives fresh store opening. Full decoded MP4 playback is **NOT_RUN**, not invented.

**Storage-security boundary:** the file byte blobs are AES-256-GCM encrypted; the local JSON metadata index is **not encrypted** and must be protected by the host AppData ACL or migrated to an owner-approved encrypted metadata DB. The encrypted blob store is single-process only; concurrent multiple workers, host key rotation, validated codec playback, content scanning, backup erasure and crash-consistent DB+blob transactions are NOT certified.

**P0/HOLD before real user-facing release:** explicit W47 same-origin route mount + trusted session/CSRF, W24/W44 current permission adapter, protected W55 durable key custody, protected AppData permissions, persistent multiworker safety or SQLite/PG transaction integration, AV/virus scanning, payload-content validation, backup/delete policy and W09-2 actual Opera 44767 click/readback. No image/video/TTS generating Provider was created. No automatic real channel account connection, media sending or production deployment.
