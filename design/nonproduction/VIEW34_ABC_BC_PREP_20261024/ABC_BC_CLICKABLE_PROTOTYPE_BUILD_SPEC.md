# W34 | ABC + BC clickable prototype BUILD SPEC (design-only)

- Date: 2026-10-24; author: W34 design preparation (not ARCH/SEC/LEGAL/QA signature).
- Status: PREPARATION_COMPLETE / CLICKABLE_BUILD_HOLD / UAT_NOT_RUN.
- Repository: YANCE_V2_GREENFIELD_P3_0_20261024; inspected HEAD b20c32daa766c060a323ac225afcf0cd33fbe92a.
- Baseline A: user-original V2.5 HTML, 89033 bytes, SHA256 7365b4bdf4011007b3fb6b6736ad3d47ede9a0604b1d8c24b17074d7c653aceb; provenance says W30 copy is byte-identical. Reference only: NEVER port its handwritten JS/CSS primitives.
- Contact fixture: design/fixtures/synthetic_120_contacts.json; SHA256 5b9a05df788fe5fab41b6b2033fb895cd3650fb573345856650cfeb24ef9c99c. Shared unchanged by all four arms.
- Additional scenario SPEC (not runtime implementation): W34_SCENARIO_OVERLAY_SPEC.json in this directory. All scenario IDs, fixture source revisions, labels and expected results are fixed before comparative UAT.

## Experiment variants: UI layout is the only intended independent variable

| Arm | Entry and navigation | Chat region | Exception management | Candidate comparison |
|---|---|---|---|---|
| CHAT-A-V25_BASELINE | Original nonproduction V2.5 mock as-is, flagged legacy defects | Existing reference composition | In-reference affordances only | Seeded 3 is NOT genuine candidates: report as baseline limitation, never relabel PASS |
| CHAT-B-ADAPTIVE_INBOX | Adaptive conversation inbox with account/channel filters, priority and search | One contact timeline and sole CONTACT Composer | Inline context cues | 1+2 progressive disclosure vs three source-derived cards |
| CHAT-C-PULSE_MAIN | Full-screen priority / anomaly Pulse overview | Drill into peer for deliberate conversation edit | First-level queue of pending cases | Same 0–3 fixture records, never synthesize missing entries |
| CHAT-BC-FUSION | B is default regular chat workspace | B timeline + CONTACT Composer | Separate C Autopilot Center with return-to-chat context | B uses 1+2; comparison toggle renders three cards from identical records |

A remains the auditable immutable user-uploaded reference and is not silently patched. CRITICAL PARITY BLOCKER: that original HTML has its own mock data/always-three seeded suggestions, so it cannot honestly be claimed to consume the same 120 contacts and 0–3 records today. Before comparative UAT, W09/W22 must approve either a non-mutating proven A fixture adapter or a separately labeled A-V25-VISUAL_NORMALIZED control rebuilt ONLY from W32-approved OSS. Preserve the immutable original for exact provenance; never present a normalized replica as the original. No four-way effectiveness ranking is valid until A data parity is actually demonstrated. Existing A draft/read/presence defects must be recorded distinctly. B+C remains a priority hypothesis, NOT a winner.

## Screen inventory and navigation contracts

- S00 Variant launcher (test harness shell only): chooses one arm, resets scenario and records same fixture hash/seed/task_id; never modifies 120 contacts.
- S10 Inbox / contact list: filter by tenant/account/channel/mode and exact identity; dual original + Chinese translation on last-message preview; progressive pagination 25/30/40/120 without losing last row.
- S11 Contact timeline: explicit recipient identity chip includes account, channel, peer ID and binding revision; provider MID scoped to channel; read/presence are unverified unless evidence.
- S12 CONTACT composer: only public per-peer draft and intentionally selected quoted message, IME composition/clipboard/attachment states; only one simulated delivery boundary.
- S13 ReplyCandidate tray: 0/1/2/3 as actually present in sidecar records, 1+2 layout or traditional three visible cards only when count=3; accept copies to local CONTACT draft, NEVER autosends.
- S14 SELF_PRIVATE Agno workspace: separate private user-to-agent conversation and tool-receipt *mock*, no impersonation of remote Agno; never pass private instruction to public Composer.
- S15 C Autopilot Center: independent queue for exception inspection, grant expiry, budget blocked, delivery UNKNOWN; no recipient sending control outside S12.
- S16 Context action / quote entry: right-click submenu, Shift+F10 and touch long-press; quote belongs to source (account, peer, revision).
- S17 Account / contact filter / identity search: duplicate names fake-peer-003 and fake-peer-117 must be distinguished by exact channel + account + peer ID.
- S18 Status/consent details: shows genuine fixture status and simulated NO_SEND gates, not authoritative authorization; read-only on real credentials.
- S19 Offline test-results capture: record test participant pseudonym, duration, steps, failure signals and screenshot references; no fabricated UAT results.
- S20 B compact 1+2 vs traditional 3-card comparison, identical candidate object IDs/content/order.

## Screen state graph (normative, no app code)

S00[select arm / common fixture] -> S10[INBOX_LIST_IDLE]
S10 -- search/filter/page --> S10[LIST_FILTERED_OR_PAGED]
S10 -- view/focus peer --> S11[PEER_VIEW_ONLY / no read / no takeover]
S11 -- context invoke --> S16[QUOTE_MENU] -- choose item --> S12[QUOTE_BOUND_TO_PEER]
S11 -- display 0..3 candidates --> S13[EXACT_COUNT] -- select candidate --> S12[DRAFT_ONLY]
S11 -- public real edit / paste / attachment / voice input --> S12[EDIT_PENDING_TAKEOVER]
S12 -- simulated same-peer takeover accepted --> S12[PEER_HUMAN]
S12 -- switch peer --> S10 or S11[RESTORE_PEER_DRAFT_AND_QUOTE]
S11 -- open private workspace --> S14[SELF_PRIVATE] -- close --> S11[UNCHANGED_PUBLIC_DRAFT]
S10 -- B+C open autopilot center / C default --> S15[EXCEPTION_PRIORITY]
S15 -- inspect grant/UNKNOWN --> S18[REVIEW_ONLY / NO_SEND]
S15 -- navigate to contact --> S11[VIEW_ONLY; OTHER_AUTOS_UNCHANGED]
S12 -- simulated delivery intent gated --> S18[NOT_SENT / UNKNOWN / SYNTHETIC_ACK_ONLY]
Forbidden transitions: focus->HUMAN; view->read; candidate->provider_send; SELF_PRIVATE->CONTACT send; UNKNOWN->resend; A takeover->B/C takeover.

## Fixed common data and interactions

Identity key K = tenant + account + channel + peer_id + binding_revision. 120 source contacts, 30 per frozen channel, 40 per mode and 120 UNKNOWN presence. Each candidate and scenario overlay explicitly references an existing K; no real data, phone, photo, tokens or sockets.
- Existing source events: test-revoke-a(fake-peer-003 -> NO_SEND), test-unknown-b(fake-peer-117 -> NO_RETRY_NO_DELIVERED), test-takeover(fake-peer-001 -> ONLY_A_HUMAN_OTHERS_AUTO_UNCHANGED).
- Prototype A = fake-peer-001 (FB_PERSONAL, account-1, AUTO); B = fake-peer-004 (TELEGRAM_PERSONAL, account-2, AUTO); C = fake-peer-007 (WHATSAPP_PERSONAL, account-1, AUTO). These are synthetic roles, independent of the 4 variant labels.
- Candidate test 0 for peer003, 1 for peer001, 2 for peer004, 3 for peer007. The sidecar contains actual explicit synthetic candidate objects, NOT a seeded three-card generator and NOT actual model results.
- UTF-8 exact source example at row 25: original 'Test message #25'; Chinese '模拟译文 #25'; translation_state SYNTHETIC. Never claim this is provider/model verified.
- Quoted message ID is original provider_mid + K. Paste, attachment drop, voice transcription text and IME commit count as real edit; focus, open, scroll, hover or selecting a candidate before adopting do not.
- Overlay test events may simulate grant/ACK outcomes but NEVER write authoritative grant, update live read states or issue production SendIntent.

## Interactions, metrics, accessibility and QA

Inherit the eleven tasks verbatim from design/experiments/ABC_BC_PROTOCOL.md; run the same scripted tasks per arm in counterbalanced presentation order with clean state reset. Capture design/metrics/USER_STUDY_EVENT_SCHEMA.json required fields, including component_manifest_sha, fixture_hash, steps, success, recipient_correct, draft_preserved, candidate_discovery, translation_correct, read_state_not_faked, presence_not_faked, takeover_scope_correct and exception_ack_correct.
Measure task completion time, clicks/keystrokes, first discovery of candidate controls, erroneous recipient selection, draft loss, accidental sends and qualitative preference. Prohibit real send by hard mock-only transport.
Usability and accessibility: full keyboard traversal, accessible labels and focus rings, screen-reader announcement of UNKNOWN, visible channel/account identity, context menu on keyboard and touch, reduced-motion compatibility, no clipping or horizontal overflow at listed widths.

## Hard gates before ANY clickable code

GATE-32 = W32 pinned real OSS origin and file-level SHA/SPDX/LICENSE/NOTICE/SBOM/integrity/Windows compatibility ACK for all base controls. Mapping rows marked SOURCE_PIN_HOLD cannot be replaced by hand-rolled controls or unsourced imports.
GATE-33 = W33 new-repo security acceptance at exact current HEAD/approved successor and permission scope; SEC/LEGAL/QA and actual maintainer ACKs as applicable. Do not assume present.
GATE-09 = W09 written explicit permission for nonproduction clickable prototype, isolated path and source SHA after GATE-32+33.
Do not initiate app code, OSS install/vendor, live Agno, social accounts, real send, Windows install or production deploy. Keep all V2 Stable IDs and unchanged contracts.

## Acceptance criteria (PREP only)

[PASS] Six W34 files + immutable overlay specification exist and are readable; reference SHA and common fixture fingerprint recorded.
[PASS] Screen/interaction state graph, 4 variants, source mapping, unsafe-state rules and full theme/viewport UAT matrix documented.
[HOLD] Actual OSS pin, license/security signature, component imports and clickable screens.
[NOT_RUN] Comparative UAT, real Windows screenshots, real Agno/contacts/receipt.
