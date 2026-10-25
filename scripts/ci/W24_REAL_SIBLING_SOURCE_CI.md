# W30: W24 native HTTP test with real PR32 and W46 Git sibling sources

Nonproduction and test-only. Scope of modification: `scripts/ci/**` plus the **native-node** job in `.github/workflows/yance-v2-all-domain-ci.yml`. No W24/W44/W46 business files changed.

## Observed blocker
At W24 PR #17 HEAD `e10f9e17988fa19c4dc71ce927e5d9eaa01dbdc9`, GitHub run #40158874138 aborted `takeover-http.test.mjs` because `YANCE_PR32_ROOT` was unset. Tests later also require `YANCE_W46_ROOT`. Do not label this business authorization PASS or bypass the real tests.

## Reproducible native test dependencies
The native runner detects W24's checked-in `takeover-http.test.mjs`. Only then it performs Git remote full-SHA lookup and verifies an immutable public same-repository Git fetch for:

- `integration/m1-native-source-composition-20261025` -> `YANCE_PR32_ROOT`, requiring `services/api/src/domains/grant-custody-budget/native-bridges.mjs`.
- `w46/bc-native-composer-20261025` -> `YANCE_W46_ROOT`, requiring `apps/web/src/native-takeover-port.mjs`.

Temporary detached Git worktrees are used only for Node contract tests, cleaned up in `finally`. Every test still executes; a missing ref, moving ref, import path or failed assertion is a real RED, not a synthetic PASS. The evidence JSON lists the actual real sibling source SHAs for re-run/review. Source test execution remains on nonproduction test fixtures only.

## Local actual-source verified
W24 PR17 HEAD `e10f9e1`, PR32 HEAD `fce488b`, W46 PR21 HEAD `87ef821`: 42 native tests PASS when actual sibling roots are supplied. Then a separate W30-source runner successfully detected, fetched and mounted current exact sibling SHA roots automatically, producing PASS on the exact W24 HEAD with no manual root env overrides.

Hosted Github Actions on W30's CI-only PR and then updated W24 PR17 must be checked independently. The published backfill success check only certifies scoped nonproduction source contracts. The original protected `nonproduction-merge-gate` must report its own result. No M1 provider integration, Windows model, paid API or real account authorization is attested.
