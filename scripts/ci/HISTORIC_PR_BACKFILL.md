# W30 historic PR HEAD source recheck — explicit nonproduction workflow

This CI-only source path does not change Domain Owner PRs, branches, artifacts or business code. The 5 domain checks, evidence generator and protected `nonproduction-merge-gate` remain separately authoritative.

## Activation

- Review the changes and [CI PR] hosted results against the exact W30 source HEAD. Squash-merge this CI-only change to main only if required nonproduction status checks pass.
- **One-shot launch**: create and push one non-Owner branch matching `ci/w30-backfill-run-20261025` from the newly merged main SHA. No old PR branches need to be mutated. The job also supports manual workflow_dispatch.
- The workflow calls the repository's current GitHub API /pulls endpoint at run time and tests every open *same-repository non-W30* PR's exact head and base SHA; no hard-coded old SHAs. Treat new PR #36 and changed #2 dynamically, rather than the 09:21 snapshot.
- Each source matrix job has **no checks:write permission**. It checks out immutable PR HEAD without persisted credentials, fetches trusted main CI scripts, runs contract/security, native Node, Agno Python no-key, M0 synthetic, frontend clean npm/build/audit, and, when present, Chromium browser checks. Real Windows local model, private accounts, provider ACK and cross-service M1 are not run.
- Tests and jobs can legitimately return RED. Evidence always lists actual SHA and each outcome. Failed, cancelled, or skipped required checks do not turn green. Audit files are retained for 7 days.
- Only isolated final publishing job receives GitHub Actions' ephemeral `checks:write` capability. It does **not** execute any PR source. It cross-verifies the matrix job's actual conclusion, original SHA in artifact, and current PR HEAD via the GitHub API before writing the `w30/exact-head-backfill` check at that exact commit.
- If any check failed or evidence is absent, it writes a **failure check**, not a fake success. If HEAD moves, reports stale HOLD and refrains from applying an old result to the new HEAD.
- This purposefully does **NOT** write a check named `nonproduction-merge-gate` or bypass branch protection. Once defects are repaired by responsible Owners, the original per-PR protected gate must independently pass. Do not auto-merge any W23-W29/W43-W46 business PR.
- No GITHUB_TOKEN, model key, social-account credential, or real user message is exposed in test input, evidence, PR comments or tracked files.

## Local test

```
node --test scripts/ci/pr-head-backfill.test.mjs
node --check scripts/ci/pr-head-backfill.mjs
git diff --check
```

Live results are authoritative only when the Github Actions run, artifact, and commit-linked check-runs are confirmed through the GitHub API.

## Incremental HEAD behavior

On each new run, the discovery job reads the current GitHub check-runs for the exact PR HEAD. It skips only completed successful `w30/exact-head-backfill` checks created by `github-actions` with a valid GitHub Actions details URL. A changed HEAD, failed result, wrong app, or absent check remains eligible for real testing. A zero-pending run safely skips verify/publish instead of generating synthetic green results. The protected `nonproduction-merge-gate` is never manufactured or bypassed.

## Event-driven automatic continuation

- On `pull_request_target` opened/synchronize/reopened/edited/ready_for_review, the **trusted default-branch workflow** scans current same-repository PR SHA heads and runs only missing or changed exact SHA test jobs. It does not trust workflow definitions in old Owner branches. Forked PR source branches are excluded from the candidates.
- A scheduled UTC `17 */2 * * *` sweep covers cross-branch PRs whose base branch is not main, as well as events that did not dispatch a PR workflow. No extra model fees; synthetic/no-key hosted contracts only.
- GitHub Actions' own `GITHUB_TOKEN` has at most read permissions in discovery and tests, and only `checks:write` in the isolated publisher job. The publisher never checks out untrusted PR source and only attests exact SHA after independent job-outcome, evidence-artifact and current-HEAD checks. No secrets or outbound platform sends.
- GitHub Actions scheduling is not a service SLA: report late/missed runs as NOT_RUN rather than claiming timely execution. Do not confuse this scoped check with independent security/legal or the protected `nonproduction-merge-gate`.
