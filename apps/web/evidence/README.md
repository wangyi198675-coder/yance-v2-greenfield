# W46 real Chrome UAT screenshots — synthetic-only original B+C page

These are screenshots from real installed Windows Google Chrome launched headless using the **compiled approved original B+C page with W46 scoped replacement of its ONE CONTACT Composer**, not generated artwork or browser mocks.

- \`W46_ORIGINAL_BC_360_light_CHROME.png\` mobile.
- \`W46_ORIGINAL_BC_950_dark_CHROME.png\` responsive.
- \`W46_ORIGINAL_BC_1360_light_CHROME.png\` desktop.
- \`W46_BC_THEME_0_DARK.png\` through \`W46_BC_THEME_4_DARK.png\`: dark mode after actual theme-menu selection (five themes).
- \`W46_BC_REAL_BROWSER_UAT.json\`: actual HTTP POST count, source SHA, observed DOM/canvas widths, ten theme+mode states and browser page errors.

Browser UAT selected the actual fixture contact A in the original B+C page, focused input (0 takeover requests), typed text (1 actual W24 HTTP POST with four-field CAS and fresh GET -> HUMAN) and selected contact B (0 more POST), while B/C remained AUTO in existing W44 SQLite. Native W45 owner service presented exact original/MID but ZERO sourced suggestions without a trusted W43 Run. No manufactured translated text or quality approval, no real provider delivery, no paid model inference.

This is **Chrome headless HTML/browser UAT only**. Windows WebView2/Tauri installation, independent security, production login/principal authentication and cross-service signed Run-issuer integration are not evidenced. The synthetic test-only backend uses a fixed in-process principal, must NEVER be deployed or exposed beyond the loopback machine.

Canonical source SHA references: selected B+C 34467cf10c0e9457c2a22dee5a37d1e05dd2ed8b, W24 e10f9e17988fa19c4dc71ce927e5d9eaa01dbdc9, W45 ab059fc29584bcfee60dd793758beef2b2a3c643. W43 PR #36/#39 not merged by W46.
