# W29 → W09-2｜Issue #61 Official TDLib JSON native Windows delivery receipt
DATE: 2026-10-26 | DEVICE: DESKTOP-029FH47 | STATUS: OFFICIAL_NATIVE_LIBRARY_ABI_PASS / USER_AUTH_WAITING / CHANNEL_INTEGRATION_HOLD

## Exact source provenance
- JOINT BASE: bb1be7bf070ceff39681b081b04754a4b4e34cc3
- W29 owner branch: owner/telegram-personal/issue-61-real-tdjson-20261026
- GitHub Draft review PR: https://github.com/wangyi198675-coder/yance-v2-greenfield/pull/66 (targets exact bb1be7b review baseline; NEVER main)
- OWNED SOURCE SCOPE: connectors/tdlib-json/** only. The exact *final* source SHA is the current HEAD on this Owner branch (verify git rev-parse HEAD or PR head SHA); do not substitute the pre-commit SHA.
- OFFICIAL UPSTREAM: https://github.com/tdlib/td.git ; TDLib VERSION 1.8.69; exact commit ea3f69ce11aef458bfbb09869b809ede4447486f.
- LICENSE: BSL-1.0, official LICENSE_1_0.txt SHA256 beb8e42e9d6b4284e03304d05a81a0755200a965fc8d0a5e0aea1e84cf805d6e.
- UPSTREAM DEPS: vcpkg source SHA 817892b0ecbc6af994dd6df999c73faf795adbf2, MSVC 19.44 / Visual Studio 2022 BuildTools / CMake, OpenSSL 3.6.5, zlib 1.3.2 and gperf 3.3.

## Official native binary actually built and loaded
Build command (from W29 isolated worktree): powershell -File connectors/tdlib-json/scripts/build-windows.ps1 -SkipDependencyInstall (vcpkg dependencies installed earlier by official vcpkg).
- Windows x64 official tdjson.dll SHA256: ae286549e2abc071acf67a3423468e8a5a8b488b4cdc368d6f203b2bf1d355e0
- Latest Windows native TDJsonHost.exe SHA256: 72ee2ea1015d37775fbb8f23c55d7ac1b6ad2d5c0eee3b276d2e18b5b63fad57
- libcrypto-3-x64.dll SHA256: 012ed20b740b018506b268121c7372a041c0118b7ae28ab6da6b121f5584d8e4
- libssl-3-x64.dll SHA256: b3ced74277fc7b3f5e0220c804ec0fe17feebf9b197dab984d853c4d184571f0
- z.dll SHA256: b42377e67c9541e5934044c5f189534c4e2b89c12c6f53ed9dcb725509455e31
- Actual runtime manifest: connectors/tdlib-json/runtime/tdjson-native-manifest.json, excludes source-control and account secrets, hashes official DLL, native host and all three linked DLLs.
- During first attempt DLL loader returned OFFICIAL_TDJSON_DLL_NOT_FOUND (exit31), even with tdjson.dll present; discovered missing transitive official z.dll and corrected build script. After correction official DLL ABI loads success. No faked PASS.

## Actual native Windows process and authorized-state API evidence
1. On real DESKTOP-029FH47, native TDJsonHost.exe --probe: official td_execute getTextEntities resultType=textEntities, loaded=true, exit=0, no client login. Node scripts/probe-native.mjs verified source and SHA256, status OFFICIAL_TDJSON_NATIVE_ABI_PASS, actual nativeHostPid=35268 on one observed execution and exitCode=0.
2. Host --probe-state: actual td_create_client_id, td_send getOption version and td_receive. Official updateAuthorizationState returns **authorizationStateWaitTdlibParameters**, exit0; client_id=1; authorized=false / credentialsSupplied=false / accountConnected=false / canSend=false. Real getOption version returned 1.8.69; no api_id/api_hash/phone/OTP/user account or TDLib database paths supplied.
3. After native log verbosity hardening, --probe-state emits only sanitized status, no TDLib DEBUG messages or private data.
4. Windows actual reload test launches TWO separate real native host processes, both hash-verified DLL td_execute calls succeed and terminate; real binary SHA mismatch copy is rejected.
5. Native exact tests: YANCE_W29_EXPECT_NATIVE=1 node --test connectors/tdlib-json/test/native-tdjson-actual-windows.test.mjs connectors/tdlib-json/test/native-tdjson.test.mjs => **10/10 PASS, 0 FAIL, 0 SKIP**. 3 real Windows native tests and 7 new trust/binary negatives, unlike inherited 27 original synthetic adapter tests. Without official installed native DLL the 3 positive tests are explicitly NOT_RUN, never fake CI PASS.

## Actual W29 platform glue, strictly no second sender
- C# thin official tdjson interface via native td_create_client_id/td_send/td_receive/td_execute, separate offline probe/empty native auth state / IPC worker mode. This is not a Telegram protocol implementation and no Bot API.
- Node src/native-tdjson.mjs: SHA-verified native host lifecycle, exact official updateAuthorizationState, optional user-driven phone/OTP/password/auth methods, actual getMe user id must be re-attested by W24 before peer mapping/Chat updates/real inbound or receipts; exit/re-auth invalidates current owner proof; no real login was performed.
- W54/W47 owns native authenticated renderer gesture/session; W55 owns protected new user credential/session reference, not V1 reused; W24/W44 own verified ChannelAccount+Peer current K, binding_revision+revocation epoch; W25 sole MessageDelivery/Outbox/attempt ACK/UNKNOWN, this adapter exports ONLY verified provider event callback ports, not real sendMessage; W45/W43 and W46 own translation/Agno replies/Composer. These are explicit interface requirements, **not evidence cross-Owner app/API/UI is already connected**.
- Restart tested OFFLINE ABI processes ONLY, not user account session persistence; no user account approval exists for testing login/recovery/real chats/real MID/real ACK. No app UI in this scope was edited.

## Remaining P0/P1 / truthful product state
- **WAITING_USER_AUTH**: User's separately authorized Telegram account, official api_id/api_hash, user-owned new protected credential and fresh session, user explicitly initiating login. No revoked/old V1 account restore. No unauthorized private data use, live sends or paid model calls.
- **INTEGRATED_STAGING_HOLD**: W54/W47 trusted first-party Windows UI/runtime wiring, W55 protected credential custody, W24/W44 real platform self-user/Peer mapping/consent and revocation, W25 original sole sender, W45/W43 translation and Agno, W46 clickable B+C UI not independently proven on joined source.
- **REAL_PROVIDER_ACK_NOT_RUN**: No legitimate live Telegram session/message/ACK; not a production connected channel or USER_DELIVERED.
- **SEC/LEGAL**: Telegram API terms and counterparty data/AI consent requirements remain independent legal and safety gate.
- **NO MAIN MERGE / NO LIVE 44751 REDEPLOY / NO REAL SOCIAL ACCOUNT / NO REAL SEND / NO OLD SECRETS**.

Acceptance on this Owner slice: OFFICIAL_NATIVE_BINARY_LOADED / OFFLINE_AUTH_STATE_VERIFIED; provider account+cross-Owner app integration remain HOLD.
