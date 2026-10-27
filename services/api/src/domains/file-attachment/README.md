# W23 · Canonical FileAttachment — Issue #9

**Scope:** nonproduction, self-contained Node.js 24 native service and loopback HTTP adapter. All uploaded bytes are **fictional** and must carry `YANCE_SYNTHETIC_FILE_V1\n`. This is running code, not a copy of the old Yance upload backend; it is **not** a production upload/media service.

Run in this directory or from repository root:

```sh
node --test services/api/src/domains/file-attachment/*.test.mjs
```

The tests run without additional packages, external APIs, real accounts, paid tools, or DB migrations. HTTP tests bind only temporary `127.0.0.1` sockets and close them.

## Actual implemented service interface

| Method | Actual behavior |
|---|---|
| `canonicalK(k)` | Validates full synthetic `tenant/account/channel/peer_id/binding_revision`; exactly four frozen channels |
| `FileAttachmentService.beginUpload` | Server-current authoritative access check, upload reservation and stable idempotent AssetID/session |
| `completeUpload` | Fake byte marker/length validation, two current authority checks, AES-256-GCM ciphertext in RAM, READY metadata |
| `getMetadata` | Per-K scoped and current authorization, sanitized metadata only |
| `issueReadCapability` | Random one-use, short-expiry read handle bound to principal/K/assets and authorization epochs |
| `readWithCapability` | Checks current W24/W44 authority before and after decrypt; rejects replay, stale binding/epoch, expired or revoked grant |
| `registerDerivative` | Synthetic derivative registry; does not imply remote provider upload or deletion |
| `revokeAsset` | Owner-authorized idempotent tombstone, zero/remove local ciphertext, invalidate handles, report remote derivative deletion **UNCONFIRMED** |

`createSyntheticAssetHttpHandler({service,resolveIdentity})` is a real Node `http` request handler and **never starts a listener itself**. Trusted `resolveIdentity(req)` must return `{actor,k}`; request JSON is never permitted to authorize its own actor, tenant, account or peer. To run it, the integrating server must independently provide a trusted W24 authenticator and W44 effective grant/consent checks; this module deliberately does **not** invent a second identity or grant store.

### Actual HTTP routes (nonproduction, v2 synthetic)

| Verb | Route | Request / response |
|---|---|---|
| POST | `/v2/assets/upload-sessions` | JSON purpose, declared_mime, byte_size, fake consent_id, fake grant_id, fake idempotency_key → session_id, asset_id |
| POST | `/v2/assets/upload-sessions/{session_id}/complete` | `{bytes_base64}` → READY metadata; accepts synthetic marker only |
| GET | `/v2/assets/{asset_id}` | Current-authorized sanitized metadata |
| POST | `/v2/assets/{asset_id}/read-capabilities` | Optional ttl_ms 1..10000 → one-use handle |
| POST | `/v2/assets/read` | `{read_handle}` → synthetic_bytes_base64 only after fresh checks |
| POST | `/v2/assets/{asset_id}/derivatives` | `{provider_ref:"fake-..."}` → derivative ID |
| DELETE | `/v2/assets/{asset_id}` | Revocation status and accurate external derivative deletion state |

All HTTP replies include no-store and JSON error code; unknown routes give 404, unauthenticated caller 401. Bearer handles are not persistent grants. Network listener/authenticator/production routing remains **other Owner's responsibility**.

### External authority Port — required for every operation

`authority.check({action,actor,k,asset_id,consent_id,grant_id,purpose})` must asynchronously return authoritative `{allowed,principal,tenant,account,channel,peer_id,binding_revision,account_active,grant_active,consent_active,expires_at,grant_revision,consent_revision,revocation_epoch,custody_epoch}`.

Every relevant field must match; missing or stale fields fail closed. `revoke` deliberately tolerates a revoked grant/consent **when the trusted identity authority still permits the owner to remove their asset**. This is a **Port contract**, not a claim that W24/W44 is already implemented or connected. Any synthetic test's permissive authority must **never** become a production handler.

## Ownership and truth limitations

- W23 has no MessageDelivery, Outbox, SendIntent, MID, ACK or UNKNOWN implementation. W25 may reference READY `AssetID` but must independently check present entitlement at its immutable send boundary.
- W24 owns current canonical identity/binding revision and actual consent; W44 owns grant/custody/budget. A client-supplied K is always insufficient without those trustworthy services. **P0 dependency:** no real W24/W44 bridge yet.
- AES-GCM ciphertext is real, but the key is ephemeral RAM only. No durable object store, KMS key hierarchy, scan/AV, quota transactions, persistent DB, disaster recovery, secure CDN invalidation or audited deletion pipeline. **P0 before production.**
- Only a fake marker MIME (`application/x-yance-synthetic`) is accepted. Real photos, audio, video, untrusted MIME, third-party links and external provider media are not supported. User media must not be presented as tested.
- Synthetic derivatives are tracked and on revoke marked `EXTERNAL_DELETE_UNCONFIRMED`; Meta/Pancake/Baileys/TDLib media delete and backup propagation belong to independent channel/storage Owners and remain **HOLD**.
- Real Windows Tauri resource CSP, local file paths, multitenant distributed locking, persistent idempotency/outbox and restart recovery are not tested. No direct external sending or live logins.

**W23 delivery:** real, runnable nonproduction metadata/upload/read/revoke API, current-authority Port guards and proof of local encrypted fake bytes. **Not:** P4 readiness, real-provider/media integration or production security signoff.
