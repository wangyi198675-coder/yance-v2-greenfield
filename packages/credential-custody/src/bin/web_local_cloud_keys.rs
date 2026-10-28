//! W55 one-shot WinCred/DPAPI adapter for ORIGINAL W47 local Web API.
//! Private inherited stdio only; NO listener, Vault, login or model runner.
//! W47 enforces browser same-origin/CSRF and the W43 paid model consent.
//! The lease operation MUST NEVER be returned to the browser.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    io::{self, Read, Write},
    ptr,
};
use windows_sys::Win32::{
    Foundation::{CloseHandle, HANDLE},
    Security::{GetLengthSid, GetTokenInformation, IsValidSid, TokenUser, TOKEN_QUERY, TOKEN_USER},
    System::Threading::{GetCurrentProcess, OpenProcessToken},
};
use yance_w55_fake_credential_custody::{
    cloud_keys::{CloudProvider, NativeKeyCustody, NativeScope},
    VaultError,
};
use zeroize::Zeroizing;
const MAX_INPUT: usize = 4096;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    op: String,
    provider: CloudProvider,
    expected_revision: Option<u64>,
    secret: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Status {
    ok: bool,
    provider: CloudProvider,
    configured: bool,
    revoked: bool,
    revision: u64,
}

fn current_sid() -> Result<Vec<u8>, VaultError> {
    unsafe {
        let mut token: HANDLE = ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return Err(VaultError::Denied);
        }
        struct Guard(HANDLE);
        impl Drop for Guard {
            fn drop(&mut self) {
                unsafe {
                    CloseHandle(self.0);
                }
            }
        }
        let _guard = Guard(token);
        let mut size = 0u32;
        GetTokenInformation(token, TokenUser, ptr::null_mut(), 0, &mut size);
        if size < std::mem::size_of::<TOKEN_USER>() as u32 || size > 65_536 {
            return Err(VaultError::Denied);
        }
        let mut buf = vec![0u8; size as usize];
        if GetTokenInformation(token, TokenUser, buf.as_mut_ptr().cast(), size, &mut size) == 0 {
            return Err(VaultError::Denied);
        }
        let user = ptr::read_unaligned(buf.as_ptr().cast::<TOKEN_USER>());
        if user.User.Sid.is_null() || IsValidSid(user.User.Sid) == 0 {
            return Err(VaultError::Denied);
        }
        let len = GetLengthSid(user.User.Sid) as usize;
        if !(8..=1024).contains(&len) {
            return Err(VaultError::Denied);
        }
        Ok(std::slice::from_raw_parts(user.User.Sid.cast::<u8>(), len).to_vec())
    }
}
fn namespace() -> Result<String, VaultError> {
    #[cfg(debug_assertions)]
    if let Some(v) = std::env::var_os("W55_WEB_QA_SCOPE") {
        let s = v.to_str().ok_or(VaultError::Denied)?;
        let suffix = s.strip_prefix("W55_WEB_QA_").ok_or(VaultError::Denied)?;
        if suffix.len() != 32 || !suffix.bytes().all(|c| c.is_ascii_hexdigit()) {
            return Err(VaultError::Denied);
        }
        return Ok(s.to_owned());
    }
    Ok("YANCE_V2_WEB_LOCAL_CLOUD_BYOK_V1".into())
}
fn scope_names() -> Result<(String, String), VaultError> {
    let install = Sha256::digest(namespace()?.as_bytes());
    let sid = current_sid()?;
    let user = Sha256::digest([b"YanceV2 Web BYOK SID v1".as_slice(), sid.as_slice()].concat());
    Ok((format!("w54i_{install:x}"), format!("w54u_{user:x}")))
}
fn native() -> Result<NativeKeyCustody, VaultError> {
    let sid = current_sid()?;
    let (install, principal) = scope_names()?;
    let scope = NativeScope::from_w54_native_only(&install, &principal)?;
    NativeKeyCustody::from_native_host(scope, move || {
        if current_sid()? == sid {
            Ok(())
        } else {
            Err(VaultError::Denied)
        }
    })
}
fn status(v: &NativeKeyCustody, p: CloudProvider, out: &mut impl Write) -> Result<(), VaultError> {
    let s = match v.status(p) {
        Ok(x) => Status {
            ok: true,
            provider: p,
            configured: x.configured,
            revoked: x.revoked,
            revision: x.revision,
        },
        Err(VaultError::Missing) => Status {
            ok: true,
            provider: p,
            configured: false,
            revoked: false,
            revision: 0,
        },
        Err(e) => return Err(e),
    };
    serde_json::to_writer(&mut *out, &s).map_err(|_| VaultError::OsUnavailable)?;
    out.write_all(b"\n").map_err(|_| VaultError::OsUnavailable)
}
#[cfg(debug_assertions)]
fn cleanup_qa(p: CloudProvider) -> Result<(), VaultError> {
    if std::env::var_os("W55_WEB_QA_SCOPE").is_none() {
        return Err(VaultError::Denied);
    }
    use windows_sys::Win32::Security::Credentials::{CredDeleteW, CRED_TYPE_GENERIC};
    let (install, principal) = scope_names()?;
    let label = match p {
        CloudProvider::OpenRouter => "OPENROUTER",
        CloudProvider::OpenAi => "OPENAI_API",
    };
    let mut h = Sha256::new();
    for x in ["YANCE_V2_NATIVE_CLOUD_KEYS_V1", &install, &principal, label] {
        h.update((x.len() as u32).to_le_bytes());
        h.update(x.as_bytes());
    }
    let target = format!("YanceV2-W55-NATIVE-CLOUD-KEY-V1:{:x}", h.finalize());
    let w: Vec<u16> = target.encode_utf16().chain(Some(0)).collect();
    unsafe {
        CredDeleteW(w.as_ptr(), CRED_TYPE_GENERIC, 0);
    }
    Ok(())
}
fn run() -> Result<(), VaultError> {
    let mut bytes = Zeroizing::new(Vec::new());
    io::stdin()
        .lock()
        .take((MAX_INPUT + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| VaultError::Denied)?;
    if bytes.is_empty() || bytes.len() > MAX_INPUT {
        return Err(VaultError::Denied);
    }
    let mut req: Request = serde_json::from_slice(&bytes).map_err(|_| VaultError::Denied)?;
    bytes.fill(0);
    let secret = req.secret.take().map(Zeroizing::new);
    let p = req.provider;
    let v = native()?;
    let out = io::stdout();
    let mut out = out.lock();
    match req.op.as_str() {
        "status" => {
            if secret.is_some() || req.expected_revision.is_some() {
                return Err(VaultError::Denied);
            }
            status(&v, p, &mut out)
        }
        "store" => {
            let s = secret.as_ref().ok_or(VaultError::Denied)?;
            match (req.expected_revision, v.status(p)) {
                (None, Err(VaultError::Missing)) => {
                    v.enroll(p, s.as_bytes())?;
                }
                (Some(n), Ok(cur)) if n > 0 && cur.revision == n => {
                    if cur.revoked {
                        v.re_enroll_revoked(p, n, s.as_bytes())?;
                    } else {
                        v.rotate(p, n, s.as_bytes())?;
                    }
                }
                _ => return Err(VaultError::Stale),
            }
            status(&v, p, &mut out)
        }
        "revoke" => {
            if secret.is_some() {
                return Err(VaultError::Denied);
            }
            v.revoke(
                p,
                req.expected_revision
                    .filter(|n| *n > 0)
                    .ok_or(VaultError::Denied)?,
            )?;
            status(&v, p, &mut out)
        }
        "lease_for_agno" => {
            if secret.is_some() {
                return Err(VaultError::Denied);
            }
            let revision = req
                .expected_revision
                .filter(|n| *n > 0)
                .ok_or(VaultError::Denied)?;
            // W47's checked, explicit user selection and paid eligibility is required
            // BEFORE this internal command. Borrow Key only while writing private pipe.
            v.with_native_key(p, revision, |key| {
                let value = std::str::from_utf8(key).map_err(|_| VaultError::Corrupt)?;
                out.write_all(b"{\"ok\":true,\"privateKey\":")
                    .map_err(|_| VaultError::OsUnavailable)?;
                serde_json::to_writer(&mut out, &value).map_err(|_| VaultError::OsUnavailable)?;
                out.write_all(b"}\n").map_err(|_| VaultError::OsUnavailable)
            })
        }
        #[cfg(debug_assertions)]
        "qa_cleanup" => {
            if secret.is_some() || req.expected_revision.is_some() {
                return Err(VaultError::Denied);
            }
            cleanup_qa(p)?;
            out.write_all(b"{\"ok\":true,\"qaCleaned\":true}\n")
                .map_err(|_| VaultError::OsUnavailable)
        }
        _ => Err(VaultError::Denied),
    }
}
fn main() {
    if run().is_err() {
        // Generic error only. Never echo input, provider token, scope or OS SID.
        let _ = io::stdout().write_all(b"{\"ok\":false,\"error\":\"NATIVE_CREDENTIAL_DENIED\"}\n");
        std::process::exit(3);
    }
}
