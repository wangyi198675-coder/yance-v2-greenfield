# W47 minimal native model setup (2026-10-26)

Base W09-2 e352180cba665b56b35822fa2aff2c7525360016. W47 only services/api/runtime/**. Highest rules: docs/PROJECT_HIGHEST_EXECUTION_RULE.md; GitHub Issue #61 W09-2 correction.

Normal launch without Session:
- GET /api/v2/local-session/status returns requiresTerminalPair:false, canConfigureModels:true. This describes the local app's readiness, not any social account.
- GET /api/v2/private-brain/model-config returns status OPEN_LOCAL_MODEL_SETTINGS, authoritative:false, three public provider descriptions, no private selection, keys or user paths, no paid execution.
- GET /api/v2/private-brain/model-catalog unchanged.

Original private routes remain unchanged: real Session + CSRF for POST model-selection and turn; original W54 native user, W55 WinCred, W43 original Agno and durable History request ledger. Fake cookie 401, wrong origin 403, missing native source never yields paid permission. No social send or account login.

W46 Owner minimum change: hide ordinary BCLocalSessionConnector terminal pair UI; read public setup independently from authoritative current-user model config. Model selection and PRIVATE send are enabled only from original true native current-user configuration and W43 model. No alternate Composer/Agent.

W54 Owner minimum change: use already present Windows NativeProfileAuthority + SessionAuthority and WebView2 cookie store to start original W47 native session automatically in background. No additional login UI, signing platform or actor claims from localhost. Logout and app close revoke. W55 native Key entry remains native-only; no billable model without user's own Key and approval.

Evidence must distinguish public no-model setup from actual Agno Run and W46 GUI; source PASS is not USER_DELIVERED. This commit never installs 44751, logs keys or initiates charge.
