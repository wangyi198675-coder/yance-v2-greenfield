# W55｜2026-10-26｜Actual Windows test & dependency review

## Build and execution
- Device: DESKTOP-029FH47, Windows 11, rustc 1.99.1 (58cf8f9c3, 2026-10-13), cargo 1.99.1 (5f94df478, 2026-08-27).
- Baseline: 88ded0166ebbaa7556e347d2522efa063c19cf40. Isolated worktree W55_CREDENTIAL_CUSTODY_20261026, branch owner/credential-custody/w55-draft-20261026. Exact new source HEAD recorded in separate W09 handoff after commit.
- `cargo check --offline`: exit 0.
- `cargo test --offline --locked -- --test-threads=1`: 13 tests, **13 pass, 0 fail**, plus 0 doctests; child-process test spawns same test executable twice, its own 1/1 pass in each OS process.
- `cargo build --offline --locked --release`: exit 0, genuine optimized Windows Rust `.rlib`, NOT a deployable Tauri/Windows app.
- `cargo tree --offline --locked`: exit 0.
- `cargo fmt` and `cargo clippy`: NOT RUN / COMPONENTS MISSING. Toolchain returns cargo-fmt.exe and cargo-clippy.exe not installed; do not mislabel as PASS.
- Rust source remains within packages/credential-custody/** only; no source files elsewhere.

## Nonproduction Windows WinCred / DPAPI test ledger
| ID | Actual scenario | Result |
| --- | --- | --- |
| T01 | Normal constructor permanently SEALED, all store/inspect/lease/rotate/revoke/expire denied | PASS |
| T02 | Real OS WinCred + current-user DPAPI fake material storage; inspect; new Vault; ciphertext != fake material; optional-entropy mismatch rejected | PASS |
| T03 | Different synthetic account, channel, tenant are not interchangeable | PASS |
| T04 | Stale sessionRevision, bindingRevision, accountRevocationEpoch and credentialRevision fail | PASS |
| T05 | Rotate fake material increments revision; old revision cannot lease | PASS |
| T06 | Revoked tombstone survives new Vault instance; old fake material inaccessible; no re-store | PASS |
| T07 | Expiry denies lease at threshold; explicit expiry tombstone scrubs record secret | PASS |
| T08 | Non-fake input, oversized secret, invalid expiry fail closed | PASS |
| T09 | Corrupted DPAPI ciphertext rejected | PASS |
| T10 | Opaque credential target hides account/channel; entropy tampering rejected | PASS |
| T11 | Old revision cannot rotate or revoke | PASS |
| T12 | Isolated subprocess helper executed in tests with valid/revoked test namespace | PASS |
| T13 | **Two new Windows OS processes** (child tester) verify protected fake recovery then revoked denial | PASS |

Only synthetic disposable test materials used. Each test creates a unique opaque target and deletes **only its own** WinCred credential entry; no WinCred enumeration/legacy V1 reads or any social provider connection. No HTTP, OAuth, Signal, TDLib login, QR, OTP, token extraction, message send, user contact, model call or production deployment performed.

## Dependency/SBOM audit (Cargo.lock source local cache, not final independent SEC signoff)
- Direct pinned versions: windows-sys 0.61.2 (MIT OR Apache-2.0), sha2 0.10.9 (MIT OR Apache-2.0), serde 1.0.229 (MIT OR Apache-2.0), serde_json 1.0.151 (MIT OR Apache-2.0), base64 0.22.1 (MIT OR Apache-2.0), zeroize 1.9.1 (Apache-2.0 OR MIT).
- Cargo.lock total **26 packages including this crate**, transitive: block-buffer 0.10.4, cfg-if 1.0.5, cpufeatures 0.2.17, crypto-common 0.1.7, digest 0.10.7, generic-array 0.14.7, itoa 1.0.18, libc 0.2.190, memchr 2.8.3, proc-macro2 1.0.107, quote 1.0.47, serde_core 1.0.229, serde_derive 1.0.229, syn 3.0.6, typenum 1.20.1, unicode-ident 1.0.26, version_check 0.9.5, windows-link 0.2.1, zmij 1.0.23.
- Checked local registry Cargo.toml license metadata for all fetched upstream crates: `generic-array` MIT; `memchr` Unlicense OR MIT; `unicode-ident` (MIT OR Apache-2.0) AND Unicode-3.0; `version_check` MIT/Apache-2.0; `zmij` MIT; others predominantly MIT OR Apache-2.0. License metadata present is not same as an independent compliance or CVE audit. Full upstream license and transitive policy review remains HOLD.

## Unresolved safety blockers — DO NOT mark production READY
1. W54's OS principal/IPC/sessionRevision and trusted native worker gate not integrated. There is deliberately **no production unseal method**. Same-Windows-SID untrusted process is not excluded by raw OS WinCred/DPAPI alone; future W54 must provide process-specific authenticated IPC and prevent arbitrary same-user clients.
2. W24/W44 canonical full K, live bindingRevision/Consent/Grant/accountRevocationEpoch and mutation fence not wired. No real account/Peer or provider facts. Any real provider operation = DENIED/HOLD.
3. W25 sole outbound ADMISSION/PRE_NETWORK and late ACK/UNKNOWN not integrated.
4. Windows **second actual OS SID**, full machine reboot, simultaneous independent worker rotate/revoke CAS, file snapshots/backup restoration, app logout/OS lock, security scans and independent source review NOT TESTED. WinCred by itself has no compare-and-swap semantics. Current in-memory Mutex only serializes within one process; cannot claim cross-process atomic rotation/revoke. Any issued test lease is a memory snapshot, not instantly invalidatable after revoke; no native worker lease issuance is permitted in production.
5. No large Signal/TDLib protected session file or reviewed AEAD/AAD/NTFS ACL/atomic recovery implementation. Max 512-byte fake plaintext; under W55 scope this is deliberate rather than pretending large session custody completed.
6. `rustfmt` and `clippy` missing. Formal maintainer/GitHub ACL, independent SEC/LEGAL/provider terms review and source-grade SBOM signoff pending.
7. OS credential deletion is tested only for disposable fixture targets; secure erasure from Windows backups/forensic snapshots NOT PROVEN. W44 permanent durable revocation is required before real use.

Final: **W55_WINDOWS_FAKE_WIN_CRED_DPAPI_TEST_PASS / W55_NATIVE_PRODUCTION_CREDENTIAL_AUTHORITY_HOLD / NO_PROVIDER / NO_SEND**.
