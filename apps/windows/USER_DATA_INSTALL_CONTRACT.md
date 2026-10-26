# W54 Windows current-user directories and installation/upgrade contract

Status: SOURCE_ONLY_NONPROD. W54 owns apps/windows/**. No W47/W55/Agno/DB/Provider changes.

## Runtime path API

In Tauri Rust setup(), UserDirectories::resolve(app.path()) invokes official PathResolver.app_local_data_dir(), .app_config_dir(), .app_cache_dir(). It adds distinct data, config and cache subdirectories because Windows cache/local data roots may coincide. On Windows paths derive from current OS user, not author name, compile-time SID, fixed port or C drive.

* data = app_local_data_dir()/data : proposed W43 Brain and W24/W44/W25 owner-managed storage root after separate original Owner approval; not yet wired into databases.
* config = app_config_dir()/config : future nonsecret settings; do not store credentials.
* cache = app_cache_dir()/cache : disposable and never authoritative for account/grant/send.
* version marker = data/w54-local-layout.version, contains only W54_LOCAL_LAYOUT_V1. Existing marker mismatch fails closed. User data is never copied, reset or deleted.
* app identifier inherited from existing lab: com.yance.v2.native-session-lab. A later signed product identifier requires a reviewed same-user migration, not silent copying.

Only native Rust may inspect this layout. The two existing allowlisted Tauri commands remain session_status and logout_session, with canSend=false. No new JavaScript filesystem permission or secret export. Windows OS profile ACL separation alone is not social platform account authorization.

## Upgrade, uninstall and rollback

Same-user startup against same identifier is idempotent: existing marker and files remain unchanged. This is covered by synthetic directory tests, not by NSIS setup/uninstall. Unknown schema refuses startup, rather than guessing a destructive migration. When W43/W24/W44/W25 later use these paths, their original Owners must implement versioned schema migrations with atomic backup/rollback and per-user authorization; W54 must not invent another DB.

Real uninstall data-retention is NOT PROVEN; never promise preserving or deleting profile files before actual installer testing. No V1 profile import or recovery of deleted accounts. Another OS user should resolve a distinct OS path; synthetic temp-folder tests do NOT prove a second Windows SID or OS access control. No alternate-user account created or read.

## Formal install gate

Original tauri.conf.json keeps bundle.active=false to avoid shipping a nonproduct lab. A separate opt-in candidate config exists only for W09-approved packaging. Official Tauri CLI/NSIS availability, signing, currentUser installer, UI/WebView smoke, upgrades, uninstall/reinstall, second approved Windows user and clean friend's PC must be independently executed; if missing mark HOLD. No overwrite of runtime 44751/47182, PR53/main or any Owner. Existing W54 Cargo 14/14 remain protected.

A verified Tauri EXE compile and current-user startup may qualify only LOCAL_APPDATA_SOURCE_SMOKE, not a signed installation or a complete integrated V2 product.
