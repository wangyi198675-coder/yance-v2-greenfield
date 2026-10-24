# W39 | Four actual clickable arms — frozen repeatable build
STATUS: **BUILT_AND_OPENED / 2-CONSECUTIVE_BYTE_IDENTICAL_BUILD_PASS / W39_CHROME_44PASS / INDEPENDENT_W40_W41_W42_HOLD**
BRANCH: `p3-1/clickable-abc-bc`. Commit HEAD is `git rev-parse HEAD` after final candidate commit; preimport signing SHA `f0b008875a15340a39325549dba3a9c099442405` is not built candidate SHA.

Four actual layouts:
- `CHAT-A-V25_VISUAL_NORMALIZED` — V2.5-inspired standardized legacy layout, original V2.5 HTML read-only.
- `CHAT-B-ADAPTIVE_INBOX` — adaptive account/channel inbox + public composer.
- `CHAT-C-PULSE_MAIN` — full-screen exception-first Pulse, drill-down to normal contact chat.
- `CHAT-BC-FUSION` — B public inbox with independent C Autopilot, no duplicate outgoing path.
All use frozen W37 fixture+overlay+sidecar, same 120 K/MID, 44 tasks and Reset. PRIVATE Agno has separate mock run/trace and never alters CONTACT messages.

**Actually built with `npm run build`, Vite 7.3.1, 2651 modules.** Tailwind `source(none)` + explicitly approved local SFC sources prevents scanning generated docs/evidence; two subsequent production builds produced **identical SHA256 bytes for all four dist outputs**, recorded in `evidence/W39_REBUILD_STABILITY_RECEIPT.json`.
- `dist/index.html` SHA256 `fd6e54daeb2d052f214bb30ba5739b99c98b7b1194531eab8f502fd5f7825712`
- `dist/assets/index-BRZRaF4q.js` SHA256 `baa2deddae0eb876065c50cfc20a2bcc21b0bcc2821a022274a0fdc1e732a3ed`
- `dist/assets/index-BQPsiH08.css` SHA256 `816e3872e4d3add6452145a05437eba29b52e9f175dae2fb764fe5f293bc33cb`
- `dist/assets/browser-tests-BLHtoASZ.js` SHA256 `397d273dcb6d9fdbb60cdde329af325106e8485697b3751aeb0953cd605d9fc0`.
Full verified inventory: `evidence/W39_BUILD_ARTIFACTS_MANIFEST.json`. Logs: `W39_REAL_BUILD_LOG.txt`, `W39_REPEAT_BUILD_LOG.txt`.

Chrome real owner-run: 44/44 W37 expected task cases PASS across 4 arms, `RUNTIME_44_TASK_EXECUTION_ROWS.csv` and `evidence/W39_CHROME_UAT_FINAL_44PASS.json`. Frozen fixture SHA exact. Additional 14/14 owner local integration checks PASS, `evidence/W39_SELF_INTEGRATION_CHECKS.json`; TypeScript source-level `tsc --noEmit` PASS (Vue SFC compiled by Vite). 23 PNG screenshots under `evidence/chrome/`: 4 arms, 5 light/dark pairs, 9 Chrome CDP exact CSS viewport widths 360/430/720/920/950/1050/1100/1101/1360 at DPR1, with body overflow/nav viewport checks. Actual DOM + PNG width hashes in `evidence/CHROME_SCREENSHOT_MATRIX.json`.

**Cannot claim:** W40 independent QA, W41 security, W42 real compiled/NOTICE/SBOM postbuild or Windows WebView2, DPI125/150/200, exact historical original A screenshot pixel match, company legal, P4.
