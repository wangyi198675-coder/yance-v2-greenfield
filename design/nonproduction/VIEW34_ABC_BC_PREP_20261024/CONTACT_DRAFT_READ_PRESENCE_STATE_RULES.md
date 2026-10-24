# W34 | Contact, Draft, Read, Presence and Takeover State Rules
STATUS: NORMATIVE DESIGN SPEC / NO_RUNTIME / NO_REAL_PROVIDER
SOURCE: ABC_BC_PROTOCOL.md; synthetic_120_contacts.json; P3_0_GATES.md; user-original V2.5 static findings.

## Authoritative identity and isolation

Immutable row identity K = (tenant, account, channel, peer_id, binding_revision). Do not key by display_name, list index or channel-only peer_id. Cross-tenant/account/channel never reuses draft, quote, file, suggestion selection, read evidence, presence or mode state. Old revision is frozen upon account rebinding; never remap saved drafts into a new revision without explicit recipient confirmation.
Source fixture channel labels: FB_PERSONAL, FB_PAGE, WHATSAPP_PERSONAL, TELEGRAM_PERSONAL. Real connector routing is OUT OF SCOPE.

## Draft and editor state machine

D0_NO_DRAFT -> D1_DRAFT_DIRTY on actual accepted edit; D1 -> D2_COMPOSING_IME during compositionstart; D2 -> D1 only on compositionend + commit without double processing; D1 -> D3_LOCAL_PERSISTED on account/peer switch, tab close or layout navigation.
D3 -> D1 on returning to exact K; editing retains undo and caret/selection when possible. A quote has its own immutable quote(source_K,provider_mid,text_snapshot); it cannot attach to a different K. Attachments hold local metadata and synthetic blob handle only; no upload, token, provider callback or fake ACK.
Pressing candidate 'use' inserts copy into the active exact-K Composer only on deliberate adoption; compare candidate ID, account/channel/peer/revision again immediately before commit. Adopting a candidate is a local edit and triggers that exact contact's takeover rule, never actual send.
Private Agno prompt uses separate namespace P=(tenant,SELF_PRIVATE,workspace_id,session_id) and MUST NOT reuse CONTACT Composer storage or drafts. Mock agent text is not a real Agno response. Only an authorized future real Agno platform can perform agents/tools; this prototype cannot.

## Takeover and mode transitions

Mode is displayed as provided by snapshot: HUMAN / ASSIST / AUTO. Peer open, hover, click, scroll, focus, selection and quote-menu open DO NOT transition mode.
If the user actually types/composition-commits, pastes text, selects and adopts a candidate, drops/selects an attachment, supplies voice text or explicitly initiates a send for contact A, request simulated HUMAN takeover on K(A) only. The future production flow must GET qualified account/peer/revision/epoch -> TAKEOVER -> GET confirmation before enabled irreversible send. Mock does not call these endpoints.
After simulated A takeover: A=HUMAN; B and C retain AUTO only if their existing independent grants are valid. Do not imply A takeover grants authority over B/C. If grant revoked/expired/budget exhausted/stale binding, mark blocked; do not continue AUTO or send on that contact.
No client can issue a durable grant, infer it from old UI toggles or refresh its validity by changing display state.

## Read / unread and last-message translation

Opening contact S11 MUST NOT mutate unread or read status. In the base fixture 120 rows have read_verification=UNVERIFIED, so render unread count as supplied but do not claim provider read receipt or local read-receipt success. UI may label viewed locally, distinct from remotely read; record no synthetic provider read ACK.
Provider delivered/read requires an explicit matching channel+account+provider_mid qualified receipt, not HTTP200 nor merely an opened panel. DELIVERY_UNKNOWN remains UNKNOWN with no automatic cross-provider resend, no green delivered/read check. A late real ACK could reconcile only with exact identity in future production.
Display both last_message.original and last_message.zh, tied to same provider_mid and translation_state; mock Chinese is SYNTHETIC not certified machine translation. List page 25,30,40,120 must show exact numbered original+translation without recycled rows, even when virtual scrolling.

## Presence and account identity

All 120 contact records say presence=UNKNOWN. Thus NO green online dot, 'online' claim, typing indicator or 'last seen' fabricated. If status absent, display a neutral '在线状态未知' or omit status; never treat channel connection as personal presence.
Results for duplicate display name '同名演示联系人': fake-peer-003 on fixture-account-1/WHATSAPP_PERSONAL and fake-peer-117 on fixture-account-1/FB_PERSONAL. Both entries remain distinct and show channel and peer ID. Search cannot default to first match for a send destination.
Binding revision bumps force stale draft / quote / candidate to read-only until user confirms exact new recipient.

## ReplyCandidate, safety and Agno/MessageDelivery boundaries

Candidate list = filter explicit candidate records by exact K and candidate status; size 0..3. If 0: neutral no-suggestion state; if 1: one card; if 2: two cards; if 3: either progressive 1+2 or classic 3-card uses SAME IDs, text, order and source. Never call fakeSuggestions() or pad data.
Only one public simulated outgoing SendIntent boundary exists in CONTACT Composer; the private Agno workspace and C Center cannot originate their own provider sends. Pressing a send control is disabled in this prep; mock ACK must be unmistakably labeled synthetic if later implemented under explicit gate.
Grant failures and UNKNOWN remain blocked. Unknown provider outcome cannot become DELIVERED/READ; no automatic retry across account/channel.

## State transition acceptance (design expected; not executed)

| Test | Trigger | Expected | Disallowed |
|---|---|---|---|
| S01 | Open fake-peer-001 | unread unchanged and AUTO unchanged | c.unread=0 |
| S02 | Focus or scroll in A | AUTO unchanged | takeover |
| S03 | Type/paste/IME commit in A | A HUMAN only | B/C interrupted |
| S04 | Drop attachment / adopt suggestion into A | per-A edit + takeover intent | send or other-peer edit |
| S05 | Switch A->B->A | draft/IME/quote/attachment restored to exact K | global S.draft reset |
| S06 | Rebind account or revision | no migration to new K without confirm | stale recipient send |
| S07 | Open any of 120 | UNKNOWN presence, no online dot | fixed CSS green dot |
| S08 | Open unread peer120 | unread=1 unless external verified event | synthetic read |
| S09 | Duplicate-name search | both peer003 and peer117 distinct | ambiguous destination |
| S10 | Apply synthetic DELIVERY_UNKNOWN peer117 | no delivered/auto retry | misleading check |
| S11 | Apply GRANT_REVOKED peer003 | blocked / no send | client-side grant |
| S12 | Show 0/1/2/3 candidate cases | count and records exact | always-3 placeholders |
| S13 | Private instruction | SELF_PRIVATE only | public send |
| S14 | Quote by mouse/keyboard/touch | same message MID and K | cross-peer quote |
| S15 | Pagination 25/30/40/120 | original/zh numbered exact | recycled translation |
| S16 | C exception review | no new sending engine | duplicate delivery |
