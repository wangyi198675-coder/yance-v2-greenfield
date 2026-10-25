# W09 native source composition — actual code + actual SQLite synthetic runtime

Non-production integration branch only. No real accounts, paid cloud models, social sends or deployment. This is a **new separate integration tree** built by copying owner-approved *already committed* source paths from the following refs via `git restore --source origin/<branch> -- <path>`, not modifying/merging any of those owners' original Draft PR branches.

| Owner | Actual source commit |
|---|---|
| W23 FileAttachment | `a4ae20d32db9a5d43d3bf56d38287957e1fdf8a9` |
| W24 IdentityConsent | `30b188346729d858826b491daaca40cbc6ef5279` |
| W25 MessageDelivery | `499b79a59485902964a2e875628bb01d1ce6e7ce` |
| W44 Grant/Custody/Budget | `8703781536564b476f4ebce452a7d6780595046e` |
| W45 Translation/Reply | `f16b4c466dbf245abdbf25ded89367cee0204237` |
| W43 official Agno/AgentOS local-only Python | `ff0887438982a6d2f7919b461498d31b693aa202` |
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
