# W55 | 2026-10-26 | OpenRouter/OpenAI native cloud-key storage delta

## Exact task inherited
W09-2 main staging gate `W09_2_20261026_1345_FOUR_OWNER_JOIN_24D74BE_STAGING_44760_TRUE_HOLD.md`, joint-source HEAD `24d74be3309df81122acd82affd9099c853661da`. This is a **W55-only scoped source delta**; original 17/17 fake WinCred tests, previous race lock, W54 native host, W43 Agno, W45 translator, W46 sole Composer/Brain, W47 runtime and W24/W44/W25 sender are unchanged.

## Implemented Windows native-only storage engine
`src/cloud_keys.rs` is added alongside the original `src/lib.rs`. It uses the existing WinCred Generic Credential / current-Windows-user DPAPI helper routines and Local named per-target mutex, rather than building a second key-management server. Small OpenRouter/OpenAI API-key records only; Signal/TDLib databases deliberately out-of-scope.

- Provider discriminators proposed for W46/W47 final DTO: **`OPENROUTER` and `OPENAI_API`**. JSON enum explicitly fixed to those two literal IDs. This is a W55 storage namespace proposal, **NOT** unilateral authorization to rewrite W46/W47's existing `/private-brain/models`, `/model-catalog`, `/model-config` contracts.
- `NativeScope::from_w54_native_only(w54i_<64 lower hex>, w54u_<64 lower hex>)` encodes W54's true native installation-ref + local profile-ref shapes. Strings are selectors, NOT authority proofs. Hash of `{product namespace, W54 installation_ref, W54 principal_ref, provider}` is the opaque Credential Manager target; raw refs, Key bytes and provider metadata do not appear in target.
- DPAPI optional entropy bound to the opaque target; payload contains schema, precise W54 refs, provider, credential revision, revoked tombstone, encrypted Key. OS current user scope, **not** `CRYPTPROTECT_LOCAL_MACHINE`; `CRED_PERSIST_LOCAL_MACHINE` is user Credential Manager local persistence, not machine-shared permission.
- Core Rust-only functions: `NativeKeyCustody::enroll(provider, key_bytes)` (new target only, no overwrite/tombstone resurrection), `rotate(provider, expected_revision, new_key_bytes)` (per-target CAS), `revoke(provider, expected_revision)` (clears key, increments revision, permanent tombstone), `status(provider)` (no key), `with_native_key(provider, expected_revision, closure)` (temporary Zeroizing buffer, never serialized or offered over HTTP). Key is checked as a small printable token and, for OpenRouter, `sk-or-` prefix; local format check is **not** Provider-side API-key validity or billing consent.
- Normal `NativeKeyCustody::new()` is **sealed** and returns `VaultError::Sealed` for all five methods. There is intentionally NO production/native `unseal` factory, even if an untrusted client fabricates valid-looking W54 selector strings. The sole operable constructor is `#[cfg(test)] synthetic_native_test`; never compile a production app with fake test code. Rust call surface is not a Tauri command nor an HTTP endpoint.
- The existing synthetic FB/Page/WhatsApp/Telegram vault still defaults sealed. Tests only ever stored fictional `sk-or-v1-W55-FAKE...` / `sk-proj-W55-FAKE...` material. No actual user secret was read, accepted, migrated or entered.

## Actual source tests
Eight **new** Windows tests under `cloud_keys::tests`:
C01 normal sealed release access for enrollment/status/rotate/revoke/native callback;
C02 two fictional Providers, Windows WinCred+DPAPI ciphertext, wrong entropy denied;
C03 different installation or profile-ref cannot discover other target;
C04 rotate expected-revision fencing, restart recovery, revocation tombstone and old-Key no resurrection;
C05 invalid scope/provider, line break, oversized token negative cases;
C06 corruption can't reinitialize/expose secret;
C07 redacted Debug/status no Key or native refs;
C08 precise proposed Provider JSON IDs and rejection of incompatible aliases.

All **17 original tests retained**; total expected **25/25 PASS** after final run. Must additionally prove actual final command outputs and exact commit SHA before W09 independent signature.

## Minimum W54 -> W55 -> W47/W43 joint future native seam (design contract only)

1. W54 original Owner's real installed Tauri `NativeProfileAuthority::verify_for_native_owner(&SessionAuthority)` checks genuine current process token, trusted Tauri current-user app data, live session and persistent revocation generation. Its `NativeProfileEvidence::native_contract_parts` are valid selectors but **cannot** themselves unseal this library; do not accept renderer, HTTP header, Origin or localhost claims as equivalent.
2. **Joint W54+W55 native patch and independent SEC sign required**: create private, nonserializable, unforgeable W54-authenticated executor capability only inside the trusted Tauri/native host process; pass it directly as a Rust capability (not JSON, HTTP or copied refs) to a future reviewed W55 unseal factory. Reverify live session/revocation before *each* native enroll, rotate, revoke or secret use. No generic public `unseal(bool)`, environment override or synthetic fallback. No new enterprise login server.
3. User adds/replaces actual provider key through a reviewed native-host-owned secret entry dialog (prefer OS-native secure dialog); do NOT implement browser `POST /credentials`, JS credential GET, URL/CLI arg, logs, plaintext localStorage or renderer/HTTP roundtrip. Native UI ownership / user action is separate from model billing permission.
4. W47 still owns selectedModelId, model availability, quotas/paid permission, CSRF/local-session and original W43 Node->Python native IPC ledger. W43 authenticates actual Provider receipt and its own Agno callback; **no W55 fake/provider fixture is real cloud proof**. W54/W47 jointly design a genuine private inherited process/broker channel to W43's *approved native executor*; model Provider and revision / user billing consent checked immediately before issuing a key and each cloud call. Do not pass a token through unauthenticated localhost or public browser.
5. Each real user installed app uses independently generated W54 stable install/profile ref; no developer Windows username, SID, profile path, shared vault, SaaS account auth or static sample Key. Model change between OpenRouter/OpenAI must never reuse other Provider's Key. W24/W44/W25 continue their only real social send gates; cloud private Brain ≠ authorization to send contacts.

## Explicit unfinished gates
- W54-to-W47 authenticated auto local session NOT currently integrated/signed. This W55 source cannot and does not create it or authorize cloud billing.
- **Production cloud-key encryption code is compiled but permanently SEALED.** Native proof-verifying credential enrollment/access is NOT_INTEGRATED; real Key store and real native execution access NOT_READY. This is deliberate fail closed, not completion of the third staging blocker.
- True Windows *two different SID* isolation and signed installed app + clean-friend-PC UAT NOT_RUN. Current-user WinCred/DPAPI design alone is not a two-person runtime proof. Another malicious process under same OS SID can access user's WinCred/DPAPI by OS design; W54/W47's actual host-executor provenance remains relevant.
- Cloud SDK real billing, full real OpenRouter/OpenAI user approval and model switch, user-visible first-party receipt, rate limits/budget, paid traffic, same-process Python SDK key transfer all NOT_RUN. Do not charge or make user install/44751 switch.
- Crash dump/ETW memory scan, DPAPI backup rollback attack, secure erasure, and legal/SEC review NOT_SIGNED; copy of a key already handed to a worker cannot be revoked retroactively. Large Signal/TDLib state separate security design HOLD.
- Re-onboarding after a permanent per-target revoke requires a newly reviewed W54 native scoped slot / version; old tombstone is deliberately not silently erased or overwritten.

**Signed here only for scoped W55 nonproduction source + fake Windows tests. Real key authority H O L D / real Provider access H O L D / no public secret route / no deploy or main merge.**
