# 【W39｜P3-1 W40/W41 RED定点修复｜实际Owner回执】
DATE: 2026-10-24 | DEVICE: DESKTOP-029FH47
BRANCH: p3-1/clickable-abc-bc
REJECTED_PARENT: a96b4ded8c74bd66ff175682a0da375e5924dc7d
NEW_CANDIDATE_HEAD: refer to `git rev-parse HEAD` AFTER immutable commit and W39's external SHA handoff. No self-referential invented SHA.
STATE: **W39_FULL_K_DATA_LAYOUT_A11Y_CSP_OWNER_SELF_TEST_PASS / VITE_ESBUILD_SECURITY_RED_HOLD / INDEPENDENT_POSTBUILD_REVIEWS_HOLD**.
REPO: C:\Users\1\Documents\YanceV2\YANCE_V2_GREENFIELD_P3_0_20261024
AUTHORIZED_PATH: design/nonproduction/approved-clickable-abc-bc/ ONLY; main must remain d05f46c83e34e0c2599254a4aac9dc77461f6026.

## Actual narrowly scoped fixes
- Full canonical K = tenant|account|channel|peer_id|binding_revision. Selected identity, active lookup, drafts/quote/MID/state, URL peer resolution, scenario qualification and account/channel filters fail closed for ambiguous or out-of-scope selection. Viewing/switching filters never marks read/takes over/sends. No fallback to another account's prior Composer.
- W37 exact signed derived effective 120 fixture has only peer117.account=fixture-account-2; SHA256 `6198539f936ac636cd24ec812456557e5d9c6509cdf9c6c63856f4f061699af9`. Historical original fixture unchanged SHA `5b9a05df788fe5fab41b6b2033fb895cd3650fb573345856650cfeb24ef9c99c`. Separate 5 contact same-peer-ID collision records are **negative-only**, not merged into default120.
- Bounded viewport/flex contact scrolling and chat Composer; B+C <=1180 drawer visible/close/Escape/focus return, 40px close target; channel filters fully keyboard/pointer-accessible; icon-only accessible names supplied. Source only existing W42-approved OSS components.
- Actual localhost preview security enforced through `vite.config.ts` HTTP CSP Header plus index meta, prohibits third-party connections and inline JS; exact single observed style hash whitelisted, not unsafe-inline scripting. No real Provider/send/Agno/paid API.
## W39 self tests — NOT independent
- Real Chrome common W37 44/44 PASS (4 arms×11), including same-name **different-account** UX01 and actual account filter change; 7/7 isolated full-K collision negatives.
- Chrome exact CSS width×4 plus 5 themes×dark/light×4 = 76/76 visual PASS, all Composer visible, channel filters accessible, B+C drawer present and close target sized; 76 actual after screenshots/hashes in `evidence/red-chrome/`, proof `evidence/W39_RED_76_VISUAL_CDP.json`.
- Chrome CSP injection/Network 4/4 PASS: inline script blocked, crafted HTML inert, external HTTP(S)0, WebSocket0. `evidence/W39_RED_CSP_NETWORK_CDP.json`.
- `npm test` 18/18 owner checks PASS, `tsc --noEmit` PASS and local Vite build PASS. Actual compiled bundle SHA256 in `evidence/W39_RED_FINAL_MANIFEST.json`.
- **Dependency safety not PASS**: W42 formally allows Vite7.3.7 and esbuild0.28.1 exact, but regeneration of lock introduced six unsigned optional WASM nested package rows. W39 stopped before installing new lock, reverted `package.json`+`package-lock.json` to approved preexisting 14 direct pins. Current actual Vite7.3.1/esbuild0.27.7, full npm audit HIGH1 LOW1, runtime omit=dev0, all still security HOLD. See `W39_TO_W42_SIX_UNEXPECTED_LOCK_ROWS_HOLD.md` + `evidence/W39_W42_NPM_LOCK_EXACT_DELTA.json`. W42 additional six-row signed permission required before upgrade; do NOT silently imply security risk cleared.
- Independent W40 QA and W41 SEC and W42 POSTBUILD on NEW candidate: **NOT_RUN**. W42 historical a96b4d source/notice approval cannot be inherited. Standalone dist distribution, company LEGAL, Windows WebView2/DPI/real IME and P4 all HOLD.
