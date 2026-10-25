# W26 — FB_PERSONAL / mautrix-meta, synthetic inbound only

**Issue:** [#10](https://github.com/wangyi198675-coder/yance-v2-greenfield/issues/10)
**Owner-boundary:** `connectors/mautrix-meta/**` only.
**Result:** executable **offline** protocol-contract adapter. This does not launch mautrix-meta or demonstrate that Meta authorizes commercial AI auto-chat.

## Run on Windows/macOS/Linux (Node >=20)

```sh
node --test connectors/mautrix-meta/test/synthetic-inbound.test.mjs
```

No dependencies, .env, API IDs, cookies, model access, DB, HTTP, websocket, accounts, messaging or token costs. Uses synthetic fixture names and events exclusively.

## M1 input contract (proposed, pending W24 & W45 approval)

```js
import { createSyntheticInboundAdapter } from './src/synthetic-inbound.mjs';

const adapter = createSyntheticInboundAdapter({
  bindings: [{
    tenant: 'SYNTHETIC_TEST_ONLY', account: 'fixture-account-1',
    channel: 'FB_PERSONAL', peer_id: 'fake-peer-001', binding_revision: 1,
    bridge_instance_id: 'fake-bridge-1', remote_account_id: 'fake-facebook-account-1',
    remote_thread_id: 'fake-thread-a', simulated: true,
  }],
  onInbound: async ({ id, mid, original, k, source_mid_namespace, evidence }) => {
    // M0-compatible {id,mid,original}: future W24/W45 Native M1 ingestion.
    // W26 may NOT translate, spawn Agno, produce ReplyBrain suggestions, or send.
  }
});
adapter.observeConnection({
  simulated: true, bridge_instance_id: 'fake-bridge-1',
  remote_account_id: 'fake-facebook-account-1',
  binding_revision: 1, state: 'ONLINE', connection_epoch: 1,
});
await adapter.receive({
  simulated: true, source: 'mautrix-meta', channel: 'FB_PERSONAL',
  bridge_instance_id: 'fake-bridge-1', remote_account_id: 'fake-facebook-account-1',
  remote_thread_id: 'fake-thread-a', connection_epoch: 1,
  kind: 'MESSAGE', matrix_event_id: 'fake-matrix-event-1',
  provider_mid: 'fake-meta-mid-1', original: 'Cześć',
});
```

The adapter's route comes exclusively from a supplied **synthetic authoritative binding**. The incoming payload cannot assign tenant/account/peer/binding itself. K is exactly `tenant|account|channel|peer_id|binding_revision`. Event IDs and native Meta MID use separate namespaces. Source text is preserved. OnReceive returns `receipt_status: NOT_REQUESTED` and a clearly labeled synthetic provenance; no fabricated translation, no Agno Run and no actual delivery.

## Safety & failure boundaries

- Account connection observations require monotonic connection epoch; stale/revoked sessions never restart or rebind. OFFLINE messages return `OFFLINE_NO_SHADOW_QUEUE`. Backfill/echo suppressed. A/B/C peers do not interfere.
- Per-K+source-MID memory dedupe and concurrent same-MID coalescing support local tests. **NOT a durable Outbox or restart-safe persistent dedupe**; W25 owns the durable implementation.
- `classifySyntheticReceipt` is a read-only classifier. `MOCK_ACK_ONLY` and `BRIDGE_ACCEPTED_UNVERIFIED` do not prove Meta delivered/read. `DELIVERY_UNKNOWN` never triggers retry.
- Credentials/secret keys forbidden as fields; fake-only IDs. No `send()`, `login()`, `connect()`, `credentials` or transport call. Identity/grants/contact consent W24/W44, budget and W25 send eligibility/Outbox, Agno W43, translations W45, Composer W46.
- Future real transport plumbing, vendor protocol compatibility, account login, secret vault, Meta platform permissions and actual receipts require separate approvals. FB_PAGE is W27 and never shares personal credentials.

## Current blockers

`P0`: Meta personal Messenger platform terms/legitimate business automation rights unapproved; AGPL-3.0 obligations and third-party vendor terms require independent LEGAL review; real account authorization forbidden; no actual W24/W25 M1 contract or runtime.
`P1`: in-memory dedupe does not survive restart, upstream BridgeV2 event schema and API behavior not runtime-verified, webhook authenticity/credential custody not implemented, native receipts unavailable.
No production deployment, real sends, credentials or paid AI calls.
