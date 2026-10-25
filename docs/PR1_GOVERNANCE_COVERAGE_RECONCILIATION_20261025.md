# W09 governance Owner | PR #1 minimal reconciliation | 2026-10-25

STATUS: GOVERNANCE_SOURCE_STAGED / INDEPENDENT_OWNER_ACK_HOLD / EXACT_NEW_HEAD_SEVEN_JOB_CI_PENDING / NO_MAIN_MERGE / NO_DEPLOY.
Scope: PR #1 only, branch `governance/p3-autonomy-20261025`. PR #32 is a separate integration draft; no seven-file overlap can be claimed. Do not cherry-pick stale governance or duplicate CI into PR #32.

## Original seven-file immutable evidence (parent 0f4a1d3bc84e2d34c98036080dc84d0d3748c485)
| Path | Original Git blob SHA | Current governance-branch treatment |
|---|---|---|
| `.github/CODEOWNERS` | `4ca7f8aae5f4c0d4342d733ed43f4ac3eb29fb94` | KEEP AS COMMENT-ONLY, NOT ENFORCED; no fake maintainer appointments |
| `.github/workflows/greenfield-contract-ci.yml` | `0443893a5f9d68a60476b6697bb47da12f9892a7` | RETIRE from pending branch to prevent duplicate/obsolete CI after reviewing trusted main All-Domain |
| `docs/EXECUTION_AUTHORITY_20261025.md` | `71568337de7e35719ab95e391e6c83da2c2ff143` | KEEP with dated reality correction: active Git host/ruleset, Owner signoff still missing |
| `docs/OWNER_ACK_TEMPLATE_20261025.md` | `ae9888ece79f7de68338fac7b82ab0964c249cb2` | KEEP; recipient must personally accept, no proxy signature |
| `docs/SOURCE_OWNER_DISPATCH_AND_ACCEPTANCE_20261025.md` | `a93971100ad2fcb3fd29b5ebb625dff031751ea0` | KEEP; W23–29, W43–46 are task roles, not verified GitHub actors |
| `docs/SYNTHETIC_VERTICAL_SLICE_ONE_20261025.md` | `ed6705e83b72ad4bc80fad13a8cb66a220e8c050` | KEEP as nonproduction plan; no live send or production authority |
| `scripts/verify-governance.cjs` | `1a69418c3965c6d20811f33ef9018406b5dcfa1a` | KEEP as OPTIONAL local staged-governance guard, update to avoid nonexistent legacy CI prerequisite. It is NOT one of the seven mandatory hosted jobs and does not verify owners/ruleset |

Historical PR #1: https://github.com/wangyi198675-coder/yance-v2-greenfield/pull/1
Original commit: https://github.com/wangyi198675-coder/yance-v2-greenfield/commit/0f4a1d3bc84e2d34c98036080dc84d0d3748c485
W09-2 exact file-blob comparison: `COORD_AGGREGATE/W09_20261025_PR1_2_3_21_W43_36_39_INDEPENDENT_SOURCE_RECONCILIATION.md`; seven original files absent from PR #32 at `2cdb912ee000aaddcf2c197bf0bfaf2e8ebca173`. PR #1 is NOT superseded, NOT merged, and remains separate Draft.

## Verified Git host and current trust boundaries

- Repository `wangyi198675-coder/yance-v2-greenfield`, PUBLIC. Authenticated linked principal `wangyi198675-coder`: admin; this is **not** verification of individual independent domain-maintainer acceptance. PR #1 has no submitted formal PR review.
- Real GitHub ACTIVE branch ruleset `25802843` targets default `main`: require PR; prevent deletion and non-fast-forward; require check `nonproduction-merge-gate`. BUT `required_approving_review_count=0`, `require_code_owner_review=false`, `required_review_thread_resolution=false`, and `strict_required_status_checks_policy=false`. Therefore technical protection ACTIVE; independent human approval NOT ENFORCED.
- CODEOWNERS has only comments, **zero effective ownership patterns**, and no independently confirmed W23–29/W43–46 principals, ACL scopes or human `I accept` ACK. Do not assign virtual window IDs as GitHub owners.
- The trusted current main workflow is `.github/workflows/yance-v2-all-domain-ci.yml` Git blob `2f4b02d04a784fb9e7bfed51324522985d60ec83`, with contracts-security, native-node-contracts, agno-python-native, synthetic-m0-contract, frontend-chromium-synthetic, exact-source-evidence, nonproduction-merge-gate. It supersedes the legacy **technical contract/prototype testing workflow**; it does NOT prove real Owner consent or run the historical governance guard. No change to that workflow or ruleset is authorized in this task.
- Historical PR #1 Greenfield CI run `40146790077` SUCCESS on its old source scope, **not** seven-job current gate. PR #32 run `40179723025` SUCCESS with 7/7 named jobs on its earlier exact `2cdb912ee000aaddcf2c197bf0bfaf2e8ebca173`; it is not PR #1's CI or an Owner approval.
- Pending PR #1 updated HEAD must receive **its own** actual PR-triggered hosted All-Domain seven-job run, validated by W30 at exact new SHA; each `NOT_APPLICABLE` domain remains explicitly not tested, not converted to native PASS.

## Admission matrix and holds

| Required gate | Evidence / status |
|---|---|
| Governance source in appropriate existing governance branch | STAGED, separate PR #1; no PR #32 overwrite |
| Original seven blobs, provenance, review evidence | RECORDED above; original commit unchanged |
| Real maintainer identity, permission per scope, and self-signature | HOLD: obtain real human principal `REVIEW_ACK`, independent reviewer, exact allowed paths and exclusions |
| Branch protection requires separate Owner review | HOLD: ruleset currently allows 0 approvals and does not require CODEOWNER review; do not modify settings without authorized maintainer/admin decision |
| Historical CI retirement | SOURCE_PATCHED on PR #1 only; current seven-job All-Domain untouched |
| Optional local governance guard | Checks staged files and unsigned CODEOWNERS; no proxy approval, not a hosted mandatory job |
| New exact-HEAD seven-job GitHub CI | PENDING until hosted run and W30 independent receipt |
| Merge approval / production | HOLD, absolutely no main mutation, provider message, private credential, paid model, production DB or deployment |

Owner next action: real responsible maintainers personally provide GitHub principal, repository permission and precise path scope, excluded files, individual acceptance and independent review; Git administrator explicitly decide whether to require >=1 review/CODEOWNER review while preserving existing nonproduction-merge-gate. W30 independently verifies new PR #1 exact-head seven-job CI. W09-2 reconciles this governance branch with PR #32; never claim PR #1 source is physically inside PR #32 merely because both PRs have CI.
