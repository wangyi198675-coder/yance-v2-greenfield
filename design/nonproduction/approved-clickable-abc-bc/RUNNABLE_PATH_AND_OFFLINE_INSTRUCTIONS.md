# W39 | Offline runnable four arms — actual tested local paths
STATUS: BUILT_AND_OPENED_IN_LOCAL_CHROME / STRICT NONPRODUCTION
ROOT: `C:\Users\1\Documents\YanceV2\YANCE_V2_GREENFIELD_P3_0_20261024\design\nonproduction\approved-clickable-abc-bc`
BRANCH: `p3-1/clickable-abc-bc`. DO NOT merge main / deploy.
REQUIREMENTS: Windows Node 24.18.0 + npm, 14 W42-approved direct package versions; no production accounts, API configuration or online providers. `node_modules` intentionally not tracked; `dist` already exists in candidate commit.

For same-device isolated preview, from PowerShell in ROOT:
```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run preview -- --strictPort
```
Once npm dependencies have been installed locally, preview does not need external providers. First `npm ci` may require registry or verified local cache; do not claim disconnected first-time installation. Preview listens on **127.0.0.1:4174**, not all interfaces. Developer HMR: `npm run dev -- --strictPort` listens on **127.0.0.1:4173**.

Four real, separately addressable tested URLs on the Windows machine:
- **A** http://127.0.0.1:4174/?arm=CHAT-A-V25_VISUAL_NORMALIZED
- **B** http://127.0.0.1:4174/?arm=CHAT-B-ADAPTIVE_INBOX
- **C** http://127.0.0.1:4174/?arm=CHAT-C-PULSE_MAIN
- **B+C** http://127.0.0.1:4174/?arm=CHAT-BC-FUSION&pulse=1

All four also switch inside topbar. If preview is not running, the URL is unavailable until the above local launch; URLs are localhost-only, not remotely routable, not production deploy. Synthetic-only contacts; clicking "本地模拟 / 不发送" never reaches providers. The `?uat=1` query runs W39 Chrome DOM selftests; do not use as normal UX default. Check `W39_REAL_BUILD_LOG.txt`, `evidence/CHROME_SCREENSHOT_MATRIX.json`, `RUNTIME_44_TASK_EXECUTION_ROWS.csv`. Never set REAL_SOCIAL/REAL_AGNO/PAID_AI credentials.

No actual third-party outbound from UI is required (Vue assets and fixture JSON are locally bundled). W39 import/license validation scripts use frozen public GitHub/npm sources only when intentionally rerun; runtime has no real provider channel. Windows Tauri/WebView2 NOT_RUN.
