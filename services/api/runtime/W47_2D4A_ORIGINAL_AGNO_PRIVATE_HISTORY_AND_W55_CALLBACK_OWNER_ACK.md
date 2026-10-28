# W47 原生 PRIVATE HTTP / Agno 3.1.10 最小接线（2026-10-26）

Based on W09-2 joint `2d4a0917c24c898285a53543eff3fe6d43bb3abc` and original W43 `210b17b278dd1b1818561cccaf61e1f1e3e45b58`. Rule `docs/PROJECT_HIGHEST_EXECUTION_RULE.md`. Changes only original `services/api/runtime/**`, no extra Agent, database, login, publisher or credentials store.

## Actual W47 source fixes

- Node↔original W43 `private_principal_port.py` Python child is forced to UTF-8 on Windows. Before fix, Chinese prompts raised `UnicodeEncodeError` inside the native request-identity path, surfacing as `DURABLE_REQUEST_FENCE_UNAVAILABLE`. Original W43 SDK/SqliteDb/ledger implementation remains unchanged.
- With no configured model: server-scoped verified Principal emits `modelBackend:'unconfigured'` rather than silently selecting Qwen3; `POST /api/v2/private-brain/turn` returns `503 MODEL_SETUP_REQUIRED` BEFORE querying model eligibility or opening ledger; `GET /api/v2/private-brain/history?threadId=personal` uses original native Agno `SqliteDb` even if no local model or cloud Key and no local plaintext key file. Original Python process was actually launched and cold-start History read verified.
- Normal configured local Qwen3 calls SAME original W43 `Agent.run`, original W43 SQLite/durable request ledger, same signed model provenance and runs; model selection is not a browser-supplied actor/path. Original W43 Python output and Run IDs must be verified before HTTP200.
- Cloud is optional independent of Qwen: Node `createW43PythonPrivatePort({resolveNativeCloudSecret})` accepts a **server-native-only W55 callback** `({verifiedClaim,provider,modelId}) => Promise<string>`. W47 invokes only for matching current selected model and current local Session revision, explicit paid approval and `cloudSecretMode:'W55_NATIVE_CALLBACK'`; receives the credential inside the original child-only stdio protocol. W43 original `cloud_secret_resolver` consumes it in the official Agno OpenRouter/OpenAI SDK; no HTTP fields, browser keys, plaintext files, second model executor or fallback provider. W55 original WinCred/DPAPI owner supplies this callback; W47 does not persist it. Browser/local fake claims never enable it.
- A configured, original W54-native model claim with OpenRouter/OpenAI can be used as the one selection authority when separate `resolveSignedModelSelection` callback is absent: it must still carry selected model/provider/selectionEpoch/current-native-principal + W55 protection/fee approval before W43. Missing and revoked model credentials return accurate setup/unavailable status, not a generic 500.
- W24/W44/W25 sole outbound gate unchanged; normal PRIVATE QA has `canSend:false`.

## Genuine real Windows SDK evidence, not mocked replies

Original authorized localhost llama.cpp Qwen3 service actually running at `127.0.0.1:11605`, using its already existing protected local API authentication. W47 run entered through real Node HTTP POST, W43 original Python subprocess and Agno SDK; first prompt about fictional `蓝色海鸥` and second question about the same fictional label BOTH completed; returned exact original SDK Runs:
- Run1 `c23d459e-befc-3501-cbf8-b73339897530`, reply `蓝色海鸥的虚构标签已记住。`
- Run2 `cc9df24d-0c93-278c-a646-f6fb44125a3b`, reply `蓝色海鸥。`
- Same official Session `w43-private-session-84b2bb2531f948dd5309a77abfdffcc00545b85605b4ceef7cff43239c676092`; original native Agno History `completeTurnCount=2`, `runCount=2`; new Python child cold-history recovery PASS; deselection to no model preserves two turns; subsequent POST returns `MODEL_SETUP_REQUIRED`; 0 cloud charges and 0 social sends.
- This actual user-origin Qwen3 test uses a **test-only Native Session created inside the isolated Node test process**, not a W54-installed officially authenticated WebView session. No real user contacts/identity, no private data; only fictional prompts. Do not claim final Windows GUI interactive PRIVATE turn from this.
- W55 callback test used a synthetic NON-BILLABLE key to construct original W43/Agno OpenRouter model over actual Node↔Python private IPC and native W43 SQLite ledger; 0 external model requests; does NOT prove actual user WinCred retrieval or paid OpenRouter answer.
- W43 source includes real existing Agno Tool API but no newly authorized external tools in this turn; do not count historical synthetic tool fixtures as current external tool execution.

## Minimum app-owner follow-through (no new architecture)
W54: hook its existing user-local NativeProfileAuthority / SessionAuthority / WebView2 CookieStore automatically to the already-existing W47 `createLocalSessionAuthority.issueNativeWebView`, with no terminal pairing, no repeated user login, no new certification service; make normal B+C issue PRIVATE Turn and History. W47 code remains safe when W54 native source absent (401/503).
W55: deliver existing protected WinCred/DPAPI current-user secret to `resolveNativeCloudSecret` over native callback; never expose it through browser and do not charge without own-user selection.
W43: original Agno SDK+ChatHistory already exist; no W43 source changes in this W47 delta.
W09-2: cherry-pick exact scoped W47 Owner SHA to a NEW isolated latest joint tree, run this REAL local test and installed WebView B+C click after W54/W55 callbacks, then independently promote using already-proven 44751 rollback method only with user authorization. Keep PUBLIC setup no pair from W47 14996d2.

No fixed44751, old47182, main or production deployment touched. Overall real backend two-turn yes; installed user PRIVATE UI completion still HOLD.
