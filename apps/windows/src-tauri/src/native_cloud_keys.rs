//! W55 native-only cloud credential commands in original W54 Tauri process.
//! JavaScript only receives redacted status. Never use fetch/localStorage for keys.
use serde::Serialize;
use tauri::State;
use yance_w55_fake_credential_custody::{
    cloud_keys::{CloudProvider, NativeKeyCustody},
    VaultError,
};
use zeroize::Zeroizing;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RedactedCloudKeyState {
    provider: CloudProvider,
    configured: bool,
    revoked: bool,
    revision: u64,
}

fn error_name(e: VaultError) -> String {
    // The enum contains no secret fields; do not log submitted key or target.
    format!("{e:?}")
}
fn state(
    vault: &NativeKeyCustody,
    provider: CloudProvider,
) -> Result<RedactedCloudKeyState, String> {
    match vault.status(provider) {
        Ok(s) => Ok(RedactedCloudKeyState {
            provider,
            configured: s.configured,
            revoked: s.revoked,
            revision: s.revision,
        }),
        Err(VaultError::Missing) => Ok(RedactedCloudKeyState {
            provider,
            configured: false,
            revoked: false,
            revision: 0,
        }),
        Err(e) => Err(error_name(e)),
    }
}

#[tauri::command]
pub(crate) fn cloud_key_status(
    provider: CloudProvider,
    vault: State<'_, NativeKeyCustody>,
) -> Result<RedactedCloudKeyState, String> {
    state(&vault, provider)
}

/// W46's official installed first-party WebView uses Tauri native IPC only.
/// The string exists transiently in UI input/IPC memory; never sent to W47 HTTP.
#[tauri::command]
pub(crate) fn cloud_key_store(
    provider: CloudProvider,
    secret: String,
    expected_revision: Option<u64>,
    vault: State<'_, NativeKeyCustody>,
) -> Result<RedactedCloudKeyState, String> {
    let secret = Zeroizing::new(secret);
    match expected_revision {
        None => vault.enroll(provider, secret.as_bytes()),
        Some(rev) => {
            let current = vault.status(provider).map_err(error_name)?;
            if current.revoked {
                vault.re_enroll_revoked(provider, rev, secret.as_bytes())
            } else {
                vault.rotate(provider, rev, secret.as_bytes())
            }
        }
    }
    .map_err(error_name)?;
    state(&vault, provider)
}

#[tauri::command]
pub(crate) fn cloud_key_revoke(
    provider: CloudProvider,
    expected_revision: u64,
    vault: State<'_, NativeKeyCustody>,
) -> Result<RedactedCloudKeyState, String> {
    vault
        .revoke(provider, expected_revision)
        .map_err(error_name)?;
    state(&vault, provider)
}
