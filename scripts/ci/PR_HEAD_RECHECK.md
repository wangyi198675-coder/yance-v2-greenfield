# W30 | Existing PR exact-HEAD CI recheck (nonproduction)

- The previous `workflow_dispatch` on main could run tests against `inputs.target_sha`, but GitHub still attached its checks to **main**, not to that old PR HEAD. Never describe dispatch results as PR checks.
- For `pull_request` events, every CI source checkout now explicitly uses `github.event.pull_request.head.sha`. Trusted CI scripts still come from main, with no stored credentials in the source checkout.
- After this CI workflow reaches main, use a benign PR **body metadata edit** to cause a `pull_request: edited` event on an already-open PR without writing to its owner branch or changing its business code. Do **not** force-push, close/reopen, or move Draft state to trigger CI.
- The 5 scoped source gates remain mandatory: immutable contracts/security, native Node, Agno no-key Python, M0 contract, and Chromium UI. The new evidence step is mandatory too and the existing protected `nonproduction-merge-gate` still requires all six successes.
- A PR event binds checks to the corresponding PR HEAD. Audit with GitHub's `/repos/{owner}/{repo}/commits/{head_sha}/check-runs` endpoint; verify `head_sha` for every item. Fetch artifacts `ci-exact-source-evidence-<run-id>` and the job summary, which record exact tested Git SHA and job outcomes.
- For a dispatch event, `checkAttribution=DISPATCH_RUN_ONLY_NOT_PR_HEAD_CHECKS`, even if every scoped job passes. Not-applicable scopes, synthetic contracts, local-model tests and real Windows/provider integration remain separately identified.
- The Agno job excludes only explicitly tagged `local_model` tests on Linux, never removes those tests. Protected Windows llama.cpp tests and true Qwen3 inference remain local HOLD until separately signed.
- Do not merge domain Draft PRs, use any production key, send real messages, connect real social accounts, or claim full native M1/M2 merely because synthetic CI succeeded.
