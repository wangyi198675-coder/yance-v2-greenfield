fn main() {
    // Explicit per-command Tauri 2 ACLs. No wildcard custom command access.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["session_status", "logout_session"]),
    ))
    .expect("generate Tauri 2 native permissions");
}
