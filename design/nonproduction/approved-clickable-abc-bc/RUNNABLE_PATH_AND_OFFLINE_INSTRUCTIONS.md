# W39 corrected four-arm offline prototype — current security-red test candidate
Isolated root:
`C:\Users\1\Documents\YanceV2\YANCE_V2_GREENFIELD_P3_0_20261024\design\nonproduction\approved-clickable-abc-bc`
Current branch `p3-1/clickable-abc-bc`, actual full HEAD `git rev-parse HEAD`. Local nonproduction only, strictly no external API keys or providers.
From the root on Windows with original approved packages installed:
```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run preview -- --port 4186 --strictPort
```
Preview on `127.0.0.1:4186`, not `0.0.0.0` or public network. If port4186 occupied by W39's own prior preview, stop only that known child before starting. A/B/C/BC query URLs:
`/?arm=CHAT-A-V25_VISUAL_NORMALIZED`; `/?arm=CHAT-B-ADAPTIVE_INBOX`; `/?arm=CHAT-C-PULSE_MAIN`; `/?arm=CHAT-BC-FUSION&pulse=1`.
All origin-local compiled JS/CSS, mock fixture-only, all send operations NO_SEND; current preview enforces restrictive HTTP CSP. New device initial npm ci may need npm registry or verified cache; cannot claim fully disconnected install. Do not use `npm audit fix`; Vite7.3.7/esbuild0.28.1 upgrade is HOLD pending W42 signed six extra lock entries, installed original approved version only. Preview is a testing surface, not formal business app or licenced standalone distribution.
W39 Chrome self UAT `?uat=1` runs 44 common tasks plus 7 W37 negatives, test output in `evidence/W39_RED_44_AND_COLLISION_7_RUNTIME.json`. Screenshot+geom `evidence/W39_RED_76_VISUAL_CDP.json`; CSP network `evidence/W39_RED_CSP_NETWORK_CDP.json`. W40/41/42 independent new SHA review remains outstanding; P4 HOLD.
