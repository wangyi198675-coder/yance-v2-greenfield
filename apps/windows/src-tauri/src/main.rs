#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod native_launch;
mod native_profile;
mod session;
mod user_dirs;
mod windows_principal;

use native_launch::{HostedChild, NativeChildLaunch};
use native_profile::NativeProfileAuthority;
use session::{PublicSessionStatus, SessionAuthority};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{ipc::CapabilityBuilder, Manager, WebviewUrl, WebviewWindowBuilder};
use user_dirs::UserDirectories;
use windows_principal::current_windows_principal;

#[tauri::command]
fn session_status(state: tauri::State<'_, SessionAuthority>) -> PublicSessionStatus {
    state.public_status()
}

#[tauri::command]
fn logout_session(
    state: tauri::State<'_, SessionAuthority>,
    native: tauri::State<'_, NativeProfileAuthority>,
    child: tauri::State<'_, Mutex<Option<HostedChild>>>,
) -> Result<(), String> {
    // Revoke even if the child cannot be stopped; never report successful
    // logout while an approved API child remains alive.
    let revoked = native.revoke(&state).map_err(|e| e.to_owned());
    let mut slot = child
        .lock()
        .map_err(|_| "NATIVE_CHILD_LOCK_POISONED".to_owned())?;
    slot.take(); // HostedChild::drop terminates/reaps the verified API child.
    revoked
}

fn main() {
    let verified_os = current_windows_principal().ok();
    let session = SessionAuthority::new(verified_os, Duration::from_secs(15 * 60))
        .expect("Fail closed: native OS random source must be available");
    // Build-only B+C mode: serve packaged static assets through the official
    // Tauri localhost plugin. This repairs W46's existing LOOPBACK_ONLY guard
    // without accepting a browser-provided Principal or relaxing it.
    // No Tauri IPC capability is granted to arbitrary localhost pages.
    let bc_loopback = option_env!("YANCE_W54_BC_LOOPBACK_ASSETS") == Some("1");
    let bc_port = if bc_loopback {
        Some(portpicker::pick_unused_port().expect("W54_BC_LOCAL_PORT_UNAVAILABLE"))
    } else {
        None
    };
    let mut builder = tauri::Builder::default().manage(session);
    if let Some(port) = bc_port {
        builder = builder.plugin(
            tauri_plugin_localhost::Builder::new(port)
                .host("127.0.0.1")
                .build(),
        );
    }
    let app = builder
        .setup(move |app| {
            if let Some(port) = bc_port {
                if app.config().identifier != "com.yance.v2.bc-isolated-candidate" {
                    return Err(std::io::Error::other("W54_BC_IDENTIFIER_NOT_REVIEWED").into());
                }
                let address: tauri::Url = format!("http://127.0.0.1:{port}/?productDraft=1")
                    .parse()
                    .map_err(|_| std::io::Error::other("W54_BC_LOCAL_URL_INVALID"))?;
                // Exact random asset origin, only this native main WebView and
                // only the two pre-existing redacted session commands.
                // An ordinary localhost Chrome page has no Tauri IPC bridge.
                app.add_capability(
                    CapabilityBuilder::new("w54-bc-localhost-session-only")
                        .local(false)
                        .remote(format!("http://127.0.0.1:{port}/*"))
                        .window("main")
                        .permission("allow-session-status")
                        .permission("allow-logout-session"),
                )?;
                WebviewWindowBuilder::new(app, "main", WebviewUrl::External(address))
                    .title("言策 V2 | B+C 本机候选（未授权）")
                    .inner_size(1380.0, 900.0)
                    .min_inner_size(930.0, 620.0)
                    .build()?;
            }
            // Resolves current OS user's Tauri-configured application paths.
            // Never exposes filesystem paths, SID or account claims to JavaScript.
            let user_dirs =
                UserDirectories::resolve(app.path()).map_err(|e| std::io::Error::other(e))?;
            user_dirs.initialize().map_err(std::io::Error::other)?;
            // Stable current-user/installation owner is native-only.
            // This object is never a Tauri command result or W47 HTTP header.
            let native = NativeProfileAuthority::from_tauri(&user_dirs, &app.config().identifier)
                .map_err(std::io::Error::other)?;
            // Host-only preflight: W47 must provide a signed bundled binary
            // AND reviewed child reader before any automatic first-party
            // Session can be started. No renderer command can launch it.
            let launch =
                NativeChildLaunch::new(app.path().resource_dir().map_err(std::io::Error::other)?);
            let approved_child = launch
                .start_approved_installed_w47(&native, &app.state::<SessionAuthority>())
                .map_err(std::io::Error::other)?;
            app.manage(Mutex::new(approved_child));
            app.manage(native);
            app.manage(launch);
            app.manage(user_dirs);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![session_status, logout_session])
        .build(tauri::generate_context!())
        .expect("construct minimal local Tauri host");
    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Some(child) = app_handle.try_state::<Mutex<Option<HostedChild>>>() {
                if let Ok(mut owned) = child.lock() {
                    owned.take();
                }
            }
            let _ = app_handle
                .state::<NativeProfileAuthority>()
                .revoke(&app_handle.state::<SessionAuthority>());
        }
    });
}
