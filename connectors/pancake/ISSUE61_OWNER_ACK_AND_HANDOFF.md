# W27 Issue #61 | Pancake official REST + verified readback + Chatwoot Cloud standby

**OWNER ACK:** W27; logged-in GitHub principal wangyi198675-coder. Scope connectors/pancake/** only. Branch owner/fb-page/issue-61-native-rest-20261026; exact parent baseline bb1be7bf070ceff39681b081b04754a4b4e34cc3.

## Non-negotiable native architecture

Pancake is an officially hosted commercial SaaS API, **not a local open-source executable or an installable official Node SDK**. Its real native integration is HTTPS REST and Webhook. We do NOT write or install a replacement Meta/Facebook Messenger implementation. Chatwoot Cloud is likewise a hosted product, not a self-hosted worker in this design. No account login/token exists in this branch.

Retained existing `adapter.mjs`, `adapter.test.mjs` synthetic contract **without modification**. New files:

- `official-rest.mjs`: official production Pancake REST GET `/api/v1/pages` (user token); `/api/public_api/v2/pages/{page_id}/conversations` (page token); `/api/public_api/v1/pages/{page_id}/conversations/{id}/messages`; `/page_customers` and `/users`. Real Node `fetch` with pinned `https://pages.fm` host, query token per official contract (no fake Authorization header), restricted server-native credential lease, deny redirects, timeout, sanitized error without URL/token disclosure, post-response W24 revocation/rebinding recheck, rate 429 no blind retry. Messages include attachment **metadata only**, not unauthorized file bytes.
- `official-inbound.mjs`: no public HTTP listener or new Outbox. W47 receives the actual webhook; **a caller-supplied webhook is UNTRUSTED**. `createAuthenticatedReadbackIngress({resolveCurrentPage,resolveCurrentPeer,pancakeRest,deliverToExistingInbound})` validates current W24 authorized Page+PSID, independently re-fetches exact provider MID/message from authenticated Pancake official REST, verifies same account/Page/peer/content, then passes normalized envelope to existing owner-provided W25/W45 ingress port with provider readback evidence. If any link missing, reject; never mint Meta MID or claim Meta delivery; W25 handles DURABLE dedupe, epoch, sender. This is independently authenticated readback of provider state, **not a claim that public Pancake Webhook YAML defines HMAC**. W47 must add request rate limits and W25 must supply durable ingress before enabling this route.
- `chatwoot-cloud-readonly.mjs`: official Chatwoot Cloud GET on `https://app.chatwoot.com` Application API via native token lease; lists Facebook-type inboxes and conversations but **never** attempts actual Messenger send, generic API Inbox, duplicate cross-provider retry or owner switch. All actual Meta Page/PSID/Conversation Routing/missing conversation proofs and W25 CAS remain unsatisfied. Account+token separate per native principal.
- `vendor-preflight.mjs`: executable Node v24 process for real public upstream HTTPS availability and raw SHA256; **not provider account login or live data**.
- `official-service.test.mjs`: regression of genuine HTTP request creation, W24 native session/binding denial, wrong Page and revocation, query auth placement, response sanitization, provider message/content corroboration, Chatwoot standby, and W25 ingress hard stop.

## W47/W24/W55/W25/W45/W43/W46 minimum integration port handoff

These are REQUIRED injected **server-owned** capabilities. They are not implemented by inventing any second identity, secret store, sender or Agent.

```js
import {createPancakeOfficialRest,pancakeAuthorizationSetup} from './connectors/pancake/official-rest.mjs';
import {createAuthenticatedReadbackIngress} from './connectors/pancake/official-inbound.mjs';
import {createChatwootCloudReader,chatwootCloudAuthorizationSetup} from './connectors/pancake/chatwoot-cloud-readonly.mjs';

const pancake = createPancakeOfficialRest({
  resolveTrustedSession: w47NativeSessionResolver,
  resolveChannelBinding: w24VerifiedPageBindingResolver,
  credentialLease: w55ProtectedScopedTokenLease
});
// Read-only only; no POST sender. Provider state is unavailable until user grants auth.
await pancake.listConversations({pageId: authorizedPancakePageId});
await pancake.listCustomers({pageId: authorizedPancakePageId,since,until});
await pancake.listMessages({pageId: authorizedPancakePageId,conversationId});

const inbound = createAuthenticatedReadbackIngress({
  resolveCurrentPage: w24VerifiedPageFromUntrustedLocator,
  resolveCurrentPeer: w24VerifiedPeerFromOfficialPageMessage,
  pancakeRest: pancake,
  deliverToExistingInbound: w25W45DurableInboundBridge
});
// W47 must rate limit untrusted webhook attempts and call this; if no verified readback
// or W24 Peer binding, NEVER dispatch W45 translation / W43 Agno.
await inbound.acceptWebhook(untrustedRawRequestBody);

const chatwoot = createChatwootCloudReader({
  resolveTrustedSession: w47NativeSessionResolver,
  resolveAuthorizedStandby: w24ChatwootFacebookPageBindingResolver,
  credentialLease: w55ProtectedScopedCloudTokenLease
});
await chatwoot.listFacebookInboxes();
```

**W46 UI handoff:** Use `pancakeAuthorizationSetup()` and `chatwootCloudAuthorizationSetup()` to render one setting page/card in existing B+C Settings. Links are live official sites, with steps that initiate real user-directed authorization. **Never** type or paste any social credentials into a plain browser form or this report. The actual token input belongs to the existing W55 protected Windows credential interface. Until users authorize real accounts and W47 native session is available, return WAITING_USER_AUTH; never invent a Page or contacts.

**W24 identity:** existing synthetic guard MUST NOT be removed. Add only a signed native ChannelAccount↔Page↔PSID mapping where user holds real Page admin rights; verify bindingRevision, revocationEpoch and consentEpoch before/after reads. W47 local Session principal must be genuine, not Origin/localhost header.

**W25 sole sender:** no outbound path in W27; W25 alone decides SendIntent/Outbox/ACK/UNKNOWN and cross-SaaS Page owner epoch CAS. Incoming supplier MID is not verified Meta MID. Chatwoot never becomes active until explicit approval, no UNKNOWN, current Meta routing verified, and W25 owner change committed.

**W45/W43** own translator/official Agno: normalized inbound with `original`, `k`, `providerMid`, provenance; do not call mock Run or LLM inside provider worker. B+C Composer remains W46.

## Actually performed / honest HOLD

```powershell
cd connectors/pancake
npm test
npm run preflight
```

Current Node binary version v24.18.0; no additional npm dependencies required for Pancake/Chatwoot native HTTPS service. Public official Pancake REST/OpenAPI v1.0.0 and webhook v1.0.0, snapshots pinned in PUBLIC_CONTRACT_PIN.json, verified live HTTPS HTTP 200 and same SHA on 2026-10-26. Chatwoot Cloud https://app.chatwoot.com publicly responds HTTP 200 on the authorized device; Chatwoot developers docs endpoint was not reachable through same node test (red in separate probe). Cloud running server version not known without a user-authorized tenant. No user-supplied Page account, PSID, real MID, cloud credentials or legal Messenger takeover qualified. Consequently **WAITING_USER_AUTH + INTEGRATED_STAGING_HOLD** (not User Delivered); genuine vendor API authorized GET/Webhook callback, reconnect/restart with Page, Meta MID and ACK all NOT_RUN. Real user must select an account and enter approved credentials in W55 native UI before any real API call. Production Webhook signature proof is not established in public YAML; authenticated REST readback and original W24/W25 ingress are mandatory for any incoming event, and provider route remains disabled absent those ports.

**Source owner boundaries:** W27 code is only `connectors/pancake/**`. W47 is sole API route Owner; W55 is only native secret custodian; W24 principal/account/Peer; W25 immutable Outbox/ACK; W46 UI; W09-2 integration. Other Owner changes must be submitted as minimal consumer contract, not stealth-edited.

No legacy source, old account credentials, real sends, paid API calls, app deployment, new CI or second sender.
