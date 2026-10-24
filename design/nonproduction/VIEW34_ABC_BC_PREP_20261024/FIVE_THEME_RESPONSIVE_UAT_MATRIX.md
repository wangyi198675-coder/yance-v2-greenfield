# W34 | FIVE THEME / RESPONSIVE / WINDOWS UAT MATRIX
STATUS: PREPARED_SPEC / NOT_RUN. Source: ABC_BC_PROTOCOL.md and design/metrics/USER_STUDY_EVENT_SCHEMA.json.

## Test dimension lock

| Dimension | Enumerated values | Comment |
|---|---|---|
| Variants | A, B, C, B+C | all use identical 120-contact SHA256 5b9a05df788fe5fab41b6b2033fb895cd3650fb573345856650cfeb24ef9c99c |
| Five themes | T1, T2, T3, T4, T5 | symbolic slots ONLY, pending approved real design token names; no invented themes |
| Color modes | LIGHT and DARK | every theme in both |
| Responsive CSS widths | 360, 430, 720, 920, 950, 1050, 1100, 1101, 1360 px | 9 breakpoints required by protocol |
| Windows DPI spot test | 100%, 125%, 150%, 200% | plan only, tested at CSS widths 950 and 1360 |
| Browser / platform | Chrome, Windows WebView2 if available and authorized | real device/hardware NOT_RUN |
| UAT result | NOT_RUN for EVERY case | no screenshots or performance assertions |

Matrix cardinality: 4 variants * 5 theme slots * 2 color modes * 9 widths = **360** responsive rows. Windows DPI supplemental: 4 variants * 5 theme slots * 2 modes * 2 representative widths * 4 DPI = **320** rows. **680 planned cases total**, fully enumerated in W34_UAT_CASES.csv. No case is marked PASS.

## Layout expectations by breakpoint (for every theme/mode/variant)

| Width | A baseline | B Smart Inbox | C Pulse main | B+C fusion | Test target |
|---|---|---|---|---|---|
| 360 | observe V2.5 reference defect | single-column chat/inbox switch | Pulse list -> drilldown | B main; C separate route | accessible no clipping/overlap |
| 430 | reference-only | single-column + candidate disclosure | Pulse scroll and filter | separate Autopilot Center | quote touch long-press |
| 720 | observe only | adaptive two-pane where eligible | exception list/drill | B chat + C nav entry | preserve draft across layout |
| 920 | observe only | adaptive pane & selected peer | priorities with entry | B default, C independent | no hidden recipient chip |
| 950 | observe only | tablet/desktop transition | Pulse responsive board | B first/C separate | header compact and list usable |
| 1050 | observe only | expanded contact list | priority board | B main with autonomous C | stable candidate 1+2 |
| 1100 | observe only | pre-wide layout edge | no jump | independent workspaces | test 1100 boundary |
| 1101 | observe only | wide layout edge | no jump | independent workspaces | compare 1100 vs 1101 |
| 1360 | observe only | full chat composition | full exception overview | B full chat + separate C | keyboard navigation/density |

A must remain a provenance baseline (not a sanitized replacement), so observed deficiencies should be recorded as defects, not fabricated PASS. B+C is not presumed winner. For all four arms maintain exact data/peer selection and task order counterbalancing.

## Accessibility and operational assertions (all 680 planned cases)

- Exact selected peer account+channel+peer_id+binding_revision remains visible before any simulated public action.
- Original text and Chinese mock translation stay associated with the right provider MID at rows 25/30/40/120.
- All unknown presence are neutral; opening/viewing never fabricates a read receipt or mode takeover.
- Draft, quote, attachment and IME composition never cross K. Private Agno instructions remain separate from public CONTACT Composer.
- Reply candidates are 0/1/2/3 explicit records; B/BC 1+2 and traditional three-card display use the same records and same sort order.
- C exception center has no new provider send engine. Only one future MessageDelivery boundary; mock cannot send.
- Context menu reachable by mouse, Shift+F10, long press; proper focus restore and screen-reader announcement.
- No overlay obscures Composer, no disabled send rendered as enabled, scrolling has a stable last item, 200% DPI does not truncate account identity.
- Five theme slots require actual W32-approved tokens; check contrast, light/dark fidelity, focus indicators and reduced-motion settings without claiming unverified values.

## UAT procedure and result schema

Before testing: resolve W32 exact source/file SHA/license/SBOM/Windows evidence, W33 independent new-repo security ACK, W09 explicit nonproduction clickable build approval. After authorized build, freeze code SHA, OSS manifest SHA, fixture SHA, test device, font and viewport/DPI method.
On each case: select correct arm, load identical fixture and scenario; capture task_id, test_participant_pseudonym, start_ms/end_ms, success, steps, recipient_correct, draft_preserved, candidate_discovery, translation_correct, read_state_not_faked, presence_not_faked, takeover_scope_correct, exception_ack_correct, feedback, screenshot_ref. Report hard-fail separately: wrong_recipient, unauthorized_send, faked_delivered_or_read, focus_caused_takeover, nonapproved_component_source, client_side_grant_authority.
No real UAT completed. UAT results remain [] until run. Do not conflate code/spec conformity with observed user study success.
