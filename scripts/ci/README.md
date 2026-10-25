# YANCE V2 domain CI — actual scope, no false green

The runner executes `scripts/verify-evidence.cjs` on **every PR** (252 stable IDs, 100 UIE and frozen hashes). `run-checks.mjs native` discovers checked-in `*.test.mjs` under all real source domains and runs them. If native source exists without tests, the gate fails. `agno-python-native` installs only the pinned official Agno development test requirements and runs pytest if the Agno files exist. `synthetic-m0-contract` runs native checked-in M0 tests if present, and prints **NOT_APPLICABLE** otherwise. This is not an actual provider business chain.

If the B+C isolated frontend exists, the workflow runs a fresh npm ci, TypeScript, Vite, source vendor SHA checks, npm audit, and a new Playwright Chromium DOM smoke with screenshots in the artifact. **Do not use `npm test` old W39**, because it expects an ignored `test-output/W39_CHROME_UAT_RESULTS.json` absent from a clean checkout; don't fake history by copying the file. W46 should replace that self-test with a checked-in deterministic test suite as an independently reviewed source delta.

Jobs are read-only on GitHub-hosted Linux, no credentials or social accounts. Windows WebView2, real IME/DPI, native Tauri Toast and human UX still need isolated Windows testing with exact SHA, not use the real logged-in desktop as a public PR runner. The browser job is a synthetic smoke test, not independent W40/41/42 signoff.

Mandatory check name after actual green run: `nonproduction-merge-gate`. Only set this as required main rule after it genuinely exists and succeeds on the remote runner. No blanket auto-merge and no magic owner approvals.
