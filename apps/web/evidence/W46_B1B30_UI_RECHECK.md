# W46 | W09 b1b30 W43 unified reception | REAL original B+C UI recheck | 2026-10-25

**W09 W43 aggregate:** `b1b30e839a33b3bab20b805d7babcdb359086831`. This commit changes the W09 integration's **services/agentos/** and its handoff document; it DOES NOT merge W46 PR#21 `dc93ced824c808fb0d8f2b032d99535fc6b1d905` or W45 latest PR#16 `ab059fc29584bcfee60dd793758beef2b2a3c643`. W46 remains on its original B+C Owner branch and consumes W43 only THROUGH independently attested W45 DTOs (no direct model/Agno new adapter).

**Actual native source tested:** W24 PR#17 `e10f9e17988fa19c4dc71ce927e5d9eaa01dbdc9` GET+POST+CAS; W44 native custody SQLite imported read-only from the **W09 b1b30 worktree**; W45 PR#16 `ab059fc29584bcfee60dd793758beef2b2a3c643` existing getMessage/draftCandidate; original B+C base `34467cf10c0e9457c2a22dee5a37d1e05dd2ed8b`. The W43 unified native Agno in W09 b1b30 was NOT called in this task; no PAUSED SDK Run was produced by W46. No signed authenticated production principal or W25 sender was available.

## Actual real Windows Chrome user interactions

Reused original B+C App.vue with **one** CONTACT Composer via W46 build-only Vite source-transform; original design source and original CSP unchanged. CSS verified loaded in compiled static preview.

- **Positive scenario:** Chrome 1360px opened contact A and focused without takeover POST; typed user text => one real W24 HTTP POST with existing 4-field GET snapshot, fresh GET re-read same K HUMAN and epoch 1; contacts B and C verified still AUTO in W44 SQLite. Browser contact B switch did not POST.
- **Real native 409:** Chrome opened fake-peer-002, focused with 0 POST, typed x. A one-shot W46 **test-only upstream request-fence** changed expectedEpoch and submitted to *unchanged W24 original HTTP Handler*. Owner returned real HTTP 409, rendered `BLOCKED / NATIVE_HTTP_409`; authoritative GET stayed AUTO epoch 0, no sending.
- **Real native 422:** Chrome fake-peer-003 similarly typed x; one-shot W46 synthetic request modification removed expectedConsentEpoch before forwarding to unchanged W24 HTTP Handler. Owner returned real HTTP 422, rendered `BLOCKED / NATIVE_HTTP_422`; native mode stayed AUTO epoch 0, no sending.
- **PENDING-shaped gateway fixture:** Chrome fake-peer-004 typed x and received synthetic HTTP 202 `{accepted:false,status:'AGNO_RUN_PAUSED_REQUIRES_APPROVAL'}`. Composer rendered `BLOCKED / TAKEOVER_POST_NOT_CONFIRMED`, stayed AUTO epoch 0, no sending. **This 202 is an explicitly synthetic nonproduction gateway response, NOT a W43 Agno SDK PAUSED/approval Run.** Real W43 PAUSED source is W09's separate Owner evidence and pending formal end-to-end broker integration.
- Full original page 9 widths 360/430/720/920/950/1050/1100/1101/1360, 5 approved theme menu clicks in light/dark, real computed CSS, no JS errors. All source messages original MID and unique sole Composer; no forged 0→3 candidates. Fresh W45 model Run quality and production translation remain unreviewed and not attempted.

**Repro/evidence:** `apps/web/tests/w46-browser-negatives.cjs`; `w46-browser-uat.cjs`; `w46-local-integration-server.mjs` (isolated fake K, loopback only, no actual provider). `apps/web/evidence/W46_BC_REAL_BROWSER_NEGATIVE_UAT.json`; three `W46_BC_REAL_CHROME_NEGATIVE_*.png` and eight previous genuine B+C Chrome positive/style/theme PNGs; `W46_BC_REAL_BROWSER_UAT.json`.

**Regression:** `node --test apps/web/tests/*.test.mjs` **43 PASS / 0 FAIL / 0 SKIP** with specified W24/W44/W45 Owner paths; selected B+C baseline `npm test` **15 PASS / 0 FAIL**; Vue SFC compile PASS. Hosted exact-SHA GitHub Actions and independently signed owner reviews are separate, NOT implied.

## Explicit remaining HOLD and next Owner

P0: W09/Owner final unified W43 source security/signature; W45 cross-process trusted signed Run and expiry, actual model output/approval gateway into W46; real app/IPC principal authentication, Consent/epoch+CSRF; W44/W25 full irrevocable boundary, multi-worker send and UNKNOWN reconciliation. P1: Windows **WebView2** installed UAT, independent multilingual reply quality (en structure, de echo, pl grammar), load and realistic long-dialogue tests. W46 cannot declare source provenance quality PASS or send without these. PR #21 DRAFT, no prod deployment, no private accounts, no paid calls, no human sends. Temporary test-only HTTP listeners must be stopped.

**Scope:** all new changes restricted to `apps/web/**`; W09 b1b30 and every other Owner tree remained untouched.
