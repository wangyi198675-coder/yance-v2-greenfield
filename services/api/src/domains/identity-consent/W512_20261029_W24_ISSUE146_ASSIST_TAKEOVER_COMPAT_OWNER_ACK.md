# W512｜视窗24｜Issue #146 W44 ASSIST→HUMAN TAKEOVER 原Owner定点修复与独立复签交接
STATUS: W24_TAKEOVER_SOURCE_AND_WINDOWS_PASS / VIEW14_INDEPENDENT_REVIEW_PENDING / W46_ASSIST_COMPOSER_CONSUMER_HOLD / CONVERSATION_DB_OWNER_UNASSIGNED / NO_DEPLOY
DATE: 2026-10-29
DEVICE: DESKTOP-029FH47
OWNER: W24 original IdentityConsent/TAKEOVER only, `services/api/src/domains/identity-consent/**`
REPO: wangyi198675-coder/yance-v2-greenfield
BRANCH: owner/identity-consent/issue-4-native-k-20261025
EXACT CODE COMMIT: `987c526692493daa2daefad4efd33c40f6ccbd87`
CODE PARENT: `52f9794d13bb65dcd4bb3d5846be6998de117b7f`
FINAL ACK HEAD: see subsequent exact Git commit and GitHub Issue #146 comment; no file may self-reference its own HEAD.

## 1. Source and defect confirmation

Read Windows `C:\Users\1\Documents\YanceAuthority\20261005\MasterController\W512_20261029_W09_ISSUE146_ALL_VIEW_RECEIPTS_RECONCILED_NATIVE_GAPS_NEXT_GATE.md`.
The current W44 original Owner exact `0eebe55dfde2ece40647bb651df6a22b6d6ef33c`, `services/api/src/domains/grant-custody-budget/{index.mjs,authority-db.mjs}`, persists `MODE_ASSIST` as custody mode `ASSIST`, `MODE_MANUAL` as `HUMAN`, `MODE_AUTO` as `AUTO`; existing `HUMAN_TAKEOVER` mutation transitions current CONTACT K's custody to HUMAN under W44's original transactional CAS. W44 modes, grant, budget, W25 UNKNOWN and the DB were NOT modified.

Original W24 `takeover.mjs:get` only allowed W44 `inspection().mode` in `AUTO|HUMAN`, causing an actual original ASSIST custody state to return `CUSTODY_STATE_UNAVAILABLE` HTTP503 **before** any legal user Composer action. We verified the exact old source and corrected only the W24 mode-compatibility branch.

## 2. Exact two-file W24 code delta (no second system)

1. `services/api/src/domains/identity-consent/takeover.mjs`: W24 GET now explicitly accepts the real W44 `AUTO|ASSIST|HUMAN` custody modes, and safely normalizes only a potential historical `MANUAL` alias to the existing Composer wire `HUMAN`. **ASSIST remains ASSIST**, never masked as AUTO. GET still calls original `IdentityConsent.assertCurrent`, `readConsentEpoch`, `custodyStore.inspection`, signed `authorizeTakeover(READ_STATE)` and double-checks W24 accountRevocationEpoch. No GET writes custody or grants. `post` unchanged: exclusively `TAKEOVER_HUMAN_COMPOSER` with legitimate `TYPE|IME_COMMIT|PASTE|ATTACH|DROP|VOICE|SEND_ATTEMPT`, strict exact K/epoch/CAS, trusted in-process W24 Owner and real W44 transaction. Caller must GET → POST → GET and verify HUMAN + epoch increment; PENDING/409 not success.
2. `services/api/src/domains/identity-consent/takeover-assist.test.mjs`: 8 new independent tests driving **actual current W44 0eebe** `openEligibilityStore` SQLite and W24 original `IdentityConsentService`, not a fabricated custody stub:
    - W44 MODE_ASSIST direct persisted state and W24 GET ASSIST = HTTP200 (no 503); passive GET/selection/focus/view = no takeover
    - Real ASSIST → explicit Composer PASTE POST → W44 HUMAN → GET verified; B/C each remain AUTO, original independent CONTACT Grants and available budgets unchanged
    - 409 old custody epoch, consent epoch, duplicate/stale mode transition
    - wrong actor/account K and account revoked deny 409, no phantom HUMAN
    - post-revocation legitimate account relink increments bindingRevision; old full five-part K and old takeover token cannot be reused
    - W44 MANUAL is mapped to historical HUMAN wire state; ALREADY_HUMAN returns 409
    - W24 original HTTP synthetic route GET ASSIST → POST → GET HUMAN using native service
    - expired/revoked original operator authorization checker denying READ and POST prevents takeover; this is a **fail-closed injected authorization contract test**, not a claim that production token expiry was exercised.

No changes to W44, W43, W47, W46, Vue, Conversation DB, SDK, auth credentials, 44751 or 44767.

## 3. Real tests and CI sibling distinction

On DESKTOP-029FH47, Windows Node with current W44 Owner 0eebe, actual W25 and W46 test sibling roots:
- New W24 ASSIST tests: **8/8 PASS, 0 FAIL, 0 SKIP**.
- Full W24 original and new: **122/122 PASS, 0 FAIL, 0 SKIP** (pre-task 114/114 retained).
- W44 original unchanged: **65/65 PASS, 0 FAIL, 0 SKIP**.
- Original old PR32 W44 CI sibling that predates 3-mode APIs: **122 total / 105 PASS / 17 explicitly SKIP / 0 FAIL**; 8 new ASSIST tests and 9 prior typed mode tests skip *only because that exact old W44 lacks `switchMode/readModeState`*, never counted as verified W44 integration. W09/W30 needs to update the pinned CI W44 sibling to current exact Owner when integrating; W24 has NOT touched CI owner files.
- Exact new GitHub PR#17 HEAD hosted CI: report its actual result from the GitHub workflow, never infer PASS from Windows alone.

## 4. Genuine remaining cross-Owner gap

Existing W46 `apps/web/src/composer-bridge.mjs` on current W09-3 fixed 44751 source still restricts `assertStatus` to `['HUMAN','AUTO']`, and triggers POST solely `if(before.mode==='AUTO')`. Therefore, **even though W24 now returns valid `ASSIST` and supports ASSIST→HUMAN in a real W44 SQLite transaction, the old W46 Composer will mark ASSIST BLOCKED rather than initiate explicit POST.** This must be corrected only by W46 original Composer Owner in its exclusive source, with assisted branch `ASSIST` handled as eligible *solely on actual user edit* and same exact epoch readback. W24 must not encode ASSIST as AUTO, alter the existing Composer, or fake READY_HUMAN. W47 runtime actual request routing/authentication remains subject to W47 independent signed contract; no claim fixed 44751 user UAT is complete.

For W14 same SHA independent security re-sign:
- Verify change `takeover.mjs` only and new test file in original W24 Owner domain, exact full SHA and two-file diff.
- Repeat W44 current real SQLite ASSIST→HUMAN and B/C original Grants isolation, GET only/read focus no write, duplicate CAS 409, revocation/relink, unauthorized principal, expiry-denied hook and W44 old suite; verify no new sender and no grant escalation.
- Recheck W46 original source `assertStatus` and `userAction` explicitly; if unchanged, sign only W24 backend fix PASS and keep **UI ASSIST COMPOSER HOLD**.
- Do not allow W47 synthetic mode substitution or release until W46 and W47 independently sign user click → original W24 → W44 transaction → GET, then W09-3/W10 Chrome+Opera UAT with W14 independent source SHA verification.

## 5. Release facts and remaining gates

Live fixed 44751 at source inspection:
- Web SHA `706e934b983ad80da0132ab2ce84440f58975e68`
- API SHA `abc106ee18f425f99de26dafcf24e49c4779b399`
- preview_scope `NONPROD_NO_AUTH_NO_SEND`; no deployment or real account send in this W24 task.
Conversation pin/read/mute/archive/favorite/delete persisted DB Owner remains unassigned, **not part of W24 TAKEOVER code scope**, remains `UI_DISABLED_HOLD`. No paid model, Provider ACK, real personal login, credentials or live irreversible operations were touched.
