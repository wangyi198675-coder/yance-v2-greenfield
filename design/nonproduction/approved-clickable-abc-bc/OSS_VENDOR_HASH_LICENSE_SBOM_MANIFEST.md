# OSS/Vendor/License/SBOM manifest (gate-ledger)
STATE: UPSTREAM_PROPOSED_ONLY / IMPORT_HOLD / NO_VENDORED_FILES / NO_INSTALLED_PACKAGES
- Upstream candidate commit: shadcn-vue v2.8.2 `3f048dfb495703f39e191b25a69307fba72822eb` MIT; proposed 67 exact selected files enumerated in W39_REQUESTED_OSS_EXACT_FILE_LIST.csv. ALL copy_status=NOT_COPIED; this CSV is NOT independent W42 PREIMPORT_ALLOW.
- Runtime candidates: reka-ui 2.11.0, @tanstack/vue-virtual 3.13.47, @tanstack/virtual-core 3.19.6. Their upstream/npm metadata inherited from W32/W38, **not downloaded or installed**.
- W38 input/textarea (4), icon-placeholder (2), lib/utils (1), alternative icon-loading chain and CSS/aliases remain separate PREIMPORT_HOLD; only a single @lucide/vue icon system is proposed, not approved.
- No actual vendor byte hashes/diff, lock/SRI verification, actual package count, full CycloneDX/SPDX or THIRD_PARTY_NOTICES. None may be marked PASS.
- Any subsequent W42 approval must record allowed paths+hash, SPDX, preserved license/copyright, diffs, dependency completeness and precise package versions prior to install/build; W42 postbuild must independently verify actual bundled bytes.
