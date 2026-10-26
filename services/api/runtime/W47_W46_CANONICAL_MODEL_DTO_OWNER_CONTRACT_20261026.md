# W47 ↔ W46 single PRIVATE model DTO / minimal owner contract
2026-10-26. Based only on W09-2 exact 24d74be3309df81122acd82affd9099c853661da, W43 native ff476587a7ffcc912551b4644ebac61155105c98, W46 original cf929000c24dc721e1008cf8459ebc9049e923a4, W47 parent 41c9a09bdb6c4124ffc979fac3a250d1079570c1.

## One canonical PRIVATE model availability and selection REST surface
1. GET /api/v2/private-brain/model-catalog remains public **provider discovery metadata ONLY**, {ok:true,providers:[{provider,displayName,requiresUserApiKey,requiresLocalModel}],authoritative:false,actualAvailability:'CHECK_AUTHORIZED_MODEL_CONFIG',canSend:false}. Never use as availability, readiness, authenticated model list, price or key status.
2. **GET /api/v2/private-brain/model-config** is the ONLY authenticated authoritative model list and selected-state read. Requires original valid local Session + original W54 true server-only profile + W55 protected credential status + exact W43 Agno capabilities + W54 signed protected model settings. Missing session401, no owner bridge503, no fictitious signed false-ready. Success JSON fields:
   {ok:true,authoritative:true,canSend:false,providerAuthorized:false,credentialsExposed:false,
    secureCredentialStorage:false,
    selectedProvider:'OPENROUTER_USER_API'|'OPENAI_USER_API'|'LLAMACPP_LOCAL_QWEN3_8B_FREE'|'',
    selectedModelId:string|'',
    models:[{provider,modelId,configured:boolean,available:boolean,
      keyRequired:boolean,billingNotice:string}]}.
   models are the intersection of original W54 sources, W55 per-provider secured key status and W43 original {provider,modelId} capability; a merely advertised provider is never an active model. A stored selection that is expired/unavailable is represented by empty selectedProvider/selectedModelId rather than claiming usable.
3. **POST /api/v2/private-brain/model-selection**, exact JSON {provider,modelId}, original same-origin valid HttpOnly Session plus X-Yance-CSRF, W43 selected-provider + model capability and explicit paid billing approval, W55 valid protected user-owned credential (if cloud), W54 durable native config CAS. On success return exactly same authoritative DTO shape as GET /model-config and require W46 to GET again before believing it. No silent model fallback or browser-selected key.
4. **POST /api/v2/private-brain/credentials does NOT exist**. Browser must NEVER POST paid raw OpenRouter/OpenAI Key into this localhost API. Current W55 crate 34dbb916702023ee29afd963e37d2ec6e6163bd8 is SEALED fake-only, so secureCredentialStorage:false and no storage success. W55 original owner must implement a reviewed Tauri native UI-host-owned confidential credential input/lease, then coordinate a separately approved native-only key setup command. No JS/localStorage/bundle/plaintext HTTP/log URL tokens.
5. PRIVATE turn/history remain exact W43 {threadId,text,requestId}, GET ?threadId=personal. The ONLY Provider IDs are W43 genuine runtime outputs: OPENROUTER_USER_API, OPENAI_USER_API, LLAMACPP_LOCAL_QWEN3_8B_FREE; do not mix W46 previous OPENROUTER/OPENAI_API or W47 previous lowercase openrouter/openai/local. Actual PRIVATE completed Agno run must return {status:'COMPLETED',assistantText,runId,sessionId,modelProvider,modelId,threadId,requestId,qualityQualified:false,canSend:false}. Original Agno SqliteDb and NativePrivateRequestLedger remain sole history/fence; W47 validates selected provider/model exact match to original W43, no fabricated completed receipt.
6. W47 real server still injects NONE of unsigned W54/W55/W43 model native callbacks and no real cloud authorization. 401/503 is correct. W09 must NOT advertise C_8EB7314 or 44760 as usable paid cloud.

## Exact minimal W46 Owner-only diff request
- In apps/web/src/private-brain-ui-contract.mjs: set PRIVATE_ROUTES.models to /api/v2/private-brain/model-config, remove PRIVATE_ROUTES.credential and endpointBody credential allowlist. Update SAFE_PROVIDERS to the THREE exact W43 IDs above. Keep existing source modelCatalog authoritative verifier and verifiedTurn/History checks; they now accept W47 signed DTO after this minimal enum/path delta.
- In apps/web/src/BCPrivateBrainWorkspace.vue: update providers[].id exact strings; completely remove old saveKey() / secret ref / API Key input and any POST /credentials. Credential setup belongs to W55/W54 native official protected action only after its Owner signs. Existing no-pair UI, single BRAIN, Composer, W43 history recovery and user model choice logic must remain untouched.
- W46 Owner must run 89/89 inherited tests, update only impacted contract tests; W09 then runs explicit Chrome GET signed W47 config, POST choice, GET authoritative selected, refresh and W43 no-local Cloud native E2E. No signed W54/W55 actual model port => honest empty/unavailable, not green real selected.
- W47 Owner only services/api/runtime/**; W54 apps/windows/**; W55 packages/credential-custody/**; no cross owner files edited or independently self-signed. W54 signed authenticated native app-launch remains separate P0 prerequisite.

## Security negatives for W09 cross-owner exact join
- Cross-site Origin403, Sec-Fetch-Site blocked, local browser without Session401; cookie spoof/revoked Session401, invalid/missing CSRF403.
- Authenticated but no W54/W55/W43 native producer503, no false model ready; POST credentials404, public catalog not an authoritative model list.
- Model status output never contains API Key, secret handle, disk path, or model expense authority; no paid SDK call without W55 leased user Key + signed W43 billing.
- W43 provider mismatch, mixed W46 old ID, invalid modelID, incomplete original Agno Run fail closed; not silently local fallback.
- Private chat/local Session NEVER grants real social ChannelAccount/Peer/Grant/Budget or W25 outbound; current canSend=false and connected accounts0.

Gate: W47_OWNER_CANONICAL_DTO_SOURCE_PASS only after exact SHA tests; W46_OWNER_COSIGN_PENDING; W54_NATIVE_HOST_AUTO_SESSION_PENDING; W55_REAL_PROTECTED_API_KEY_PENDING; W09_44760_REAL_SIGNED_PROVIDER_CLOUD_E2E_HOLD; 44751_C remains untouched.
