# W09-3 | W05 official native notification + W43 original Agno Run notification bridge

Date 2026-10-28. EXACT BASE d3d6274f8db11d8ddb8f767a63dee7ee02b2b755.
Legacy OWNER original W05 reviewed source: ac6b635bfe210772f5b0fb5c1a9c3404736a7bde (old ChatterMate).
Original native W54 source reused; no new sender, event framework, password vault, local preference DB, model or Agent.

Native Rust: tauri-plugin-notification =2.6.0 cached official, matches original W05. Tauri registered on original Builder after SessionAuthority. Per existing exact native current-user W54 window capability, only notification:is_permission_granted, request_permission and notify. No remote unknown Origin, no provider send grant. Existing API child, OS principal generation, cloud key authority, Webview2 cookie remain unchanged.

Web: original native-host port convention globalThis.__TAURI__.core.invoke; current-user session_status MUST report nativeOsVerified=true, nativeSessionActive=true, canSend=false. No OS test Toast without granted plugin permission. Visible user-click-only test uses STATIC private safe title and silent body, no contact info, NO claimed delivery. Browser cannot call real native IPC. Windows OS notifications for legacy com.yance.desktop are disabled (old app Enabled=0); no automatic OS setting change.

Agno: existing W43 POST /private-brain/turn returns original verifiedTurn receipt. We only attempt optional background notification AFTER re-reading original persisted Agno History and verifying assistantText, a real COMPLETED Run ID and no replay. Same generic private content-free message. No new AgentOS polling. Frontground never sends OS notice; closed browser/worker cannot be woken without installed native client. Existing Grant / native profile checks unchanged.

Tests: node w09-w05-native-notification.test.mjs 6/6 + existing notification center 3/3. Vite original W46 build passed. Real independent Chrome original Web 1360/950/430/360 PASS with no horizontal overflow and no false desktop controls. Windows Rust cargo check --offline PASS 1m50s, pinned official tauri-plugin-notification 2.6.0; source-only build proof, NOT NSIS install / live OS Toast.

Future actual Windows installation test requires complete web-first release and user-approved installed release, OS notification opt-in, event-source actual inbound account approval, real MID authorized message and click recheck. Do not mark true Windows Toast or chat notification as delivered based on source test.