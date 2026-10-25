# W09 native source composition — actual code + actual SQLite synthetic runtime

Non-production integration branch only. No real accounts, paid cloud models, social sends or deployment. This is a **new separate integration tree** built by copying owner-approved *already committed* source paths from the following refs via `git restore --source origin/<branch> -- <path>`, not modifying/merging any of those owners' original Draft PR branches.

| Owner | Actual source commit |
|---|---|
| W23 FileAttachment | `a4ae20d32db9a5d43d3bf56d38287957e1fdf8a9` |
| W24 IdentityConsent | `a8912962004f9c324157234356268acb7fc41e82` (W24 newer takeover HTTP SHA `e10f9e17988fa19c4dc71ce927e5d9eaa01dbdc9` deliberately remains independent pending portable CI and W46 Composer delta) |
| W25 MessageDelivery | `7f6fabd9f35d3cf3c27bd661d9627db731ec9ae7` (SQLite cold WAL startup retry, preserving old `58987b5ec2dbf803983bdea9ec280247599e3e0c` sender/ACK/UNKNOWN safety) |
| W44 Grant/Custody/Budget | `1509f4c44a49faf9a8a831d52b0a659ca6f3ddc1` (durable final-send arm + mutation barriers; earlier `8703781536564b476f4ebce452a7d6780595046e`) |
| W45 Translation/Reply | `f16b4c466dbf245abdbf25ded89367cee0204237` |
| W43 official Agno/AgentOS local-only Python | Unified source `4ff5e7e883ffbaeaca42850ba20460c5486cfb45`, plus exact PAUSED-only source regression taken from independent `376cdb5359bb6e375b5a81167ca1ad2eca3df169` **in W09 integration candidate only**; pending original W43 unified Owner/security review of combined SHA |
| W26 FB personal adapter | `ff9ccca1f788b2a38e940547421177e9f782a37d` |
| W27 FB Page adapter | `cf3a0da01b0d880c199690821487ff5632175834` |
| W28 Baileys adapter | `938443ef1c78dcbedf10b70fabfff04382860ef4` |
| W29 TDLib JSON adapter | `b5e9f96a0d5bba4746c53e394aeaa3e2e8a106ef` |
| W09 earlier M0 synthetic input tests | `378bae3c19bdb7c71b80bdf4e4b92a9ec4fec51b` |

## Actual tested links

- Executed all **204 existing native JavaScript tests** in one integrated source tree (14 checked-in test files), all PASS.
- Executed W44's *actual W24 + W44 + W25* SQLite interop with real imported source. Durable synthetic message was queued, passed pre-network checks, reached only `SyntheticConnectorSink` and resulted in `ACKED_SYNTHETIC`, budget COMMITTED; revoke prevented a second request.
- New `native-vertical.test.mjs` imports actual W26 inbound adapter, W24 identity, W45 translation DTO, W44 SQLite budget/grant, W25 durable SQLite Outbox. It sends a fake inbound message, stores its original, receives clearly labeled **SYNTHETIC_FIXTURE** Chinese text, enforces canonical K and dedupe, and tests independent fake send intent plus revoked fail-closed. No Agno run or real translation; **not** a 200-feature product PASS.
- The tests are separate from the UI and Windows/Browser native acceptance; W46 B+C composer bridge, private Agno actual model Run and durable cross-domain state recovery/transaction coordination still need genuine M1/M2 integration.

## Hard architectural truths

- Auth source is W24; effective grants/custody/budget W44; single sender/outbox W25; no second delivery implementation.
- W43 Python official Agno source is present but its **real local model tests require protected localhost secrets**; running hosted Python tests excluding `local_model` does not prove an actual SDK-model invocation.
- W45 uses deterministic fixture translation port in this joint test; do not mislabel as genuine Chinese machine translation or 0–3 suggestions.
- W26 source is a **synthetic mautrix-meta projection**, not a live Messenger connection or Meta ACK.
- W44 and W25 use separate SQLite files; cross-database transaction atomicity and permanent production PostgreSQL design are NOT proven.
- This aggregate is an integration-test composition, not an authorization to merge all independent OWNER Draft PRs into main. Keep independent SEC/QA/OSS checks for changed integrated code.

## One actual command in the integration checkout

```sh
node --test integration/synthetic-first-flow/native-vertical.test.mjs
node services/api/src/domains/grant-custody-budget/interop.native.mjs ABSOLUTE_W24_FILE ABSOLUTE_W25_FILE
node --test <all 15 committed test.mjs files>
```

Next: attach hosted Actions job and produce exact SHA plus negative tests; request owner-level changes only for failing interfaces; no duplicate docs.

## 2026-10-25 W09 successor incremental rebase-free owner-source synchronization

- Existing PR #32 original 205/205 tests and six CI successes apply **only** to historical SHA `1590952a4ff2d118820576a0815f5f9e8fdbb495`, not automatically to this new working tree.
- Without touching Owner worktrees or main, `git restore --source=<owner SHA> -- <owner directory>` synchronized unchanged W24 IdentityConsent `a8912962004f9c324157234356268acb7fc41e82` and unchanged W25 MessageDelivery `58987b5ec2dbf803983bdea9ec280247599e3e0c` into the existing W09 integration worktree. W44 remains source `8703781536564b476f4ebce452a7d6780595046e`. W45 remains `f16b4c466dbf245abdbf25ded89367cee0204237`; its later owner update `643e90c2eb97fb44b522423878e544e5e3ee7eff` is **not** integrated or quality-qualified here.
- Only W09-authored runtime test seam changed: `integration/synthetic-first-flow/native-vertical.test.mjs` now passes `({k})=>ids.readConsentEpoch(ctx,k)` instead of `()=>1`, and proves a queued W25 outbox attempt is DENIED when W24 consent epoch changes. Synthetic sink additional calls = 0; original synthetic ACK still works.
- On remote Windows Node 24, targeted W24+W25+W09 test files: **55/55 PASS**; W24 cross-owner-fence: **4/4 scenarios PASS**, zero sends on revoked; W25 native-authority-regression: PASS, attempt NOT_SENT_AUTHORITY_DENIED, sink calls 0. Actual previous 205-case all-domain tests were **not re-run at this stage**; GitHub Actions must qualify this new exact SHA separately.
- Still P0: W24 ephemeral in-memory authority, W44 and W25 separate SQLite DBs, revocation after final check TOCTOU, no cross-DB atomic irreversible send, no real Provider MID/ACK. P1: W44 budget UNKNOWN finish/release/commit and real translation/candidate quality, W46 current B+C Composer. No production deployment, private accounts, real sends or paid model.

## 2026-10-25 W09-2 second incremental source sync (nonproduction)
- Synchronized ONLY W44 exact owner `1509f4c44a49faf9a8a831d52b0a659ca6f3ddc1` into ORIGINAL W09 integration branch. W24 remains integrated at `a8912962004f9c324157234356268acb7fc41e82` and W25 remains `58987b5ec2dbf803983bdea9ec280247599e3e0c`. W24 newer e10f9e17 HTTP GET/POST suite passed separately but is not copied to this branch: its tests require explicit existing W46/PR32 worktree inputs and old W46 Composer intentionally fails closed; committing it alone would yield a nonportable CI run.
- The existing W09-native vertical test now supplies W44 mandatory `getDelivery`, `createW25PersistedArmVerifier` and `createW25SettlementVerifier` callbacks backed by W25 actual persistent SQLite Outbox and asserts `settleBoundary` COMMITTED after synthetic ACK. No second sender or fake ACK. A queued send with changed W24 Consent epoch still becomes DENIED; synthetic sink additional calls=0.
- On Windows Node 24 current integrated W44+W25 tests **51/51 PASS**, W09 native vertical **1/1 PASS**. W24 newer Owner e10f9e17 takeover HTTP/CAS tests **14/14 PASS separately** when temporarily evaluated with both named worktree paths; they intentionally verify the unmodified W46 Composer is BLOCKED 422 and do NOT constitute integrated working UI or current PR32 source. Original PR32 205-case tests and hosted CI refer to the earlier SHA, not this new commit.
- P0 remains HOLD: W24 in-memory mutations not universally forced through W44 mutation barriers, W24 account/consent authority not cross-process persistent, W25 irreversibility not provider-certified, separate W44/W25 SQLite are not one transaction. Real provider login/MID/ACK, independent SEC/LEGAL and production P4 are explicitly NOT_RUN. W43 conflicting PR36/PR39 model backends and W45/W46 true quality/UI are separate Owner acceptance gates.
- Additional observed **W25 intermittent CI-relevant RED** on this exact integrated source: first simultaneous 80-test Node run produced 79 PASS / 1 FAIL because one W25 worker process got SQLite `ERR_SQLITE_ERROR: database is locked` during `PRAGMA journal_mode=WAL` initialization. Repeating the isolated W25 worker-process case **3/3 PASS**, then two identical 80-test suite runs **80/80 PASS each**. This is **intermittent** SQLite startup contention; do NOT recast as a fully stable pass or modify the W25-owned sender from W09. W25 owns root cause and targeted safe startup retry/serialization; W30 owns accurate-SHA hosted CI only.

## 2026-10-25 W09-2 third incremental W25 cold-WAL startup fix receipt (nonproduction)
- Imported verbatim W25 Owner PR #23 exact SHA `7f6fabd9f35d3cf3c27bd661d9627db731ec9ae7`, four changed files **only** under its existing MessageDelivery directory; owner branch, W44 grant source and main are untouched. W25 alone diagnosed one-of-24 `SQLITE_BUSY` first-WAL-opening red and added bounded startup-only PRAGMA/DDL retry, constructor cleanup, plus concurrent 6-process fresh-file and UNKNOWN restart tests. Neither irreversible sink nor dispatch/ACK/UNKNOWN is retried.
- W25 owner independently reports **28/28 × 3 suites** including 36 high-contention rounds / 216 OS workers, plus real W44 arm/settlement synthetic interop. W09-2 independently ran the present unchanged W24 `a891296`, W44 `1509f4`, new W25 `7f6fabd`, original W09 synthetic five-domain test and W25 startup tests together: **82/82 PASS, zero failures**, including twelve six-worker first-open rounds, true in-memory K/Consent epoch denial and actual synthetic W44 settlement. No real Agno, real translation, real Composer or authenticated provider is represented by that result.
- Remain P0 HOLD: W24 process durability and mandatory mutation barriers, actual trusted app/IPC cross-process principal and Consent epoch, W25 real provider authorization/ACK/UNKNOWN boundary, cross-DB atomicity and independent SEC; no account login, real channel send, paid model or production deployment. W46 PR #21 later HEAD `babd079acc48914141d8782341182b9bae8a32f2` independently implements takeover GET/POST/GET but is not silently imported here; W45 PR #16 `ab059fc29584bcfee60dd793758beef2b2a3c643` also remains separate with observed translation/reply quality HOLD. W43 PR #36/#39 single-authority reconciliation remains W09-owned.

## 2026-10-25 W09-2 fourth incremental Agno Owner source join (NONPRODUCTION ONLY)
- Original W43 Owners' different source branches are preserved unchanged. In W09 existing integration tree only, imported `services/agentos/**` verbatim from W43 unified Qwen3 llama.cpp capacity branch `4ff5e7e883ffbaeaca42850ba20460c5486cfb45`, an exact descendant of W43 real-model branch `d0987e9c64b937c923b3d32bda7bd05f86a638ba`. Uses original local assistant's authenticated 127.0.0.1:11605 and Provider `LLAMACPP_LOCAL_QWEN3_8B_FREE`, with synthetic-only purposes; no server restart, credentials copied or other inference engine.
- Applied the **already-committed** W43 PR39 `376cdb5359bb6e375b5a81167ca1ad2eca3df169` SDK PAUSED state branch exactly into this W09 candidate: `AGNO_RUN_PAUSED_REQUIRES_APPROVAL` preserves Run/Session and WAITING_FOR_HUMAN_NOT_AUTO_EXECUTED, zero suggestions, outbound DISABLED; truly ERROR SDK status stays LOCAL_MODEL_UNAVAILABLE_OR_RUN_FAILED. Also reused existing PAUSED/ERROR parameterized two-case Owner regression in current native Python test file. No W43 Owner worktree or upstream branch changed; this is an **integration-only provenance join, not W43 independent approval**.
- Actual Windows Python W43 venv test: two relevant test modules **16/16 PASS**; full `services/agentos/tests` without protected local_model mark **58 PASS, 3 DESELECTED**, 0 FAIL. Protected real-model load/throughput and multi-contact sustained AUTO not rerun or certified here, and W45 real reply quality stays HOLD.
- PR32's older W43 source `ff088743` is superseded by this integration candidate, but W45 its own latest Owner source `ab059fc29584bcfee60dd793758beef2b2a3c643` remains separate, not auto-integrated. The merged W43 effective SHA will be the NEW W09-only aggregate SHA, not a fictional unified W43 Owner SHA; independent Owner, CI and security gates still required before merge or any real sends.
