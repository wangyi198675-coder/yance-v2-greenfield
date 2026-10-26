# W29 → W09-2 / Issue #61 — official TDLib JSON native Windows implementation

Status: **SOURCE_DELTA_IMPLEMENTED; REAL_NATIVE_DLL_BUILD_PENDING; WAITING_USER_AUTH; NO_CHANNEL_ONLINE.**
Date: 2026-10-26. Authorized nonproduction machine DESKTOP-029FH47.
Owner scope strictly connectors/tdlib-json/**. Base exact merged W09-2 integration source: bb1be7bf070ceff39681b081b04754a4b4e34cc3.

## Pinned OFFICIAL upstream (not Bot API)
- Git origin: https://github.com/tdlib/td.git
- Official source commit: ea3f69ce11aef458bfbb09869b809ede4447486f (official upstream HEAD captured on 2026-10-26; project VERSION = 1.8.69).
- License: Boost Software License 1.0, official LICENSE_1_0.txt SHA256 beb8e42e9d6b4284e03304d05a81a0755200a965fc8d0a5e0aea1e84cf805d6e.
- Build isolated in connectors/tdlib-json/.native-build; W29 separate Windows BuildTools 2022 + upstream vcpkg commit 817892b0ecbc6af994dd6df999c73faf795adbf2. No modifications to repository root lockfile, main, W47/W24/W25 source or production.
- Official upstream source checkout exists and SHA verified; the Windows DLL/manifest sha will only be recorded after real build; not to be guessed.

## Actually written code
1. native/TDJsonHost.cs: tested Windows x64 .NET Framework C# native P/Invoke host to official tdjson.dll exports td_create_client_id, td_send, td_receive, td_execute. Has offline --probe requiring real DLL; --worker exposes OFFICIAL authorization updates/event stream over private child stdin/stdout; denies sendMessage, Bot API and all non-whitelisted TDLib methods. W54/W47 must only spawn worker after a separately verified user-originated session gesture; --probe never starts a Telegram login. Actual C# compilation succeeded.
2. src/native-tdjson.mjs: verifies exact expected upstream and SHA256 of native DLL/host manifest before any worker spawn. Actual offline TDLib ABI probe with no login. Requires injected trusted W54/W47 user gesture, W24 channel owner/peer verifier, W25 receipt verifier. Real updateNewMessage can only reach W45 after full current K; real updateMessageSendAcknowledged/Failed/Succeeded is passed to W25 only after attempt attestation. Requests are limited to official auth and read-only contact/chat, and real getMe response must bind account user ID; there is no new physical sender/Outbox.
3. scripts/build-windows.ps1: pins upstream source commit, verifies license, uses MSVC/CMake and officially vendored vcpkg dependencies (OpenSSL/zlib/gperf), builds only tdjson, native Windows host, per-binary manifest and transitive DLL hashes. Runtime artifacts excluded from Git in .gitignore.
4. test/native-tdjson.test.mjs: nonproduction trust/negative tests, separate from inherited 27 synthetic TDLib tests.

## Required other Owner injection (do not impersonate)
- W54/W47: verified Windows native user session / explicit Telegram login gesture / protected IPC; never use localhost origin, plain renderer flag or fake principal as identity.
- W55: credential custody / new explicitly approved TDLib database path, local OS protected encryption key and API ID/hash provided only by the authorized user. Do NOT inspect/restore V1 credentials or create a second Vault.
- W24/W44: real Telegram ChannelAccount provisional login intent and post-getMe verified Telegram userId; current exact K, chatID-to-peer, binding revision, account/session revocation and lawful AI data Consent. Must fail closed without current identity.
- W25: sole MessageDelivery/Outbox, pre-network requalification, attempt+ACK/UNKNOWN/late outcome. No W29 direct sendMessage. W29 only returns authenticated official TDLib update DTO for W25 to settle the original attempt.
- W43/W45/W46: authorized inbound becomes translation, Agno 0–3 sourced suggestions and existing unique Composer; this W29 source does not modify or bypass their code.
- W09-2: stage a separately reviewed cross-Owner join rather than publishing current live fixed port 44751.

## Proof and denial rules
- Live provider login / getMe stable userId / real chatID / actual inbound and native Provider ACK remain **NOT_RUN / WAITING_USER_AUTH** until user explicitly authorizes the specific Telegram account and valid legal testing.
- Under no circumstances call C# TDJsonHost.exe --worker via a public web endpoint, fake Owner claim or fake proof. The minimal host has no unauthenticated public TCP/HTTP listener; parent process must verify W54 and W24 first.
- To start without login: build TDLib and call Node probeTDJson(runtimeDir) with current pinned manifest, then assert native_tdjson_probe result via official td_execute. This proves ABI only, not account authorization.
- Existing previous synthetic 27/27 tests remain inherited; DO NOT conflate with native binary loaded or real contacts.
- Source/CI proof, binary proof, native worker running, legal account auth, real W24 K/W25 ACK and nonproduction UI delivery are separate acceptance gates.

Final channel status until all missing real evidence: **WAITING_USER_AUTH + NATIVE_RUNTIME_BUILD_HOLD** (do not claim ONLINE, Provider ACK, or USER_DELIVERED).
