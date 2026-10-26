#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod local_api_child;
mod native_cloud_keys;
mod native_launch;
mod native_profile;
mod session;
mod user_dirs;
mod windows_principal;

use local_api_child::LocalApiChild;
use native_cloud_keys::{cloud_key_revoke, cloud_key_status, cloud_key_store};
use native_launch::{HostedChild, NativeChildLaunch};
use native_profile::NativeProfileAuthority;
use session::{PublicSessionStatus, SessionAuthority};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{ipc::CapabilityBuilder, Manager, WebviewUrl, WebviewWindowBuilder};
use user_dirs::UserDirectories;
use windows_principal::current_windows_principal;
use yance_w55_fake_credential_custody::cloud_keys::{NativeKeyCustody, NativeScope};
use yance_w55_fake_credential_custody::VaultError;

#[tauri::command]
fn session_status(state: tauri::State<'_, SessionAuthority>) -> PublicSessionStatus {
    state.public_status()
}

#[tauri::command]
fn logout_session(
    state: tauri::State<'_, SessionAuthority>,
    native: tauri::State<'_, NativeProfileAuthority>,
    child: tauri::State<'_, Mutex<Option<HostedChild>>>,
    local_api: tauri::State<'_, Mutex<Option<LocalApiChild>>>,
) -> Result<(), String> {
    // Revoke even if the child cannot be stopped; never report successful
    // logout while an approved API child remains alive.
    let revoked = native.revoke(&state).map_err(|e| e.to_owned());
    let mut slot = child
        .lock()
        .map_err(|_| "NATIVE_CHILD_LOCK_POISONED".to_owned())?;
    slot.take(); // HostedChild::drop terminates/reaps the verified API child.
    if let Ok(mut api) = local_api.lock() {
        api.take();
    }
    revoked
}

fn main() {
    let verified_os = current_windows_principal().ok();
    // Ordinary personal use has no periodic pairing/login. The session is
    // still bound to this native process/current Windows user and is revoked
    // on explicit logout or exit, not by a 15-minute user-visible timer.
    let session = SessionAuthority::new(verified_os, Duration::from_secs(365 * 24 * 60 * 60))
        .expect("Fail closed: native OS random source must be available");
    // Build-only B+C mode: serve packaged static assets through the official
    // Tauri localhost plugin. This repairs W46's existing LOOPBACK_ONLY guard
    // without accepting a browser-provided Principal or relaxing it.
    // No Tauri IPC capability is granted to arbitrary localhost pages.
    let builtin_w47 = option_env!("YANCE_W54_BUNDLED_W47_SOURCE_SHA");
    let bc_loopback =
        builtin_w47.is_none() && option_env!("YANCE_W54_BC_LOOPBACK_ASSETS") == Some("1");
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
            let resource_root = app.path().resource_dir().map_err(std::io::Error::other)?;
            // Original W54 current-OS-user authority is initialized BEFORE
            // starting the existing W47 child. A private stdin frame provides
            // only locally verified opaque scope; no terminal pair or browser SID.
            let user_dirs = UserDirectories::resolve(app.path()).map_err(std::io::Error::other)?;
            user_dirs.initialize().map_err(std::io::Error::other)?;
            let native = NativeProfileAuthority::from_tauri(&user_dirs, &app.config().identifier)
                .map_err(std::io::Error::other)?;
            let proof = native
                .verify_for_native_owner(&app.state::<SessionAuthority>())
                .map_err(std::io::Error::other)?;
            let (principal_ref, installation_ref, ..) = proof.native_contract_parts();
            let local_api = if let Some(source_sha) = builtin_w47 {
                let port = portpicker::pick_unused_port()
                    .ok_or_else(|| std::io::Error::other("LOCAL_API_PORT_UNAVAILABLE"))?;
                Some(
                    local_api_child::start_bundled(
                        &resource_root,
                        source_sha,
                        option_env!("YANCE_W54_BUNDLED_W47_SERVER_SHA256").unwrap_or(""),
                        option_env!("YANCE_W54_BUNDLED_W47_MANIFEST_SHA256").unwrap_or(""),
                        port,
                        Some(&proof),
                    )
                    .map_err(std::io::Error::other)?,
                )
            } else {
                None
            };
            let ready_url = local_api
                .as_ref()
                .map(|child| format!("{}/?productDraft=1", child.origin));
            let native_http_cookie = local_api
                .as_ref()
                .and_then(|child| child.first_party_cookie.clone());
            app.manage(Mutex::new(local_api));
            if let Some(url) = ready_url {
                if app.config().identifier != "com.yance.v2.bc-isolated-candidate" {
                    return Err(std::io::Error::other("LOCAL_API_APP_IDENTIFIER_INVALID").into());
                }
                let address: tauri::Url = url
                    .parse()
                    .map_err(|_| std::io::Error::other("LOCAL_API_WINDOW_URL_INVALID"))?;
                let allowed_origin = address.origin().ascii_serialization();
                app.add_capability(
                    CapabilityBuilder::new("w54-local-api-one-origin-window")
                        .local(false)
                        .remote(format!("{allowed_origin}/*"))
                        .window("main")
                        .permission("allow-session-status")
                        .permission("allow-logout-session")
                        .permission("allow-cloud-key-status")
                        .permission("allow-cloud-key-store")
                        .permission("allow-cloud-key-revoke"),
                )?;
                let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(address))
                    .title("言策 V2 | 本机闺蜜大脑")
                    .inner_size(1380.0, 900.0)
                    .min_inner_size(930.0, 620.0)
                    .build()?;
                if let Some(source) = native_http_cookie {
                    // Tauri's official WebView2 Cookie Manager sets HttpOnly
                    // for THIS installed window; Node never issues it to an
                    // ordinary localhost HTTP request or frontend JavaScript.
                    let mut cookie = tauri::webview::Cookie::parse(source)
                        .map_err(|_| std::io::Error::other("W54_WEBVIEW_COOKIE_INVALID"))?;
                    cookie.set_domain("127.0.0.1");
                    cookie.set_path("/");
                    cookie.set_http_only(true);
                    window.set_cookie(cookie)?;
                    window.reload()?;
                }
            }
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
                        .permission("allow-logout-session")
                        .permission("allow-cloud-key-status")
                        .permission("allow-cloud-key-store")
                        .permission("allow-cloud-key-revoke"),
                )?;
                WebviewWindowBuilder::new(app, "main", WebviewUrl::External(address))
                    .title("言策 V2 | B+C 本机候选（未授权）")
                    .inner_size(1380.0, 900.0)
                    .min_inner_size(930.0, 620.0)
                    .build()?;
            }
            // The original native OS-user authority was already verified
            // before the W47 child boot and is reused below by W55.
            // Host-only preflight: W47 must provide a signed bundled binary
            // AND reviewed child reader before any automatic first-party
            // Session can be started. No renderer command can launch it.
            let launch =
                NativeChildLaunch::new(app.path().resource_dir().map_err(std::io::Error::other)?);
            let approved_child = launch
                .start_approved_installed_w47(&native, &app.state::<SessionAuthority>())
                .map_err(std::io::Error::other)?;
            app.manage(Mutex::new(approved_child));
            // W55 is activated only inside the original native W54 current-user
            // application; never from a client-provided SID, HTTP header or token.
            let scope = NativeScope::from_w54_native_only(installation_ref, principal_ref)
                .map_err(|_| std::io::Error::other("W55_NATIVE_SCOPE_INVALID"))?;
            app.manage(native);
            let owned_app = app.handle().clone();
            let vault = NativeKeyCustody::from_native_host(scope, move || {
                owned_app
                    .state::<NativeProfileAuthority>()
                    .verify_for_native_owner(&owned_app.state::<SessionAuthority>())
                    .map(|_| ())
                    .map_err(|_| VaultError::Denied)
            })
            .map_err(|_| std::io::Error::other("W55_NATIVE_USER_NOT_ACTIVE"))?;
            app.manage(vault);
            app.manage(launch);
            app.manage(user_dirs);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            session_status,
            logout_session,
            cloud_key_status,
            cloud_key_store,
            cloud_key_revoke
        ])
        .build(tauri::generate_context!())
        .expect("construct minimal local Tauri host");
    app.run(|app_handle, event| {
        // This host creates its real B+C WebView dynamically. On Windows,
        // closing its only window can leave the event loop alive unless the
        // private host explicitly requests Exit. Keep using the original
        // Exit cleanup below to reap W47 and revoke the native generation.
        if matches!(&event, tauri::RunEvent::WindowEvent {
            label,
            event: tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed,
            ..
        } if label == "main")
        {
            app_handle.exit(0);
        }
        if let tauri::RunEvent::Exit = event {
            if let Some(child) = app_handle.try_state::<Mutex<Option<LocalApiChild>>>() {
                if let Ok(mut running) = child.lock() {
                    running.take();
                }
            }
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
