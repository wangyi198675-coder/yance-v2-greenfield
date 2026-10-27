# W47 / Issue #61 | Single W47 signed web+API origin, only original runtime

2026-10-26. W47 original owner base **9af59df724eb6af7781b03a00c77e229a6457bd9**, W09 integrated 894c25643cdde8af2307c8d8396dad96c39471eb; owner scope only `services/api/runtime/**`.

## Actual resolved SOURCE defect
W54 current official Tauri localhost plugin 2.4.0 serves ONLY static assets. It CANNOT route `/api/v2` and its header-only hook returns HTML fallback on unrecognized API. This is why actual installed B+C has `Unexpected token '<'` rather than JSON, even after real WebView2 4/4 navigation and the `LOOPBACK_ONLY` fix.

Rather than add an unsafe second API proxy, **existing W47 `server.mjs` may optionally serve approved W09/W46 Vite-built B+C bytes under the SAME HTTP origin and exact port as its existing V2 API**. Native Vue still only uses relative `/api/v2`; same origin means true JSON API. Code is optional and installed-only; development 47182, 44751 and all unrelated modes are unchanged.

### W09/W54 packager exact config
After W54 verifies original official signed W47 executable and app installation, W09/W54 must prepare a Vite built dist with `index.html`, `version.json` (`source_sha` exact W09 chosen Web40, `canSend:false`, `trustedSession:false`) and hashed `assets/index-*.js` and `*.css`. W54 signs a deterministic JSON:
`{"format":1,"product":"YanceV2NativeWeb","sourceSha":"<exact signed W09 Web HEAD>","files":[{"path":"index.html","sha256":"<64hex>","bytes":123},...,{"path":"assets/index-HASH.js","sha256":"...","bytes":...}]}`.
Manifest bytes SHA256 `<64hex>` is pinned to approved original W54 package (NOT merely untrusted environment). W47 runtime requires the launcher supplies exact:
- `YANCE_W47_RUNTIME_MODE=installed`
- `YANCE_W47_API_PORT=<assigned real nonzero localhost port>`
- `YANCE_W47_WEB_ORIGIN=http://127.0.0.1:<same port>`
- `YANCE_W47_NATIVE_WEB_ROOT=<absolute installed signed dist folder>`
- `YANCE_W47_NATIVE_WEB_MANIFEST=<absolute signed manifest path>`
- `YANCE_W47_NATIVE_WEB_MANIFEST_SHA256=<original signed packager hash>`
- `YANCE_W47_NATIVE_WEB_SOURCE_SHA=<exact approved Web release SHA40>`
W47 rejects noninstalled, mismatching origin port, missing fields, unpinned/modified files, wrong sourceSHA, disallowed directories/symlinks, bundle oversized and wrong asset format BEFORE binding any port. Only exact `GET /?productDraft=1`, `/index.html`, `/version.json` and SHA-listed `/assets/<allowed-hashed-name>.(js|css|...)` are served. Other paths JSON404/401; missing `/api/v2` never becomes fallback `index.html`. No generic filesystem or per-browser path selection. Asset bytes immutable in memory after full SHA256 boot verification, never `Set-Cookie` for assets. CSP remains W46 built CSP; W47 exact Host, Origin, CSRF and cross-site checks are still in front of these resources.

**Important security distinction:** the hash list verifies built bytes, it is not native code-signing or a W54 OS-user Principal. Self-starting untrusted localhost cannot obtain native Session, W55 Key or provider consent. Genuine user-level trust STILL requires original W54 signed Windows parent executable, installation/SID/epoch/lifecycle attestation, single renderer bound native WebView2 Cookie and logout/restart revoke. This change does not implement or bypass those requirements. Nonzero API port choice must be native-owner coordinated (bind collision fails closed); arbitrary Chrome on that port may read static assets/unauthorized diagnostics, but not a user Session. Avoid `portpicker` race in final signed installer by W54 native process/bound socket or proven exclusive port acquisition.

### REAL staged proof
Run `YANCE_W47_TEST_REAL_WEB_DIST=<W09 exact compiled Vite dist> YANCE_W47_TEST_REAL_W26_PORT=29321 YANCE_W47_TEST_CHROME_EXE=<real Chrome.exe> node --test services/api/runtime/native-web-actual-windows.test.mjs`.
This creates **isolated** Node child process with pinned actual W09 B+C Vue build, true same-origin API and W26 original live upstream. Must check exact POST401/GET401, arbitrary API 404 JSON rather than HTML, GET HTML+actual JS+CSS 200, Chrome Vue DOM built and no unapproved sends, and automatically clean temp child/browser. No W54 installed Session is produced by this specific cross HTTP/browser test.
Run `node --test services/api/runtime/native-pinned-web-assets.test.mjs` for corrupted manifest, bad SHA, wrong origin, symlink/extra file security negatives. Run full original W47 Node+Python 60 pass suite postcommit.

### W54/W09 next real owner integration step
Use **existing** W54 real Tauri Builder and **one exact WebView2 address `http://127.0.0.1:<the W47 attested child bound port>/?productDraft=1`**, not the static-only Tauri localhost plugin address, for B+C candidate after original signed child is alive and W47 API_READY+child SHA verified. W54 must not mark host authenticated until OS-attested private pipe and live WebView2 cookie are delivered; the originally existing `w54-native-child-frame.mjs` is parser/ACK only, and `w54-native-webview-session.mjs` requires original real Native Parent OS verifier & renderer cookie sender. Such original W54 OS verifier, signed w47-native.exe bundle, and production cloud W55 lease are separate outstanding owners, NOT work to be replaced with fake W47 JS parent callback.
Keep W25 as sole send and W43 as sole Agno+original SQLite/History. No 44751 deployment, no billed Cloud API, no social login or external send.

## Actual INSTALLED Windows WebView2 → W47 ONE-ORIGIN positive on DESKTOP-029FH47
- In ISOLATED QA-copy only, built official Tauri2+NSIS candidate with distinct app ID `com.yance.v2.w47-api-one-origin-qa` and version0.1.3; build succeeded; actual separate NSIS install EXIT0. Exact QA installer SHA256 `ea4012a6b12c945775e82ec722fff8505598e9aad5c886c22be2f2a3a3b32295`; installed QA EXE `...\\W54_W47_ISOLATED_GUI_QA_20261026\\Installed-OneOrigin\\yance-v2-native-session-lab.exe`.
- QA-only Rust `YANCE_W54_QA_W47_ORIGIN` selects exact loopback W47 server URL; **NO Tauri IPC capability is granted to this external origin**. The optional QA env bridge is NOT a W54 official production feature, not installed OS host attestation, and not a session grant.
- Actual WebView2 PID21440 loaded `http://127.0.0.1:56114/?productDraft=1` supplied by real W47 Node PID38312 at the very same port. In native WebView2 CDP, W46 Vue DOM rootChildren>=1 and product present, real `fetch('/api/v2/runtime/health')` returned JSON 200 exact then-existing W47 source SHA `0f539b1058dc6027528d5cfa6cade51d3c5d4572`, not static HTML, `nativeWebSameOrigin:true`, `trustedSession:false`, `canSend:false`, four real workspace clicks (ACCOUNTS/BRAIN/SETTINGS/CHAT) **4/4 PASS**. W26 real SDK diagnostic remains WAITING_USER_AUTH.
- Actual screenshot `C:\\Users\\1\\Documents\\YanceV2\\W54_W47_ISOLATED_GUI_QA_20261026\\w54_webview2_actual_w47_one_origin.png`, generated directly from installed WebView2 DevTools Protocol. No user Cloud Key, billable model, social login/send or 44751 overwrite. These steps are implemented in new test-only `native-webview-cdp-qa.mjs` and `native-web-actual-windows.test.mjs`.
- Exact postcommit W47 full test rerun must be repeated after adding new CDP QA helper to commit. W54 original Owner still must wire genuine signed child SHA, OS process attestation and protected WebView2 Cookie. Real installed W47 PRIVATE Agno answer remains HOLD until this is done.
