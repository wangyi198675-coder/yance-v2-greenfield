# W24 native HUMAN takeover HTTP — W46 / W44 / W25 handoff

GitHub role: Issue #4 W24 IdentityConsent. Same original Owner directory.
Nonproduction synthetic-only; no real social account, user send, model fees or production deployment.

## Real local server API implemented (no listener auto-started)

- `GET /api/v2/identity-consent/takeover-state?k=<URL encoded full K>`
- `POST /api/v2/identity-consent/takeover`

Client W46 supplies `endpoints:{get:TAKEOVER_GET,post:TAKEOVER_POST}` to its existing
`createLoopbackTakeoverPort({baseUrl,endpoints,enabled:true})`; only authorized
loopback local backend can be configured. `takeover-http.mjs` exports
`createNativeTakeoverHttpHandler({service,resolveTrustedContext})`, designed
for a **real authenticated local backend** that binds its own trusted
`{tenant,principal_id,input_domain:'CONTACT'}` after legitimate session
verification. **NEVER** read these three fields from client body/query/headers.
Handler restricts to loopback IP and `X-Yance-Environment: synthetic-only`;
the header is a marker, **NOT** authentication or a substitute for verified
`resolveTrustedContext`. Test-only resolver is deliberately not production-safe.

Full K (W24 canonical K, five components):
`{tenant:'SYNTHETIC_TEST_ONLY',account:'fixture-a',channel:'FB_PERSONAL',peer_id:'fake-contact-A',binding_revision:1}`
`identityKey='SYNTHETIC_TEST_ONLY|fixture-a|FB_PERSONAL|fake-contact-A|1'`.

### GET 200 real W24 identity + W44 custody status

```json
{
  "status": "NATIVE_TAKEOVER_STATE",
  "identity": {
    "tenant": "SYNTHETIC_TEST_ONLY",
    "account": "fixture-a",
    "channel": "FB_PERSONAL",
    "peer_id": "fake-contact-A",
    "binding_revision": 1
  },
  "identityKey": "SYNTHETIC_TEST_ONLY|fixture-a|FB_PERSONAL|fake-contact-A|1",
  "binding_revision": 1,
  "accountRevocationEpoch": 0,
  "consentEpoch": 1,
  "mode": "AUTO",
  "epoch": 0,
  "accountActive": true,
  "canTakeover": true,
  "canSend": false
}
```

GET always does the actual W24 assertCurrent and authoritative consent epoch read,
plus W44 `inspection(K)`; it does **not** set HUMAN, issue a grant, send or
reserve budget. The whole response is no-cache.

### POST 200 only after W44 CAS AND second server GET

```json
{
  "identity": {
    "tenant": "SYNTHETIC_TEST_ONLY",
    "account": "fixture-a",
    "channel": "FB_PERSONAL",
    "peer_id": "fake-contact-A",
    "binding_revision": 1
  },
  "intent": "TAKEOVER_HUMAN_COMPOSER",
  "action": "PASTE",
  "expectedIdentityKey": "SYNTHETIC_TEST_ONLY|fixture-a|FB_PERSONAL|fake-contact-A|1",
  "expectedEpoch": 0,
  "expectedAccountRevocationEpoch": 0,
  "expectedConsentEpoch": 1
}
```

Action allowlist: `TYPE | IME_COMMIT | PASTE | ATTACH | DROP | VOICE |
SEND_ATTEMPT`. Focus, view, switch and selection never trigger POST; the
backend rejects them even when maliciously sent. W46 MUST initiate POST only
on an actual user editing/attachment/send action and must not confuse
candidate adoption or simple contact focus with human takeover.

On POST, backend revalidates current K and all expected versions, checks
trusted operator authority, then calls **existing W44**
`setCustody({identity,mode:'HUMAN',action:'USER_EDIT',
actor:trustedContext.principal_id,expectedEpoch})`. W44 uses its
transactional SQLite `expectedEpoch` CAS; no W24 custody table exists.

After mutation W24 performs another actual `GET` and accepts only the exact
same full K, `mode:'HUMAN'`, custody `epoch:expectedEpoch+1`, matching
account revocation and Consent epochs, and an authorized current principal.

Response 200:
`{accepted:true,identity,identityKey,mode:'HUMAN',epoch:1,
accountRevocationEpoch:0,consentEpoch:1,confirmedByGet:true,canSend:false}`

**W46 also independently GETs afterward**, confirming matching full K and
`HUMAN` / new epoch. The response never implies a W25 SendIntent, canSend:true,
a provider ACK or a paid model action.

### Error boundary

- 401: no verified trusted CONTACT principal context;
- 403: unauthorized principal, mutation or environment;
- 409: old binding, unbound account, stale custody/identity/Consent epoch,
  already-HUMAN POST, concurrent takeover;
- 422: invalid/missing CAS fields, bad K, passive action, malformed POST;
- 503: unavailable W44 service/unknown internal failure or inconsistent
  second GET; `accepted:false` always.

Only GET 200 and verified POST 200 are success. All errors return
`{accepted:false,error:'STABLE_CODE'}`; no fabricated success.

## Current W46 Composer integration confirmed (2026-10-25)

W46 Owner exact SHA `88f6c30094a3d6217491c3d1f410a040d91ab3f0`
already supplies all strict CAS fields from the preceding GET in
`apps/web/src/composer-bridge.mjs`:
`expectedIdentityKey:before.identityKey`,
`expectedEpoch:before.epoch`,
`expectedAccountRevocationEpoch:before.accountRevocationEpoch`,
`expectedConsentEpoch:before.consentEpoch`.
The prior W24 assertion expecting a legal PASTE to return `BLOCKED` /
HTTP 422 was obsolete and has been corrected **only in W24 test source**.

The actual W46 Composer now returns `READY_HUMAN`, verified epoch +1
for legal PASTE, and independent GET and W44 SQLite inspection confirm
same full K in HUMAN; B/C remain AUTO. Separate explicit HTTP negative
requests using a stale full K/custody epoch yield 409, and missing
mandatory version fields yield 422. No W46 source was altered by W24.
This is local synthetic loopback execution, not production account UAT.

W44: existing setCustody is sole custody authority; ensure mutation delegation
remains identity + actor scoped and CAS. W25: HUMAN takeover should fence AUTO
at its existing pre-network boundary (no new sender). W46 must preserve AUTO
mode/grants for B/C when A switches to HUMAN. Latest W09-2 PR #32 is read-only
input to tests; no W44/W25/W46 code edited.

## Actual tests (Windows Node 24, real W44 SQLite)

```powershell
$env:YANCE_PR32_ROOT='C:\Users\1\Documents\YanceV2\Worktrees\W09_NATIVE_SYNTHETIC_INTEGRATION_20261025'
$env:YANCE_W46_ROOT='C:\Users\1\Documents\YanceV2\Worktrees\W46_BC_NATIVE_20261025'
node --test services/api/src/domains/identity-consent/takeover-http.test.mjs
```

Current targeted suite: 16/16 PASS; W24 combined 28 original
IdentityConsent + 16 takeover HTTP + 4 intentionally RED diagnostic audit
assertions = 48/48 executable assertions. The 4 audit PASS are reproduced
P0 vulnerabilities, **not** security-release pass. This is local loopback
execution, not a real provider, production HTTP or WebView2 graphical signoff.

## Remaining safety gates

P0: The W46 CAS forwarding defect is ALREADY CLOSED at W46 SHA
`88f6c30094a3d6217491c3d1f410a040d91ab3f0`.
The W24 separate identity-persistence / W44 atomic mutation-fence issue
remains **RED** (see `P0_DB_OWNER_MINIMAL_INTERFACE_REQUEST.md`).
A trusted authenticated app/IPC resolver with real session validation is
not yet installed; test injected context MUST NOT be reused in production.
No production HTTP, identity/consent proof or live provider authorization.

P1: separate SEC review of loopback caller auth/CSRF and cross-process retry,
and server-side semantic integrity of "real edit" action (the backend cannot
prove human interaction merely from client action text). Formal W44/W25
cross-worker takeover-versus-PRE_NETWORK race with the joint SHA remains HOLD.

No real account login, actual person send, paid model run or deployment.
