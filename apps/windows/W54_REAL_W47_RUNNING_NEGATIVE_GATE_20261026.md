# W54 Original Owner | Real W47 process / current Windows native host negative gate | 2026-10-26

**RESULT: REAL_W47_PROCESS_NEGATIVE_PASS / W54_NATIVE_LAUNCHER_REAL_W47_FAIL_CLOSED_PASS / INSTALLED_AUTO_SESSION_HOLD / NO_DEPLOY / NO_SEND.**

Scope: W54 original owner apps/windows/**, preserving existing Tauri, NativeProfileAuthority, Windows AppData, stable installation identity, SHA-pinned child protocol and 32 old Rust checks. No edits to W47 or W43/W55/W46. Parent W54 b34dc8e37d12e066a8cbad42f751757cd1f1cf1b. W09 integrated source c5a66198562224d00f9408556bb00de8c703bde8 stays read-only.

## Real actual W47 process facts, not mock Node

- QA test test-real-w47-process.mjs launches ACTUAL c5a combined-checkout services/api/runtime/server.mjs with actual local Windows node.exe, **one dynamically reserved separate loopback port**; no original 44751/47182/44760/48185 listener touched.
- W47 real source server.mjs SHA256 b7b4bd3eb418d21216f74aef7b7435c6db8bd6d89433e32d33bc3375e740ecb4 on this source. The actual W47 source is NOT packaged into W54. The test uses development mode only.
- Running W47 actual API /runtime/health returns HTTP200, trustedSession:false and canSend:false. POST /api/v2/local-session/first-party exact approved origin and {} body **returns HTTP503** before and after test-only W54-framed stdin payload; no CHILD_READY native response, no browser Session and no paid/provider effect. This is correct DEFAULT DENY, not a positive first-party pass. Child is killed and reaped at test end.
- Separate W54 Rust native launcher test real_w47_server_must_reject_until_native_receiver_is_wired runs ACTUAL W47 server.mjs under Windows node.exe launched by original NativeChildLaunch secure pin+private pipe code. Test has explicit opt-in W54_QA_REAL_W47_RUNTIME_DIR; uses an isolated random loopback port and exact Node binary digest. The original W47 server.mjs DOES NOT read W54 stdin bootstrap, so W54 properly rejects/terminates the actual child with NATIVE_CHILD_PIPE_WRITE_FAILED / NATIVE_CHILD_ACK_INVALID / timeout. This is an actual Rust→real W47 PROCESS NEGATIVE test, **NOT proof normal Tauri packaged host successfully created a trusted auto-session**.
- Real Windows W54 compiled Tauri lab EXE also started and exited independently, with current-user native persistent revocation generation 13→14 at boot, then 14→15 at exit. EXE remains separate from W47; no combined installed-parent/child binary or WebView2 Cookie linkage exists.
- W47 installed mode correctly requires an authoritative runtime-build.json stamped by officially approved packaging. Current checkout lacks that file and refuses to boot W47_INSTALLED_BUILD_MANIFEST_REQUIRED. W54 did NOT forge or write it to W47 source. Developer-mode QA is therefore NOT INSTALLATION UAT.

## Precise W47 original Owner blocking API seam

Actual W47 has services/api/runtime/w54-native-child-frame.mjs strict parser and TEST-ONLY W54 parent verifier injection, but **server.mjs does not import/consume the frame**, and createLocalSessionAuthority({approveNativeLaunch}) is called without a verified callback. It must remain so until W47's production signed native parent validation.

W47 must implement/approve, solely in services/api/runtime/**:
1. A real W54 direct child startup-only protected inherited stdio reader using the already implemented W54_W47_NATIVE_CHILD_V1 framing and exact challenge ACK. No copied JS/HTTP arbitrary source proof; real W54 packaged binary/code/provenance must be verified, not simply echoing a challenge.
2. Binding to one signed W54 app installation/current Windows user and continually checking both NativeProfileAuthority.revocation_generation and W47 Session/Cookie revision. Native close, logout, crash, process death, wrong Windows user and binary replacement must immediately invalidate privileged first-party sessions.
3. W47-issued HttpOnly SameSite Cookie must be installed in the verified **Tauri WebView2** context only, with an OS-bound browser-instance mechanism. Arbitrary Chrome/localhost cannot copy or issue it; origin alone is not authentication.
4. Signed release must package a pinned W47 program + dependency tree, actual trusted Node runtime/binary and stamped runtime-build.json, while preserving exact source SHA. An executable hash alone is NOT enough when runnable JavaScript dependencies are mutable. W09+SEC should audit package/OS child process identity, AppData isolation, shell/link attacks and cleanup.
5. Native startup authorization must never imply user-paid model purchase, secret read or W24/W44/W25 platform sending. W55 and W43 maintain separate real account/key lease and cost consent. Without this source/SEC binding first-party 503, no fake 200.

## Actual commands and gates

- `cargo test --offline --locked`: **32 PASS, 1 intentionally ignored real-source opt-in test**.
- With explicit W54_QA_REAL_W47_RUNTIME_DIR pointing to the exact read-only W09 source: `cargo test --offline --locked real_w47_server_must_reject_until_native_receiver_is_wired -- --ignored --nocapture`: **1 PASS, 0 FAIL**. This validates genuine child rejection only.
- `node --test test-nonauth.mjs test-portable-build.cjs`: **8/8 PASS**.
- `node test-real-w47-process.mjs`: one actual independent W47 child/API test **EXIT0**, checks health 200 and first-party 503 before/after native-fake-stdin; no positive identity.
- `cargo build --offline --locked`, `cargo fmt --all -- --check`, `git diff --check`: PASS.
- No signed installer/no second actual Windows user/no independent SEC sign/no user-owned cloud secret/no model charges/no social real send/no new 44751 deployment.

Conclusion: W54 existing native components are preserved; a real current W47 process still lacks the authenticated native child receive and WebView2 session link. A test-only echoed challenge, current OS SID, AppData filename or HTTP Origin must NOT be used as a workaround. Source test result cannot be called USER_DELIVERED.
