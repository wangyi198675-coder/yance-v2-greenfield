# YANCE V2 | Scoped domain task assignments, pending source-maintainer ACK
W09 assigns these WORK ROLES today under the user's expanded autonomous nonproduction directive; project authority permits task scheduling, not forging host identities.
Each recipient must personally return: exact GitHub username/account or authorized local principal; target branch and separate worktree; directory authority; explicit "I accept" source-owner acknowledgment; excluded files; one real running test or known HOLD; their REVIEW_ACK path.
W23 FileAttachment: services/api/src/domains/file-attachment/**, separate asset ACL, derivatives, revoked grants.
W24 IdentityConsent: services/api/src/domains/identity-consent/**, canonical K and revocation.
W25 MessageDelivery: services/api/src/domains/message-delivery/**, sole SendIntent/outbox/provider UNKNOWN/audit.
W26 mautrix-meta: connectors/mautrix-meta/**, inbound bridge mapping; no own SendIntent.
W27 Pancake: connectors/pancake/** plus controlled standby inside scope, no dual send.
W28 Baileys: connectors/baileys/**, only synthetic protocol fixtures; no QR/login.
W29 TDLib JSON: connectors/tdlib-json/**, user-account wire protocol mock only.
W43 Agno Platform: services/agentos/**, official SDK/AgentOS Runtime, no self-built agent engine.
W44 Grant/Custody/Budget: services/api/src/domains/grant-custody-budget/**, durable grant/cost/epoch eligibility.
W45 People/Translation/Reply: services/api/src/domains/people-translation-reply/**, translated message provenance, 0-3 real sourced suggestions, no template padding.
W46 Frontend/Windows: apps/web/** and apps/windows/**, reuse mature source OSS; UI Composer no parallel send engine.
W39 stays ONLY owner for design/nonproduction/approved-clickable-abc-bc/** through P3-1 and its scoped fixes. W40 QA, W41 SEC, W42 OSS are independent reviewers and do not edit W39 source.
Interfaces: file+identity+grant -> Agno/translation+reply -> Composer -> MessageDelivery pre-send auth/outbox/ack -> audit. Four connectors are adapters only.
Each source role shall create branch owner/<domain>/<task> in own worktree after branch name collision check; do not change shared p3-1 worktree or main. No synthetic source interface is accepted as a real channel ACK.
No invented CODEOWNERS mapping: without real authorized distinct Git identities, the CODEOWNERS file is intentionally comment-only and protection remains HOLD.
Acceptance record template docs/OWNER_ACK_TEMPLATE_20261025.md. P4 actual rollout/live traffic remains out of scope.
