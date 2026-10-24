# P3-0 nonproduction A/B/C/BC controlled experiment
STATUS: DESIGN_PROTOCOL_ONLY; CLICKABLE_VARIANTS_NOT_BUILT; UAT_NOT_RUN.

CHAT-A-V25_BASELINE = uploaded source HTML 89033 bytes; SHA256=7365b4bdf4011007b3fb6b6736ad3d47ede9a0604b1d8c24b17074d7c653aceb. This is a reference, NOT app code to port.
CHAT-B-ADAPTIVE_INBOX = Smart Inbox/Adaptive navigation.
CHAT-C-PULSE_MAIN = Exception-first main layout challenger.
CHAT-BC-FUSION = B as regular chat plus separate CENTER-C-AUTOPILOT_EXCEPTION.
Never mix with ARCH-A/B/C labels from separate architecture studies.

Same non-identifying mock contacts/messages/translation/0–3 suggestions/grant and ACK fixture in each candidate. Eleven tasks:
1) Locate exact peer with same name across accounts and 4 channel labels.
2) Long list positions 25/30/40/120, verify original+Chinese translation source.
3) Quote by right-click/submenu, keyboard Shift+F10, touch long press.
4) 0/1/2/3 genuinely present suggestions, 1+2 progressive vs 3-card; don't fabricate placeholders.
5) Adopt reply into only current CONTACT Composer, preserve IME and attachment, never auto send.
6) Switch accounts/peers and preserve per-binding-revision drafts, quotes and selected candidates.
7) Read HUMAN/ASSIST/AUTO; focus/view alone cannot take over.
8) Actual edit A makes only A HUMAN; B/C already valid AUTO continue.
9) Expired authorization/budget/DELIVERY_UNKNOWN never displays sent/read or issues cross-provider resend.
10) Private Agno instruction input vs public CONTACT Composer unambiguously separate, one external SendIntent only.
11) Five visual themes x light/dark, accessibility, 360/430/720/920/950/1050/1100/1101/1360, Windows DPI.

User study results currently NOT_RUN. Compare success/time/actions/first discoverability/draft loss/accidental send and user feedback. Reject any source-ineligible custom base Button/Bubble/Menu/Composer/Dialog/animations: only exact pinned and legal-reviewed Reka/shadcn-vue and audited AI Elements UI patterns when approved. No OSS installation in P3-0 bootstrap. No production or live account access.