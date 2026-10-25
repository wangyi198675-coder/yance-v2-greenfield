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

---
## 【2026-10-25｜安全工具链增量构建｜当前优先】
此次源码未重做A/B/C/B+C的任何UI；基于既有 `fddf625d9a06f6919f753a7c89302563c1a98b25` 已修完整身份K/Composer/托管抽屉/CSP，只升级W42明确允许的工具包。vite=7.3.7，esbuild=0.28.1（仅transitive root override），其它13个原直接包不漂移。新lock SHA256 `852f14da6e4918b0c56dfb0e5a140a226e1e01a465c36ca80996bf3d84afffd8`，35/35批准差异；W42六条锁内inBundle=true/optional=true/dev=true，Windows未安装。实际新建SBOM/NOTICE/SRI、完整audit全0以及Vite build PASS。五个最终bundle的精确SHA在 `evidence/W39_P31_FINAL_SECURE_ACTUAL_MANIFEST.json` 中机器生成，Git精确HEAD以视窗9提交后联合报告及Git为准，不在此文件编造自引用SHA。独立W40/41/42待新HEAD才复签，禁止P4/正式分发。
