# W34 -> W09 | A/B/C/B+C nonproduction prototype PREP handoff
2026-10-24 | DEVICE DESKTOP-029FH47 | status DESIGN_PREP_PASS / CLICKABLE_BUILD_HOLD

## Baseline and provenance
Repository: C:/Users/1/Documents/YanceV2/YANCE_V2_GREENFIELD_P3_0_20261024
HEAD at W34 read: b20c32daa766c060a323ac225afcf0cd33fbe92a (initially CLEAN).
V2.5 original according to verified provenance: 89033 bytes; SHA256 7365b4bdf4011007b3fb6b6736ad3d47ede9a0604b1d8c24b17074d7c653aceb.
Shared existing fixture: design/fixtures/synthetic_120_contacts.json; SHA256 5b9a05df788fe5fab41b6b2033fb895cd3650fb573345856650cfeb24ef9c99c.
120 synthetic peers; 30/channel, 40/mode, 120 UNKNOWN presence. W34 did not alter fixture source.

## Delivered under design/nonproduction/VIEW34_ABC_BC_PREP_20261024
1. REVIEW_ACK.md — design-owner acknowledgement only; NOT SEC/LEGAL/QA signoff.
2. ABC_BC_CLICKABLE_PROTOTYPE_BUILD_SPEC.md — all four variants, B+C emphasis and screen-state transitions, no production runtime.
3. SCREEN_COMPONENT_SOURCE_MAPPING.csv — 28 component/screen role rows; pin/SHA/SPDX/NOTICE/SBOM/Windows still PENDING_W32.
4. CONTACT_DRAFT_READ_PRESENCE_STATE_RULES.md — K-bound drafts, IME, quote, files, takeovers, read/presence/UNKNOWN guards.
5. FIVE_THEME_RESPONSIVE_UAT_MATRIX.md — 5 unnamed theme slots * light/dark * 9 widths * 4 variants, plus Windows DPI.
6. TO_W09_HANDOFF.md — this file.
Additional, design-only:
7. W34_SCENARIO_OVERLAY_SPEC.json — exact-K mock 0/1/2/3 candidate objects, A/B/C independent modes, synthetic read/grant/UNKNOWN scenarios.
8. W34_UAT_CASES.csv — 680 deterministic NOT_RUN test matrix records (360 viewport + 320 DPI checks).

## Hard source-parity issue requiring W09 + W22 decision BEFORE comparative user study
A is the *unaltered original* V2.5 HTML, still with its baked contacts/always-three synthetic suggestions and known setContact draft reset / unread reset / false online dot. It has NOT been made to consume the common 120-contact fixture. Four-arm result ranking would be invalid if A is measured using different data.
Explicit decision required: approve non-mutating independently evidenced fixture adapter for exact A original, OR label separate W32-OSS-built visually faithful A-normalized comparator, preserving unchanged original as the provenance reference. W34 will not silently replace or patch original. W22's existing independent QA protocol remains authoritative; do not redo old design audit. Report A inability until equal dataset proven.

## Remaining gates (do not infer from W34)
- W32: real precise OSS source/pin+file hash SPDX/LICENSE/NOTICE/SBOM/integrity Windows compatibility and signed owner ACK. Until then every candidate component is SOURCE_PIN_HOLD.
- W33: exact fresh repo safety review and approved app-source scope. This is NOT established by W34.
- W09: receive W32 + W33 + W22 parity determination; authorize isolated nonproduction clickable build in writing with exact SHA and permitted files only. No app code was started in this W34 round.
- Subsequent: run all 11 W22 protocol tasks across identical fixture and scenario, 5 themes x light/dark x listed widths and Windows DPI, capture schema results and screenshots; select final layout ONLY from observed study and gates.

## Protect
No real Agno, real social accounts, actual provider send, persistent contacts, real permissions, production deployment, OSS imports, customized base buttons/bubbles/composer/menu or source rewrites. SELF_PRIVATE Agno and CONTACT Composer isolated, one future MessageDelivery SendIntent/Outbox only. Opening A does not read/takeover; editing A only makes A HUMAN; B/C valid AUTO remain independent.
No committed application implementation. W34 documentation remains in its isolated design/nonproduction subtree.
