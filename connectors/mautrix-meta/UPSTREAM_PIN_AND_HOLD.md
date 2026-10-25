# Source provenance — official mautrix-meta candidate (W26)

- **GitHub repository:** https://github.com/mautrix/meta
- **Release tag:** `v0.2610.0` (**v26.10**, published **2026-10-16**).
- **Official Git tag ref target commit:** `3c16226686c71af64df294df0803791685064e0b` (40 hex). Verified via [GitHub REST tag ref](https://api.github.com/repos/mautrix/meta/git/ref/tags/v0.2610.0); ref is a `commit`, not an annotated tag-object SHA.
- **Official release JSON:** https://api.github.com/repos/mautrix/meta/releases/tags/v0.2610.0.
- **Optional binary provenance metadata, NOT downloaded/installed:** official release `mautrix-meta-amd64` asset advertises SHA256 `17b8fd89ee8bb71796b9406aad37fd871110efbb22ace26801034dab9c5a3843`; this is vendor metadata, **not a local runtime verification**.
- **License source:** AGPL-3.0 in upstream; [LICENSE.exceptions at exact tag](https://github.com/mautrix/meta/blob/v0.2610.0/LICENSE.exceptions) grants narrow exceptions to **Beeper and Element**, not YANCE. The upstream exception file conditions that modifications remain AGPL-public. Final combined-work/network source code obligations must be independently judged by LEGAL; YANCE **does not claim an exception**.
- **Native bridge documentation:** https://docs.mau.fi/bridges/go/meta/ and https://spec.mau.fi/megabridge/ are references, **not tagged source runtime integration evidence**.
- **FB_PERSONAL vs FB_PAGE:** this candidate concerns Messenger personal accounts only. Meta's current actual platform approval for commercial third-party AI auto-replies **has not been obtained**.
- **Implementation level:** `src/synthetic-inbound.mjs` is a purpose-built **minimal offline DTO mapper**; it contains no copied upstream source and runs no upstream vendor binary. Release pin is for future source-legal evaluation and eventual separately authorized real adapter, not a claim that this mock is native Messenger processing.
- **APP SHA and transport compatibility:** this PR supplies a V2 adapter test implementation SHA upon commit; actual official bridge runtime, package vendoring, authorized Session, native real Meta ID and webhook/protocol compatibility remain **NOT_RUN/HOLD**.

**Do not turn this into a live connector without separate user/channel authorization, privacy and legal approval.**
