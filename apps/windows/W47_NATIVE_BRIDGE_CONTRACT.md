# W54 → W47｜Native-only server verifier seam (design + internal Rust code, no network bridge enabled)

**Nonproduction source only**. W54 may not modify `services/api/runtime/**`. In this PR, **there is no HTTP bearer/token/session route, named-pipe listener, connected W47 server, or platform identity**. Nothing from a browser is sufficient to change W47's `trustedSession:false`, `canSend:false` or existing 401. `session_status` in Tauri returns redacted OS/session flags, never proof material.

The native Rust implementation under `src-tauri/src/session.rs` offers:
- `SessionAuthority::new(current_windows_principal().ok(), TTL)` bound to OS-derived process token SID + logon AuthenticationId + PID (never a JS-provided principal);
- an **internal-only** `mint_for_native_bridge` / `verify_native_bridge` single-use challenge+revision check; no renderer command exposes the opaque proof;
- `revoke`, private `rotate`, and exit-hook revocation, plus TTL expiry and unique boot nonce on every process start;
- OS binding and stale/replay checks at each native validation.
- Tauri registered commands only `session_status` and `logout_session`. `app:allow-*` permissions apply solely to bundled `main` window.

**Not yet implemented / no permission to claim READY:** OS-authenticated pipe or inherited native process handle to W47; token-attested OS principal transmission to a verified server child; anti same-SID independently launched process proofs; persistence/monotonic revocation across crashes; Windows installer signing; W47/W24/W44 integration. Once W09 grants W47 and independent SEC joint scope, implement an **inherited/OS-bound private native transport**; its server-side verifier must accept only a trusted native peer identity and a one-use challenge scoped to process instance. Do not put opaque proofs or Windows tokens into HTTP/headers/URLs/localStorage.

Proposed server-only contract (NOT presently callable):
```text
NativePeerVerifier.verifyCurrent(verifiedNativeTransport, oneUseChallenge) ->
  VERIFIED {internalPrincipalRef, nativeSessionRevision, nativeInstanceRef, issuedAt, expiresAt}
  | REVOKED | EXPIRED | REPLAY | UNAVAILABLE
```
W47 must recheck on each sensitive GET/CAS and never trust `Origin`/`Host`/`localhost`/`actor`; without native proof 401, without legal ChannelAccount+Peer provider proof 403, with stale W24/W44 revision 409, with missing authority 503. W47 remains the sole HTTP adapter owner. Real social account authorization, W24 canonicalK, W44 Consent/Grant/STOP/Budget, W25 ADMISSION/PRE_NETWORK and ACK belong exclusively to their existing Owners.

Risk declaration: Windows SID or app-host label alone does **not** prevent an attacker running under the same user from injecting into the trusted host or stealing its memory. This is a local trust-boundary prototype, not a complete production OS/app isolation certificate.
