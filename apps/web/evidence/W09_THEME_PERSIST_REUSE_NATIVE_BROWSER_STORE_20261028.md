# W09-3 Web-first theme preference persistence: reuse browser-native storage
Date: 2026-10-28. Source parent: 55c42992d2962c3da4b5c3dba07b154a27e19373.

Actual original audited stack:
- Original App/store.ts owns five preexisting theme strings and dark/light appearance.
- Original App updates UI through its existing cycle-theme and toggle-theme actions.
- Original W47 settings capability says theme.persistedWrite=false: no native/server theme preference repository or POST exists.
- W43 Agno SQLite is chat/Run/Trace data, not UI preference authority. Do not attach theme data there.

Narrow solution: BCProductWorkspaceCandidate.vue is already the original top-level owner of the four user-facing Theme actions. Reuse window.localStorage (per-origin browser storage), exactly one namespaced UI key with validated theme and appearance strings. On component mount apply validated prior choice through original App events. After each original event and nextTick, store the new resolved props. No new agent, API, database, model token, social auth, person K, private ChatHistory or secret storage.

Security: refuse unexpected theme, light/dark, extra JSON keys and oversized preference string. Storage exceptions fail open as UI-only; no fake save receipt. Do not write any other setting into localStorage. Browser storage is origin/device scoped, not cross-device synchronization and may be cleared by clearing browser data.

Real independent Chrome evidence: THEME_PERSISTENCE_CDP_20261028.json on isolated localhost 44774. Selector Ocean Electric/light -> saved only two display fields, reload -> retained, about:blank + reopen -> retained, malformed pref -> default Obsidian Lime/dark. Original W46 suite remains green. User authorization: direct user request to avoid new subsystem and reuse preexisting base.