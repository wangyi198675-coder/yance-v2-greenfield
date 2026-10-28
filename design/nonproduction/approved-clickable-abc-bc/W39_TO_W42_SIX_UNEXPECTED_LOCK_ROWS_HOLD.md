# W39 -> W42 | npm lock precise unforeseen transitive rows HOLD
2026-10-24, P3-1 W39 actual same-isolated-branch incremental lock experiment.
Source baseline: a96b4ded8c74bd66ff175682a0da375e5924dc7d. W42 incremental PREIMPORT_DELTA_ALLOW was signed in `PREIMPORT_DELTA_TO_W39_W09.md` with CSV SHA256 `8287614bdf28e28fd51eb994037f351adbd9e74110fa0f9ec48409c1dc4c9e60` and grants ONLY Vite 7.3.7, esbuild 0.28.1, 26 esbuild platform metadata changes.
Actual `npm install --package-lock-only --ignore-scripts --no-audit --no-fund --save-exact` regenerated package-lock, but `node W39_LOCK_DIFF_GATE.cjs` returned exit2 for **six unexpected newly resolved optional WASM nested dependencies**:
- `node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules/@emnapi/core@1.11.1`
- `node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules/@emnapi/runtime@1.11.1`
- `node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules/@emnapi/wasi-threads@1.2.2`
- `node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules/@napi-rs/wasm-runtime@1.1.4`
- `node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules/@tybys/wasm-util@0.10.2`
- `node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules/tslib@2.8.1`.
All six are newly pinned entries, *not* allowed by 28-row exact W42 grant. They were only produced by lock metadata resolution; **W39 HAS NOT INSTALLED UNDER THIS NEW LOCK NOR CLAIMED SRI**. Source diff evidence: `W39_RED_LOCK_DIFF_LOG.txt`, `evidence/W39_W42_NPM_LOCK_EXACT_DELTA.json`.
W42 please independently review minimal these six precise versions/license, whether legally allowed optional metadata-only and correct npm lock integrity; issue signed **incremental 6-row ALLOW/HOLD** OR exact tool command generating lock exclusively under prior allowed entry types. W39 will not run npm ci or finalize upgraded lock until that response. No CLI --force or extra UI libraries.
