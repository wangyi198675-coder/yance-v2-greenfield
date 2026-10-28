# W09 5fff continuation scoped model QA evidence — 2026-10-28

STATUS=QA_ONLY_NOT_INDEPENDENTLY_SIGNED_NO_RELEASE
EXACT_BASE=5fff8125f9e02ae1dc93ef2bf6cb1733cb06e854
EXACT_MODEL_SOURCE=fe3b56b
PR121_SOURCE=38d7d87b6b98a068b132dc9c8e81ce5dbaadd1fc
FIXED_USER_ENTRY=http://127.0.0.1:44751/
QA_API_ENTRY=http://127.0.0.1:48371/
QA_WEB_ENTRY=http://127.0.0.1:44871/

The approved original Web base strict Vite build exited 0 before the model delta.
Model integration is 17 narrowly enumerated source/tests files on this exact base; no Messenger, WhatsApp, Page, notifications, native Tauri, Agno or MessageDelivery source is rewritten.

Current local model routing tests: 15/15 PASS.
Explicit isolated localhost QA endpoint: untrusted GET /api/v2/model-routing returns HTTP 401 CURRENT_USER_SESSION_REQUIRED and canSend=false.
The full Web test suite has one legacy compact-channel assertion failing on pristine 5fff too; retain as baseline RED. This QA scope does not turn that result green.
No ChatGPT OAuth, real provider inference, paid model charge, social send, Windows installer or installed W54 identity is certified here.

The extra Vite gate is deliberately named W09_MODEL_CONT_QA_ONLY and cannot be enabled by the formal production release environment. Independent source/security owner signature, current Web/API exact-SHA build, browser tests, approved source review and real user grants remain required before any fixed 44751 cutover.
