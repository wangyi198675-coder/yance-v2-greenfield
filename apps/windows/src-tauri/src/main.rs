#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod session;
mod user_dirs;
mod windows_principal;

use session::{PublicSessionStatus, SessionAuthority};
use std::time::Duration;
use tauri::Manager;
use user_dirs::UserDirectories;
use windows_principal::current_windows_principal;

#[tauri::command]
fn session_status(state: tauri::State<'_, SessionAuthority>) -> PublicSessionStatus {
    state.public_status()
}

#[tauri::command]
fn logout_session(state: tauri::State<'_, SessionAuthority>) -> Result<(), String> {
    state.revoke().map(|_| ()).map_err(|e| e.to_owned())
}

fn main() {
    let verified_os = current_windows_principal().ok();
    let session = SessionAuthority::new(verified_os, Duration::from_secs(15 * 60))
        .expect("Fail closed: native OS random source must be available");
    let app = tauri::Builder::default()
        .manage(session)
        .setup(|app| {
            // Resolves current OS user's Tauri-configured application paths.
            // Never exposes filesystem paths, SID or account claims to JavaScript.
            let user_dirs =
                UserDirectories::resolve(app.path()).map_err(|e| std::io::Error::other(e))?;
            user_dirs.initialize().map_err(std::io::Error::other)?;
            app.manage(user_dirs);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![session_status, logout_session])
        .build(tauri::generate_context!())
        .expect("construct minimal local Tauri host");
    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            let _ = app_handle.state::<SessionAuthority>().revoke();
        }
    });
}
