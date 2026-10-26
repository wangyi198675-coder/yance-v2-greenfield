# W55 Security Delta — personal/local-first scope, 2026-10-26

The original 13 synthetic Windows tests are retained; no platform credentials were used.

## Implemented after bfc4d43
- All per-target fake-data operations now take one **Local Windows named mutex** as well as their in-process mutex. It prevents two independent test processes that race with the same expected credential revision from *both* committing the same revision. Windows WAIT_ABANDONED/error/timeout fails CLOSED (not a durable IPC/authentication service). No W54/W47 or providers touched.
- Added a synthetic two-subprocess rotate/revoke barrier and verified a single winner and stale/revoked outcome, with no credential resurrection.
- Added child's sanitized panic/exception stdout/stderr negative test. This does not prove memory dumps, OS event logs, third-party telemetry or debugger snapshots are scrubbed.
- Installed rustfmt/clippy toolchain components locally, no new project-level dev dependency or login service.

## Actual tests, not inferred
- `cargo test --offline --locked -- --test-threads=1`: **17/17 PASS** (13 original + 4 new tests).
- `security_delta::t18_two_os_processes_compete_for_rotate_and_revoke`: repeated independently five additional times, **5/5 PASS**.
- `cargo fmt -- --check`: EXIT 0.
- `cargo clippy --offline --locked --all-targets -- -D warnings`: EXIT 0.
- `cargo build --offline --locked --release`: EXIT 0.
- All tests use `fake-*` identities and invented fake bytes. No old V1, real Facebook, WhatsApp, Telegram, Meta Page, Signal/TDLib session or real send.

## Personal single-user model: scope after W09 directive
- The application is local-first and normally has **one local owner**, not a tenant-facing SaaS security center. `tenant` and `channel/account` fields are internal namespace separation for multiple *social* accounts; they do not require a new customer-tenant system.
- Do NOT build an enterprise identity service, Windows SID/LUID challenge pipes, or separate identity DB as a prerequisite for ordinary local read-only UI.
- W54 already has Tauri `session_status`/`logout_session` native commands and permission controls; W47 can use a *minimal authorized local session + CSRF enforcement* under its original source ownership, with no second login platform.
- Existing W55 default constructor remains permanently SEALED; test-only `fake_test` constructor is not built into ordinary release. This prototype is **not** approved to store or issue real provider secrets.
- W24/W44 remain authoritative on social ChannelAccount/Peer, Consent, Grant, custody, budget, versions and revocation; W25 remains the only message sender. Neither local machine login nor native-session flags prove ownership of a Facebook/WhatsApp/Telegram account.

## Honest limitations/HOLD
- A truly different Windows SID test was **NOT_RUN**. Existing remote shell is a non-elevated Windows user; no approved second W55 test-user was available. Do not switch into another person's Windows profile or invent a PASS. Per-user OS protection is exercised only for the current SID, not independently verified between two SIDs. Under the new single-user architecture this should be a separate optional assurance gate, not a universal read-only product blocker.
- The kernel mutex only serializes cooperating fake workers in one Windows interactive session. It does not establish durable W44 revision authority, defend against same-SID malicious processes, protect after process crash across an in-flight mutation, or stop use of already copied bytes by a worker. This cannot substitute for W24/W44 server-side rechecks or W25 PRE_NETWORK authorization.
- The tests check generated exception outputs, not actual Windows crash dump/ETW content. A full app exit/restart and credential rehydration under W54 are not integrated; old separate-process fake test T13 passes, but a full Windows reboot was NOT_RUN.
- Only tiny <=512-byte fake material is handled. Real Signal/TDLib encrypted file design and external security review are **HOLD**; do not silently extend this library to oversized data.
- Nonproduction local branch commit does not confer external repository maintainership, independent SEC/LEGAL approval, production credential release or platform account consent.
