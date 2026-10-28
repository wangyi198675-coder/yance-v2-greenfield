# YANCE V2｜用户确定B＋C融合版为最终聊天界面方向

Decision date: 2026-10-25
Decision authority: user directly said “选B＋C｜融合版吧”.
STATUS: USER_UI_DIRECTION_APPROVED / BC_DEFAULT_DEMO_COMMITTED / PRODUCT_ARCH_DIRECTION_LOCKED / INDEPENDENT_NEW_SHA_DELTA_REVIEW_HOLD / P4_PRODUCTION_HOLD

## Final information architecture
1. B+C is the **single default everyday chat entry**. Four-platform contact inbox, original/translated timeline, 0–3 real candidate replies, single CONTACT Composer for contact drafts, and compact factual unread/AUTO organization. No fabricated candidate/presence/provider ACK.
2. Autopilot Center is an **on-demand independent exception/management surface**. Opening/reading the center or viewing any contact must not trigger a human takeover, and working with contact A must not interrupt authorized B/C hosted conversations.
3. Full PRIVATE Agno/AgentOS workspace is **equally discoverable**, clearly separated from the CONTACT Composer; Agno has native Agent/Team/Skills/MCP/Memory/Learning/Approvals/Budget/Run/Trace, with no second custom agent platform. Existing offline demo remains MOCK/PENDING, not a claim of backend completion.
4. Real user typing, IME, paste, file/audio/voice attach or send must use server-verified current-contact takeover; fake local mode in this prototype is for UI illustration only. Sole MessageDelivery authorizes irreversible outbound sends and handles ACK/UNKNOWN.
5. Reuse audited OSS button/bubble/menu/popover/dialog primitives and maintain all 5 themes and dark/light; never replace contractual UI with custom foundational widgets.
6. A/B/C are historical nonproduction comparison experiments, **not** parallel candidates to keep researching or launching as default. C Pulse may remain a view within the B+C Autopilot Center, not the default chat home.
7. Narrow-window contact list/chat switch, single-click bubble quoting with MID, visible contract identity, correct per-contact draft are required for product UX. Platform/provider legal and permissions gates unchanged.

## Exact source disposition
- Isolated delegated worktree: C:\Users\1\Documents\YanceV2\Worktrees\W09UX_DELEGATED_20261025
- Base signed local prototype SHA: eeb72a75dfdfda4de822fedcef6e7d34ed0439f0, remains unchanged.
- Prior UX candidate SHA: ea589e68daf6d114d1460b7a1deb672dc2a3b14e.
- This decision changes only fresh demo default arm to CHAT-BC-FUSION and records user product selection, no real service or routing/API changes.
- Do not merge into protected main or deploy production absent current-code independent review and required real connection/credential approvals.

## Next action
Use B+C as sole V2 chatbot UI product basis in ongoing contracts and component mapping. No request to revisit the four candidates. Send design direction to existing source Owner only when merging post-delta checks; continue distinct real Agno+Messaging vertical integration in parallel. Do not commission new broad layout research.