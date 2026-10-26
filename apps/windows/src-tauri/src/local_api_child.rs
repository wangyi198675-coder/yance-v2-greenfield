//! Normal PRIVATE chat: original W47 API is a bundled per-user localhost child.
//! This only starts the existing upstream runtime. It grants NO social provider,
//! W55 secret, paid model, or HTTP/browser Principal. No pairing or certificate platform.
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::mpsc,
    thread,
    time::Duration,
};

pub(crate) struct LocalApiChild {
    child: Child,
    pub(crate) origin: String,
}
impl LocalApiChild {
    pub(crate) fn shutdown(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
impl Drop for LocalApiChild {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn hash(path: &Path) -> Result<String, &'static str> {
    let mut f = File::open(path).map_err(|_| "LOCAL_API_BUNDLE_FILE_MISSING")?;
    let mut d = Sha256::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = f.read(&mut buf).map_err(|_| "LOCAL_API_HASH_READ_FAILED")?;
        if n == 0 {
            break;
        }
        d.update(&buf[..n]);
    }
    Ok(format!("{:x}", d.finalize()))
}
// std::fs::canonicalize on Windows yields a verbatim \\?\ path.
// Node 24's process entrypoint resolver does not accept that spelling in argv,
// although the canonicalized path was already safely checked above.
// Convert only the launch ARGUMENT, never the verified source of authority.
#[cfg(windows)]
fn node_entry_argument(canonical: &Path) -> Result<PathBuf, &'static str> {
    use std::path::Component;
    let s = canonical
        .to_str()
        .ok_or("LOCAL_API_NODE_ENTRY_UTF8_REQUIRED")?;
    let normal = s.strip_prefix(r"\\?\").unwrap_or(s);
    if normal.len() < 4
        || !normal.as_bytes()[0].is_ascii_alphabetic()
        || normal.as_bytes()[1] != b':'
        || normal.as_bytes()[2] != b'\\'
    {
        return Err("LOCAL_API_NODE_ENTRY_NOT_WINDOWS_DRIVE");
    }
    let candidate = PathBuf::from(normal);
    if !candidate.is_absolute()
        || candidate
            .components()
            .any(|c| matches!(c, Component::ParentDir))
    {
        return Err("LOCAL_API_NODE_ENTRY_UNSAFE");
    }
    Ok(candidate)
}
#[cfg(not(windows))]
fn node_entry_argument(canonical: &Path) -> Result<PathBuf, &'static str> {
    Ok(canonical.to_path_buf())
}
fn bundled(root: &Path, rel: &str) -> Result<PathBuf, &'static str> {
    let base = root
        .canonicalize()
        .map_err(|_| "LOCAL_API_RESOURCE_ROOT_MISSING")?;
    let mut current = base.clone();
    for part in Path::new(rel).components() {
        match part {
            std::path::Component::Normal(p) => current.push(p),
            _ => return Err("LOCAL_API_RESOURCE_PATH_INVALID"),
        }
        if fs::symlink_metadata(&current)
            .map_err(|_| "LOCAL_API_RESOURCE_MISSING")?
            .file_type()
            .is_symlink()
        {
            return Err("LOCAL_API_RESOURCE_LINK_DENIED");
        }
    }
    let target = current
        .canonicalize()
        .map_err(|_| "LOCAL_API_RESOURCE_MISSING")?;
    if !target.starts_with(&base) || !target.is_file() {
        return Err("LOCAL_API_RESOURCE_ESCAPES_BUNDLE");
    }
    Ok(target)
}
pub(crate) fn start_bundled(
    resource_dir: &Path,
    api_source_sha: &str,
    server_digest: &str,
    web_manifest_digest: &str,
    port: u16,
) -> Result<LocalApiChild, &'static str> {
    if port == 0
        || api_source_sha.len() != 40
        || !api_source_sha
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
        || ![server_digest, web_manifest_digest].iter().all(|s| {
            s.len() == 64
                && s.bytes()
                    .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
        })
    {
        return Err("LOCAL_API_PIN_INVALID");
    }
    let exe = bundled(resource_dir, "w47/node.exe")?;
    let server = bundled(resource_dir, "w47/runtime/server.mjs")?;
    let manifest = bundled(resource_dir, "w47/web-manifest.json")?;
    let web = bundled(resource_dir, "w47/web/version.json")?;
    if hash(&server)? != server_digest || hash(&manifest)? != web_manifest_digest {
        return Err("LOCAL_API_PACKAGE_HASH_MISMATCH");
    }
    let version: Value =
        serde_json::from_slice(&fs::read(web).map_err(|_| "LOCAL_API_WEB_VERSION_UNREADABLE")?)
            .map_err(|_| "LOCAL_API_WEB_VERSION_INVALID")?;
    if version["source_sha"] != api_source_sha
        || version["trustedSession"] != false
        || version["canSend"] != false
    {
        return Err("LOCAL_API_WEB_VERSION_MISMATCH");
    }
    let origin = format!("http://127.0.0.1:{port}");
    let root = resource_dir.join("w47/web");
    let mut child = Command::new(&exe)
        .arg(node_entry_argument(&server)?)
        .current_dir(server.parent().ok_or("LOCAL_API_SERVER_DIR_MISSING")?)
        .env("YANCE_W47_RUNTIME_MODE", "installed")
        .env("YANCE_W47_API_PORT", port.to_string())
        .env("YANCE_W47_WEB_ORIGIN", &origin)
        .env("YANCE_W47_NATIVE_WEB_ROOT", &root)
        .env("YANCE_W47_NATIVE_WEB_MANIFEST", &manifest)
        .env("YANCE_W47_NATIVE_WEB_MANIFEST_SHA256", web_manifest_digest)
        .env("YANCE_W47_NATIVE_WEB_SOURCE_SHA", api_source_sha)
        // terminal pairing is not required for ordinary private use.
        .env_remove("YANCE_W47_OPERATOR_PAIRING")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(if cfg!(test) {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .spawn()
        .map_err(|_| "LOCAL_API_CHILD_START_FAILED")?;
    let result = (|| {
        let stdout = child
            .stdout
            .take()
            .ok_or("LOCAL_API_CHILD_STDOUT_MISSING")?;
        let (tx, rx) = mpsc::channel();
        thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            for _ in 0..12 {
                let mut line = String::new();
                if reader.read_line(&mut line).unwrap_or(0) == 0 {
                    break;
                }
                if line.len() > 2048 {
                    break;
                }
                if let Ok(event) = serde_json::from_str::<Value>(&line) {
                    if event["event"] == "V2_API_READY" {
                        let _ = tx.send(event);
                        break;
                    }
                }
            }
        });
        let ready = rx
            .recv_timeout(Duration::from_secs(8))
            .map_err(|_| "LOCAL_API_READY_TIMEOUT")?;
        if ready["url"] != origin
            || ready["apiGitSha"] != api_source_sha
            || ready["runtimeMode"] != "installed"
        {
            return Err("LOCAL_API_READY_SOURCE_MISMATCH");
        }
        if child
            .try_wait()
            .map_err(|_| "LOCAL_API_WAIT_FAILED")?
            .is_some()
        {
            return Err("LOCAL_API_CHILD_EXITED");
        }
        // Neither READY nor loopback alone is provider auth or paid API consent.
        Ok(())
    })();
    match result {
        Ok(()) => Ok(LocalApiChild { child, origin }),
        Err(e) => {
            let _ = child.kill();
            let _ = child.wait();
            #[cfg(test)]
            if let Some(mut stream) = child.stderr.take() {
                let mut diagnostic = String::new();
                let _ = stream.read_to_string(&mut diagnostic);
                eprintln!("W54 QA only W47 native child stderr: {}", diagnostic);
            }
            Err(e)
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "actual installed API resources required, explicit nonproduction QA only"]
    fn real_installed_original_w47_source_starts() {
        let root = PathBuf::from(
            std::env::var_os("W54_QA_W47_INSTALLED_ROOT")
                .expect("W54_QA_W47_INSTALLED_ROOT required"),
        );
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        drop(l);
        let mut api = start_bundled(
            &root,
            "e352180cba665b56b35822fa2aff2c7525360016",
            "911e0a1d8fa367c5b5e61d490441d40cef129a52196bde5d89160d5db4d62457",
            "7a2c5a0e32b192f47cc6524a7cf49813386bd1e73fb3fed6d07dae25288222fa",
            port,
        )
        .expect("original installed W47 API must start and report exact READY");
        assert_eq!(api.origin, format!("http://127.0.0.1:{port}"));
        assert!(api.child.try_wait().unwrap().is_none());
        api.shutdown();
    }
    #[test]
    fn reject_empty_and_malformed_bundle_metadata() {
        let z = "0".repeat(64);
        assert!(start_bundled(Path::new("missing"), "fake", &z, &z, 20).is_err());
        assert!(start_bundled(Path::new("missing"), &"a".repeat(40), &z, &z, 0).is_err());
        assert!(bundled(Path::new("missing"), "../w47").is_err());
    }
}
