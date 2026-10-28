# W47 Per-install local API runtime contract (nonproduction source)
Owner: W47, `services/api/runtime/**`. This replaces developer hardcoded 47182/4399 *for installed mode only*.

## Supported runtime modes

- `development` (default): no environment required; API binds `127.0.0.1:47182`, accepted frontend Origin `http://127.0.0.1:4399`, reads Git HEAD for developer diagnostics; original Web stage unaffected.
- `installed`: native installer/launcher **must** supply `YANCE_W47_RUNTIME_MODE=installed`, `YANCE_W47_API_PORT=0` (OS-allocated independent loopback port; explicit positive port also permitted), and `YANCE_W47_WEB_ORIGIN=http://127.0.0.1:<separately allocated frontend port>`. The API listens on `127.0.0.1` only and emits a single machine-readable `V2_API_READY` JSON line with its bound API URL. Launcher is responsible for reading it and configuring the frontend proxy; W47 does not hardcode the installation URL into the package. Origin value is a permitted browser surface, **not** an identity or bearer authorization grant.
- Installed mode also requires the packaging job to stamp a local `runtime-build.json` **beside `server.mjs`** with `{"format":1,"product":"YanceV2","source_sha":"<actual 40-character lowercase released Git HEAD>"}`. Without the manifest or a valid value, installed API startup fails closed. **This is a diagnostic provenance value, not code-signature verification**. W09/W54 installer ownership and signed artifact-to-source hash validation remain outstanding; do not supply a fabricated SHA or ship the synthetic test fixture.
- All endpoints still return `trustedSession:false`, `canSend:false`, `externalEffects:false`, and no connected platform/account/peer. No Yance login/account creation, token issuance, credential vault access, message sends or model spends are added.

## Test evidence and limits

`node --test services/api/runtime/{server.test.mjs,runtime-config.test.mjs,portable-instance.test.mjs}` uses the original live dev API for the inherited five tests, plus an actual two-child-process packaged-code test in separately generated temporary directories. It tests distinct OS-assigned ports, reported port consistency, wrong Host/Origin 403, fabricated W24/W44 fields 401, send/agent effects 403, no-provider contacts empty, and no installed manifest startup error. The temporary installed manifest contains the actual checkout SHA and is **not a production signed manifest**.

This source does **not** implement the native launcher, persistent per-Windows-user data directory, W55 credential isolation, Tauri command permission, Web frontend dynamically configured port, OS installer, signed release, or verification on two real Windows user profiles. W54/W55/W09 own these areas. It is not evidence that independently installed releases already work.

## Security invariants

- No `0.0.0.0` listener, arbitrary hostname, wildcard CORS or silently widened Origin allowlist.
- Host/Origin and loopback are only CSRF and remote-access mitigations, never platform authorization.
- Every mutating W24/W44/Provider route remains denied by default; `GET /api/v2/contacts` remains an actual empty result until an authorized Provider owner supplies verifiable data.
- Independent running instances under different Windows users require filesystem and secret separation from W54/W55; having two loopback processes under one Windows user is not proof of this.
- Never overwrite existing 47182/4399, W09 44751 staging, main, production credentials, or old V1 data.

## Handoff owner dependencies

W54: choose a per-user frontend origin/port and launch API in installed mode, parse readiness JSON, connect same-origin proxy, resolve per-user OS directories and native install lifecycle without hardcoded developer paths. W09: stamp and verify the source-build manifest after freezing the exact combined release HEAD; run installer-level two-user UAT and regression, maintain rollback. W55: demonstrate real separate-Windows-user WinCred/DPAPI credential confidentiality before any non-test unsealing. W47: code scope remains these runtime files; no second auth/session/sender.
