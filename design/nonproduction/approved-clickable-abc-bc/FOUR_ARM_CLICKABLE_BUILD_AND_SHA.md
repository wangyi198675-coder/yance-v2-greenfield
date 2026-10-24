# W39 RED targeted build, bounded composer, full-K, CSP
DATE 2026-10-24 | PARENT a96b4ded8c74bd66ff175682a0da375e5924dc7d | ISOLATED branch p3-1/clickable-abc-bc.
FINAL EXACT HEAD: run `git rev-parse HEAD` on committed branch, or see external W09 exact SHA receipt; intentionally no self-referential SHA.
STATUS: **W39 actual Vue/Vite build and Chrome owner checks PASS; dependency security still RED/HOLD**.
Current package direct pins remain W42 original 14 including vite@7.3.1 (the 7.3.7 upgrade was NOT installed due six extra unapproved npm optional lock records). Lock SHA256 `1d91cd197a4bc429fb0d6bd8808746b4b3537951f1f1806d277aed67afc143c6`, original OSS72 files and 5 Lucide diffs untouched. Original Windows74 component SBOM and THIRD_PARTY_NOTICES remain for same old lock; **must rebuild new SBOM/license/SRI after future W42 extra permission and actual dependency installation**.
Actual built `dist/` is included in this isolated Git candidate. Exact asset name/path/byte count and SHA recorded machine-generated in `evidence/W39_RED_FINAL_MANIFEST.json`. Build logs `W39_RED_BUILD_LOG.txt`, typecheck `W39_RED_TSC_LOG.txt`; `npm test` `W39_RED_PARITY_LOG.txt`.
Four separate arm URLs when local preview server is started:
- A `http://127.0.0.1:4186/?arm=CHAT-A-V25_VISUAL_NORMALIZED`
- B `http://127.0.0.1:4186/?arm=CHAT-B-ADAPTIVE_INBOX`
- C `http://127.0.0.1:4186/?arm=CHAT-C-PULSE_MAIN`
- BC `http://127.0.0.1:4186/?arm=CHAT-BC-FUSION&pulse=1`
Run from prototype root: `npm run preview -- --port 4186 --strictPort`; only 127.0.0.1, not network deploy. Browser tests: 44/44 +7 negatives, 76/76 actual screenshot geometry and 4/4 CSP. No live Provider or chargeable AI.
Current header: enforcing CSP `script-src 'self'`, `connect-src 'none'`, `frame-ancestors 'none'`, `worker-src 'none'`, exact prior observed inline style SHA only; `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`. W41 should independently re-prove, not inherit W39 screenshot.
Independent QA/SEC/licensing postbuild on new SHA pending. No merge, no distribution, no P4.
