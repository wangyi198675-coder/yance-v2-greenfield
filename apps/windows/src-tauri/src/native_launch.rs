//! W54 host-owned, child-only bootstrap. No public HTTP identity endpoint.
//! Fail closed until the independent W47 executable AND WebView cookie
//! injection contract are signed. No cloud model/credential access here.
use crate::{native_profile::NativeProfileAuthority, session::SessionAuthority};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::mpsc,
    thread,
    time::Duration,
};

/// This is an internal host capability; no renderer or localhost argument may
/// configure a binary, pin, principal or user path.
pub(crate) struct NativeChildLaunch {
    bundle_resources: PathBuf,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LaunchFrame<'a> {
    protocol: &'static str,
    challenge: &'a str,
    principal_ref: &'a str,
    installation_ref: &'a str,
    native_session_ref: &'a str,
    native_session_revision: u64,
    native_revocation_generation: u64,
    app_local_data_root: &'a str,
}
pub(crate) struct HostedChild {
    child: Child,
}
impl HostedChild {
    pub(crate) fn shutdown(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
impl Drop for HostedChild {
    fn drop(&mut self) {
        self.shutdown();
    }
}
fn sha256_file(file: &Path) -> Result<[u8; 32], &'static str> {
    let mut handle = fs::File::open(file).map_err(|_| "NATIVE_CHILD_BINARY_MISSING")?;
    let mut digest = Sha256::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = handle
            .read(&mut buf)
            .map_err(|_| "NATIVE_CHILD_READ_FAILED")?;
        if n == 0 {
            break;
        }
        digest.update(&buf[..n]);
    }
    Ok(digest.finalize().into())
}
fn secure_hex() -> Result<String, &'static str> {
    let mut buf = [0u8; 32];
    getrandom::fill(&mut buf).map_err(|_| "NATIVE_CHILD_ENTROPY_MISSING")?;
    Ok(buf.iter().map(|x| format!("{x:02x}")).collect())
}
fn validate_candidate(
    root: &Path,
    relative: &Path,
    pin: &[u8; 32],
) -> Result<PathBuf, &'static str> {
    if relative.is_absolute()
        || relative
            .components()
            .any(|part| !matches!(part, std::path::Component::Normal(_)))
    {
        return Err("NATIVE_CHILD_RELATIVE_BUNDLE_PATH_REQUIRED");
    }
    let canon_root = root
        .canonicalize()
        .map_err(|_| "NATIVE_BUNDLE_ROOT_UNAVAILABLE")?;
    let target = root
        .join(relative)
        .canonicalize()
        .map_err(|_| "NATIVE_CHILD_BINARY_MISSING")?;
    if !target.starts_with(&canon_root) || target == canon_root {
        return Err("NATIVE_CHILD_ESCAPES_BUNDLE");
    }
    // Never accept junctions/symlinks on any untrusted intermediate component.
    let mut cursor = canon_root.clone();
    for component in relative.components() {
        cursor.push(component.as_os_str());
        if fs::symlink_metadata(&cursor)
            .map_err(|_| "NATIVE_CHILD_FILE_MISSING")?
            .file_type()
            .is_symlink()
        {
            return Err("NATIVE_CHILD_LINK_REJECTED");
        }
    }
    if !target.is_file() {
        return Err("NATIVE_CHILD_NOT_FILE");
    }
    if sha256_file(&target)? != *pin {
        return Err("NATIVE_CHILD_SHA256_NOT_APPROVED");
    }
    Ok(target)
}
/// Build-time pin (never a runtime env, browser header or user provided path).
/// The official release builder must audit all executable/runtime assets
/// and provide the exact approved W47 self-contained binary SHA256.
fn parse_embedded_w47_sha(pin: Option<&str>) -> Result<Option<[u8; 32]>, &'static str> {
    let pin = match pin {
        Some(p) => p,
        None => return Ok(None),
    };
    if pin.len() != 64
        || !pin
            .bytes()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
    {
        return Err("W54_SIGNED_W47_SHA256_PIN_INVALID");
    }
    let mut b = [0u8; 32];
    for (i, pair) in pin.as_bytes().chunks_exact(2).enumerate() {
        b[i] = u8::from_str_radix(
            std::str::from_utf8(pair).map_err(|_| "W54_SIGNED_W47_SHA256_PIN_INVALID")?,
            16,
        )
        .map_err(|_| "W54_SIGNED_W47_SHA256_PIN_INVALID")?;
    }
    Ok(Some(b))
}
impl NativeChildLaunch {
    /// Use ONLY for official installed bundles. The binary must be the
    /// original W47 Owner's self-contained, reviewed native entrypoint.
    /// No pin => lab/source-only build; NO W47 child and NO first-party session.
    /// A pin with missing/mismatched executable is a hard deny, not fallback.
    pub(crate) fn start_approved_installed_w47(
        &self,
        native: &NativeProfileAuthority,
        session: &SessionAuthority,
    ) -> Result<Option<HostedChild>, &'static str> {
        let pin = parse_embedded_w47_sha(option_env!("YANCE_W54_SIGNED_W47_SHA256"))?;
        let Some(pin) = pin else { return Ok(None) };
        let child = self.launch_reviewed(Path::new("w47/w47-native.exe"), pin, native, session)?;
        Ok(Some(child))
    }
    pub(crate) fn new(bundle_resources: PathBuf) -> Self {
        Self { bundle_resources }
    }
    /// Only a future SECURITY-APPROVED native composition may call this,
    /// with a pinned bundled W47 executable and a W47 authenticated reader.
    /// It never grants a browser session by itself.
    #[allow(dead_code)]
    pub(crate) fn launch_reviewed(
        &self,
        relative_binary: &Path,
        expected_sha256: [u8; 32],
        native: &NativeProfileAuthority,
        session: &SessionAuthority,
    ) -> Result<HostedChild, &'static str> {
        self.launch_with_args(relative_binary, expected_sha256, native, session, &[])
    }
    /// Extra arguments are private test-only seam, not a renderer option.
    #[allow(dead_code)]
    fn launch_with_args(
        &self,
        relative_binary: &Path,
        expected_sha256: [u8; 32],
        native: &NativeProfileAuthority,
        session: &SessionAuthority,
        args: &[&str],
    ) -> Result<HostedChild, &'static str> {
        // Verify before launch; recheck native epoch immediately before sending.
        let target = validate_candidate(&self.bundle_resources, relative_binary, &expected_sha256)?;
        let proof = native.verify_for_native_owner(session)?;
        let (principal, installation, session_ref, revision, generation, root) =
            proof.native_contract_parts();
        let root = root.to_str().ok_or("NATIVE_APPDATA_UTF8_REQUIRED")?;
        let challenge = secure_hex()?;
        // Pipe handles are inherited only by this direct child, not sent via
        // argv/environment, browser JavaScript, ordinary localhost or logs.
        let mut child = Command::new(&target)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| "NATIVE_CHILD_START_DENIED")?;
        let result = (|| {
            // Pin must still match after spawn: changed bundle => revoke child.
            if sha256_file(&target)? != expected_sha256 {
                return Err("NATIVE_CHILD_BINARY_CHANGED");
            }
            let frame = LaunchFrame {
                protocol: "W54_W47_NATIVE_CHILD_V1",
                challenge: &challenge,
                principal_ref: principal,
                installation_ref: installation,
                native_session_ref: session_ref,
                native_session_revision: revision,
                native_revocation_generation: generation,
                app_local_data_root: root,
            };
            let bytes = serde_json::to_vec(&frame).map_err(|_| "NATIVE_CHILD_FRAME_INVALID")?;
            if bytes.len() > 4096 {
                return Err("NATIVE_CHILD_FRAME_TOO_LARGE");
            }
            let mut stdin = child.stdin.take().ok_or("NATIVE_CHILD_STDIN_MISSING")?;
            stdin
                .write_all(&(bytes.len() as u32).to_be_bytes())
                .and_then(|_| stdin.write_all(&bytes))
                .and_then(|_| stdin.flush())
                .map_err(|_| "NATIVE_CHILD_PIPE_WRITE_FAILED")?;
            // Keep stdin closed to avoid silently presenting a general pipe
            // command API. A real production W47 channel must sign ongoing
            // revocation/liveness and WebView cookie delivery separately.
            drop(stdin);
            let mut stdout = child.stdout.take().ok_or("NATIVE_CHILD_STDOUT_MISSING")?;
            let (tx, rx) = mpsc::sync_channel(1);
            let _reader = thread::spawn(move || {
                let mut len = [0u8; 4];
                let frame = (|| {
                    stdout.read_exact(&mut len).ok()?;
                    let n = u32::from_be_bytes(len) as usize;
                    if n > 512 || n == 0 {
                        return None;
                    }
                    let mut bytes = vec![0; n];
                    stdout.read_exact(&mut bytes).ok()?;
                    serde_json::from_slice::<serde_json::Value>(&bytes).ok()
                })();
                let _ = tx.send(frame);
            });
            let ack = rx
                .recv_timeout(Duration::from_secs(2))
                .map_err(|_| "NATIVE_CHILD_ACK_TIMEOUT")?
                .ok_or("NATIVE_CHILD_ACK_INVALID")?;
            if ack.get("protocol").and_then(|x| x.as_str()) != Some("W54_W47_NATIVE_CHILD_V1")
                || ack.get("status").and_then(|x| x.as_str()) != Some("CHILD_READY")
                || ack.get("challenge").and_then(|x| x.as_str()) != Some(challenge.as_str())
            {
                return Err("NATIVE_CHILD_CHALLENGE_MISMATCH");
            }
            // Reject startup if logout/restart took place during handshake.
            native.verify_for_native_owner(session)?;
            if child
                .try_wait()
                .map_err(|_| "NATIVE_CHILD_LIVENESS_UNKNOWN")?
                .is_some()
            {
                return Err("NATIVE_CHILD_EXITED_DURING_HANDSHAKE");
            }
            Ok(())
        })();
        if let Err(err) = result {
            let _ = child.kill();
            let _ = child.wait();
            return Err(err);
        }
        Ok(HostedChild { child })
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};
    fn temp_root() -> PathBuf {
        let n = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let p = std::env::temp_dir().join(format!("w54-child-pin-{}-{n}", std::process::id()));
        fs::create_dir_all(&p).unwrap();
        p
    }
    #[test]
    fn only_explicit_build_pinned_w47_binary_can_enable_host_launch() {
        assert_eq!(parse_embedded_w47_sha(None).unwrap(), None);
        assert_eq!(
            parse_embedded_w47_sha(Some("")).unwrap_err(),
            "W54_SIGNED_W47_SHA256_PIN_INVALID"
        );
        assert_eq!(
            parse_embedded_w47_sha(Some(&"G".repeat(64))).unwrap_err(),
            "W54_SIGNED_W47_SHA256_PIN_INVALID"
        );
        assert_eq!(
            parse_embedded_w47_sha(Some(&"F".repeat(64))).unwrap_err(),
            "W54_SIGNED_W47_SHA256_PIN_INVALID"
        );
        assert_eq!(
            parse_embedded_w47_sha(Some(&"a".repeat(64))).unwrap(),
            Some([0xaa; 32])
        );
        assert_eq!(
            parse_embedded_w47_sha(Some("w54i_user_input")).unwrap_err(),
            "W54_SIGNED_W47_SHA256_PIN_INVALID"
        );
    }
    #[test]
    fn reject_absolute_or_parent_traversal() {
        let p = temp_root();
        let pin = [0u8; 32];
        assert_eq!(
            validate_candidate(&p, Path::new("../malicious.exe"), &pin).unwrap_err(),
            "NATIVE_CHILD_RELATIVE_BUNDLE_PATH_REQUIRED"
        );
        assert_eq!(
            validate_candidate(&p, &p.join("outside.exe"), &pin).unwrap_err(),
            "NATIVE_CHILD_RELATIVE_BUNDLE_PATH_REQUIRED"
        );
        fs::remove_dir_all(p).unwrap();
    }
    #[test]
    fn reject_unapproved_child_hash_even_when_file_exists() {
        let p = temp_root();
        fs::write(p.join("api.exe"), b"not-an-approved-binary").unwrap();
        assert_eq!(
            validate_candidate(&p, Path::new("api.exe"), &[0u8; 32]).unwrap_err(),
            "NATIVE_CHILD_SHA256_NOT_APPROVED"
        );
        fs::remove_dir_all(p).unwrap();
    }
    #[test]
    fn accept_only_exact_existing_bundle_hash() {
        let p = temp_root();
        fs::write(p.join("api.exe"), b"fake-binary").unwrap();
        let sha = sha256_file(&p.join("api.exe")).unwrap();
        assert_eq!(
            validate_candidate(&p, Path::new("api.exe"), &sha).unwrap(),
            p.join("api.exe").canonicalize().unwrap()
        );
        fs::remove_dir_all(p).unwrap();
    }
    #[test]
    fn private_frame_has_no_cookie_or_cloud_key_fields() {
        let frame = LaunchFrame {
            protocol: "W54_W47_NATIVE_CHILD_V1",
            challenge: "nonce",
            principal_ref: "w54u_example",
            installation_ref: "w54i_example",
            native_session_ref: "w54s_example",
            native_session_revision: 1,
            native_revocation_generation: 2,
            app_local_data_root: "native-only-test-dir",
        };
        let v = serde_json::to_string(&frame).unwrap();
        assert!(v.contains("nativeRevocationGeneration"));
        assert!(!v.contains("apiKey") && !v.contains("cookie") && !v.contains("provider"));
    }
    #[cfg(windows)]
    #[test]
    fn real_child_private_pipe_challenge_and_bad_ack_denied() {
        use crate::{
            native_profile::NativeProfileAuthority, session::SessionAuthority,
            user_dirs::UserDirectories, windows_principal::current_windows_principal,
        };
        let node = std::env::var_os("PATH")
            .and_then(|v| {
                std::env::split_paths(&v)
                    .map(|p| p.join("node.exe"))
                    .find(|p| p.is_file())
            })
            .expect("Windows QA requires Node.js binary on PATH");
        let pkg = temp_root();
        let bin = pkg.join("api.exe");
        fs::copy(&node, &bin).expect("copy test-only Node fixture executable");
        let sha = sha256_file(&bin).unwrap();
        let state_root = temp_root();
        let dirs = UserDirectories {
            data: state_root.join("data"),
            config: state_root.join("config"),
            cache: state_root.join("cache"),
        };
        dirs.initialize().unwrap();
        let s = SessionAuthority::new(
            Some(current_windows_principal().unwrap()),
            Duration::from_secs(60),
        )
        .unwrap();
        let native = NativeProfileAuthority::new(&dirs).unwrap();
        let launcher = NativeChildLaunch::new(pkg.clone());
        let script = r#"let b=Buffer.alloc(0);process.stdin.on('data',x=>{b=Buffer.concat([b,x])});process.stdin.on('end',()=>{let n=b.readUInt32BE(0);let j=JSON.parse(b.subarray(4,4+n));let x=Buffer.from(JSON.stringify({protocol:j.protocol,status:'CHILD_READY',challenge:j.challenge}));let l=Buffer.alloc(4);l.writeUInt32BE(x.length);process.stdout.write(Buffer.concat([l,x]));setInterval(()=>{},1000)});"#;
        let hosted = launcher
            .launch_with_args(Path::new("api.exe"), sha, &native, &s, &["-e", script])
            .expect("pinned child private stdio challenge");
        drop(hosted);
        let invalid = r#"let b=Buffer.alloc(0);process.stdin.on('data',x=>{b=Buffer.concat([b,x])});process.stdin.on('end',()=>{let x=Buffer.from(JSON.stringify({protocol:'W54_W47_NATIVE_CHILD_V1',status:'CHILD_READY',challenge:'browser-forged'}));let l=Buffer.alloc(4);l.writeUInt32BE(x.length);process.stdout.write(Buffer.concat([l,x]))});"#;
        assert_eq!(
            launcher
                .launch_with_args(Path::new("api.exe"), sha, &native, &s, &["-e", invalid])
                .err()
                .unwrap(),
            "NATIVE_CHILD_CHALLENGE_MISMATCH"
        );
        fs::remove_dir_all(pkg).unwrap();
        fs::remove_dir_all(state_root).unwrap();
    }

    /// Actual original W47 server.mjs test (NOT copied fake ACK child).
    /// W47's current real entrypoint has no native pipe reader, so W54 must
    /// fail closed and kill it. Manually run with W54_QA_REAL_W47_RUNTIME_DIR.
    #[cfg(windows)]
    #[test]
    #[ignore = "requires explicit real W47 QA runtime path and no active deployment"]
    fn real_w47_server_must_reject_until_native_receiver_is_wired() {
        use crate::{
            native_profile::NativeProfileAuthority, session::SessionAuthority,
            user_dirs::UserDirectories, windows_principal::current_windows_principal,
        };
        let runtime_root = PathBuf::from(
            std::env::var_os("W54_QA_REAL_W47_RUNTIME_DIR")
                .expect("W54_QA_REAL_W47_RUNTIME_DIR must point to original W47 runtime"),
        );
        let server = runtime_root
            .join("server.mjs")
            .canonicalize()
            .expect("actual W47 server.mjs must exist");
        assert!(server.is_file());
        let node = std::env::var_os("PATH")
            .and_then(|v| {
                std::env::split_paths(&v)
                    .map(|p| p.join("node.exe"))
                    .find(|p| p.is_file())
            })
            .expect("real Windows Node executable required");
        let pkg = temp_root();
        let bin = pkg.join("w47-runtime.exe");
        fs::copy(&node, &bin).expect("test-only pinned Node executable");
        let exact_node_sha = sha256_file(&bin).unwrap();
        let t = temp_root();
        let dirs = UserDirectories {
            data: t.join("data"),
            config: t.join("config"),
            cache: t.join("cache"),
        };
        dirs.initialize().unwrap();
        let session = SessionAuthority::new(
            Some(current_windows_principal().unwrap()),
            Duration::from_secs(30),
        )
        .unwrap();
        let authority = NativeProfileAuthority::new(&dirs).unwrap();
        let launcher = NativeChildLaunch::new(pkg.clone());
        // Reserve and release a free loopback port. Race is fail-closed.
        let probe = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = probe.local_addr().unwrap().port();
        drop(probe);
        let url = format!("file:///{}", server.to_string_lossy().replace('\\', "/"));
        let script=format!(
            "process.env.YANCE_W47_RUNTIME_MODE='development';process.env.YANCE_W47_API_PORT='{}';process.env.YANCE_W47_WEB_ORIGIN='http://127.0.0.1:44760';import('{}')",
            port,url
        );
        let result = launcher.launch_with_args(
            Path::new("w47-runtime.exe"),
            exact_node_sha,
            &authority,
            &session,
            &["-e", &script],
        );
        let err = result
            .err()
            .expect("unapproved W47 real entrypoint must NOT produce a trusted ACK");
        assert!(
            matches!(
                err,
                "NATIVE_CHILD_ACK_INVALID"
                    | "NATIVE_CHILD_ACK_TIMEOUT"
                    | "NATIVE_CHILD_PIPE_WRITE_FAILED"
            ),
            "actual W47 unexpected startup outcome: {err}"
        );
        fs::remove_dir_all(pkg).unwrap();
        fs::remove_dir_all(t).unwrap();
    }
}
