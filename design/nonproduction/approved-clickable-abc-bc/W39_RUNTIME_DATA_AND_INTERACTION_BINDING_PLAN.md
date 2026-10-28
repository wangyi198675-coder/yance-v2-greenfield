# W39 | 四臂共用数据与运行行为契约（只读准备，不是运行证明）
STATUS: PLAN_ONLY / NO_APP_CODE / NO_IMPORT / NO_RUNTIME_UAT
CONTRACT: W34 + W35 P35-2 + W37；原始V2.5历史A保持不变（SHA256 7365b4bdf4011007b3fb6b6736ad3d47ede9a0604b1d8c24b17074d7c653aceb）。
SOURCE INPUTS（不得变更）：
- `design/fixtures/synthetic_120_contacts.json` SHA256 `5b9a05df788fe5fab41b6b2033fb895cd3650fb573345856650cfeb24ef9c99c`
- `design/nonproduction/VIEW34_ABC_BC_PREP_20261024/W34_SCENARIO_OVERLAY_SPEC.json` SHA256 `4ed9607d0d65833ab9a5ead3513fdb3b9d03c27e85959997f0125b759071c824`
- W37 external immutable `INDEPENDENT_REVIEW_RECEIPTS/P3-W37-SYNTHETIC-FREEZE/ADDITIVE_SYNTHETIC_SCENARIOS.json` SHA256 `deed37219749242ef853418103fbad902c547089e723233671ed04a7e90af4dc`
- W37 44-row `FOUR_ARM_EXPECTED_OUTCOMES.csv` SHA256 `824f1073065ee0a7f726fd878433fb52cc1f81f212db926175c1d00946a5fe29`.

Four arms fixed:
- `CHAT-A-V25_VISUAL_NORMALIZED`: faithful V2.5 visual A, but safety-standardized common code; not original source JS.
- `CHAT-B-ADAPTIVE_INBOX`: default multi-account adaptive contact workplace, compact 1+2.
- `CHAT-C-PULSE_MAIN`: full-screen exception-first Pulse with discoverable regular chat drilldown.
- `CHAT-BC-FUSION`: B main contact workspace + separate C Autopilot Center; no second public sending path.

Single proposed runtime store shared by all layouts, reset per arm/task with W37 frozen seed; switching layouts must preserve K keyed contact state until explicitly reset. Contact K canonical five tuple `tenant|account|channel|peer_id|binding_revision` (not name/position); message quote key includes K and exact source provider_mid; no persisted user credentials. Data-equivalence is checked at every runtime test by actual rendered identity, MID, original/zh pair, candidate IDs/order and event state—not just equal source SHA.

Mock-only event reducer: select/focus/view -> no read mutation, no takeover, no green presence; draft change/IME committed/paste/file drop/synthetic voice-text -> take over ONLY current K after mock validity check; B/C remain AUTO; on switch restore quote/draft/attachment keyed by K. Selecting a suggested candidate only fills CONTACT draft. Sending control may only display explicit SIMULATED_NO_SEND/UNKNOWN; no provider transport, no network API. PRIVATE user→mock Agno memory/tools/trace/budget fully separate from public CONTACT draft/state; never copies private instructions to human contacts.

W37 special negatives: grant revoked/expired, budget exhausted, WS disconnected, UNKNOWN delivery, injected instructions (render inert text), wrong Chinese translation and mock private tool receipts. Unavailable evidence must display unavailable or unknown; never synthesize successful read, receipt or billable AI result.

Fixtures: all 120 contacts, four channels, two fictional accounts, peer003 0 replies, peer001 1, peer004 2, peer007 3; fake-peer-003 and fake-peer-117 duplicate display name must remain separate. UI long-list test rows #25/#30/#40/#120 must show original Test message #N, corresponding 模拟译文 #N, fake-mid-N.

Selected runtime UI controls MUST map to W42-approved mature OSS sources, no handcrafted Button/Bubble/Composer/Menu/Dialog/animation. Five themes obsidian-lime/cosmic-sunset/ocean-electric/amber-ember/opal-prism × light/dark are DESIGN TEST TOKENS not formal production tokens. Responsive widths: 360/430/720/920/950/1050/1100/1101/1360px.

Test run ledger: W37 44 expectations initialize `NOT_RUN`; upon real build, W40 independent QA should verify each on actual Chrome with screenshot and SHA; W41 security and W42 postbuild license inspect **same commit**. Windows/WebView2 NOT_RUN until directly observed. Original A screenshot/bbox visual parity HOLD without independent original-run evidence.
