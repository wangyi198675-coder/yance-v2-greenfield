# W55: W47 local-Web BYOK Windows native port (original WinCred/DPAPI)

Scope: W55 OWNER ONLY. Call the existing W55 NativeKeyCustody in the **same logged-in Windows user** as the W47 local API process. Do **not** install Tauri, a new Vault, a model runner, a second API listener, an account-login server or a pairing flow.

## Build / location
- Exact Rust source: packages/credential-custody/src/bin/web_local_cloud_keys.rs
- Existing library: packages/credential-custody/src/cloud_keys.rs (unchanged)
- Build: cargo build --release --offline --locked --manifest-path packages/credential-custody/Cargo.toml --bin web_local_cloud_keys
- Produce the original release executable from target/release/web_local_cloud_keys.exe. Bundle next to the current authorized W47 Windows LOCAL Web API runtime. No production 44751 release without explicit user permission.
- W47 starts **one direct child per operation** using Node spawn(executable,[],{stdio:['pipe','pipe','ignore'],shell:false,windowsHide:true}) and writes one UTF-8 JSON object to inherited stdin, then **closes stdin**. Read one bounded JSON response and check process exit status 0; exit 3 means generic rejection.
- There is no TCP server, public credentials route, CLI secret argv, env secret, file secret, localStorage or credential-table duplication. Secret bytes reach W55 only in private JSON stdin for user-initiated save, then are encrypted by the existing original WinCred+user-scope DPAPI. The W47 HTTP route is OWNED BY W47 and must use the already-existing strict same-origin/localhost session, explicit user action, host/content-type, CSRF, request-size bounds, no-store and no-key logging.

## Strict private native frames

### Status (public W47 response may use these four redacted fields)
Stdin: `{"op":"status","provider":"OPENROUTER"}`
Success: `{"ok":true,"provider":"OPENROUTER","configured":false,"revoked":false,"revision":0}`

### Initial user enrollment
Stdin: `{"op":"store","provider":"OPENROUTER","secret":"<user's submitted key>"}` (actual stdin is private; never persist/echo this object)
Success: same redacted status, configured true, revision 1.

### Rotation or post-revocation explicit reconfiguration
Stdin: `{"op":"store","provider":"OPENAI_API","secret":"<user's submitted key>","expectedRevision":1}`
Success: same redacted status, new revision. An incorrect/stale expectedRevision fails; only explicit same-user reconfiguration revives a revoked tombstone.

### Revocation
Stdin: `{"op":"revoke","provider":"OPENROUTER","expectedRevision":2}`
Success: same redacted status, configured false, revoked true, incremented revision. The original tombstone is retained; no previous revision can lease a Key.

### ORIGINAL W43 Agno private executor only — forbidden in HTTP responses
Stdin: `{"op":"lease_for_agno","provider":"OPENROUTER","expectedRevision":2}`
Internal private child stdout: `{"ok":true,"privateKey":"<transient plaintext>"}`
This operation is **never a W47 browser endpoint**. Only W47's EXISTING original private nativeCloudKeyPort.withSecret/resolveNativeCloudSecret callback may invoke it AFTER verified user model selection, current session and explicit paid-cost consent are rechecked for EACH inference. W47 must consume transient bytes in memory, forward only into original W43 private Agno SDK stdin callback, never send them in HTTP, logs, request diagnostics, file, cache or browser JS. The child exits immediately; on revoked/stale/missing revision the callback receives no Key.
- Provider names are exact: OPENROUTER (maps to W43 OPENROUTER_USER_API) and OPENAI_API (maps to W43 OPENAI_USER_API).
- No server fallback from no-model/Qwen to a paid model. User selecting cloud source does not itself spend money.
- W55 doesn't own W43 Agno History or sqlite. Revoking a Key does not touch any Agno histories.

## Errors / limits / current-user identity
- A bounded stdin command is <=4096 bytes, exactly one JSON object, strict known properties op, provider, expectedRevision, secret; only these two provider IDs.
- Nonzero exit 3 emits exactly `{"ok":false,"error":"NATIVE_CREDENTIAL_DENIED"}`. Never return the supplied key, target, user SID or exceptions in an error.
- The existing NativeKeyCustody original current-Windows-user DPAPI engine is reused; the adapter derives a stable Web-local NativeScope from the **actual current Windows token SID**, re-checks SID per operation and hashes a fixed Web-local scope label. Browser cannot select principalRef, installationRef, namespace or storage target.
- Web scope is intentionally distinct from W54 Tauri installation-scoped slots. A user who configures a Web key is not silently reading an existing Tauri key. Existing cloud UI displays the configured Web scope status only.
- Production release **ignores** W55_WEB_QA_SCOPE environment variable; Debug permits a strictly formatted W55_WEB_QA_<32 hex> fake credential namespace for independent original Windows OS tests. Debug QA-only qa_cleanup wipes only that fake scope, never production.
- The OS same-Windows-user boundary is the intended private local software boundary; no device registration or new signing service. Do not expose executable stdin/stdout as a public browser-controlled arbitrary command proxy.
- Never test with or inspect any user's existing real API Key. No real billable model calls or social sends.

## Real Windows acceptance
- tests/web_local_cloud_keys.rs spawns an independent actual Windows child for each real WinCred operation using a unique fictional slot, validates current-user DPAPI cold process recovery, redacted states, provider isolation, CAS rotation, tombstone revocation, no later leases, explicit recovery and QA-only cleanup.
- Original preexisting 25 Rust unit tests + non-test sealed/existing native tests still PASS.
- W47/W46 **still must integrate** their owned HTTP and Vue route, use the exact built native exe and run real Chrome Web BYOK UI. W55 owning this native child does not itself make ordinary Web UI user operable or billable cloud Agno E2E PASS.
