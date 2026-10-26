//! W54: non-exported current-OS-user / installed-app reference.
//! Local references are identifiers, NOT browser bearer tokens or evidence
//! that an independent W47 process has authenticated this host.
//! Same-Windows-user process compromise is not solved by per-user file ACL.
use crate::{
    session::SessionAuthority,
    user_dirs::UserDirectories,
    windows_principal::{current_windows_principal, WindowsPrincipal},
};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};

const STATE_NAME: &str = "w54-native-binding.state";
const STATE_SCHEMA: &str = "W54_NATIVE_BINDING_V1";
const MAX_BYTES: u64 = 160;

#[derive(Clone, PartialEq, Eq)]
struct Stored {
    installation_hex: String,
    revocation_generation: u64,
}
impl Stored {
    fn parse(bytes: &[u8]) -> Result<Self, &'static str> {
        let s = std::str::from_utf8(bytes).map_err(|_| "INVALID_NATIVE_BINDING_STATE")?;
        let mut lines = s.split('\n');
        if lines.next() != Some(STATE_SCHEMA) {
            return Err("UNKNOWN_NATIVE_BINDING_STATE");
        }
        let id = lines.next().ok_or("INVALID_NATIVE_BINDING_STATE")?;
        if id.len() != 64 || !id.as_bytes().iter().all(u8::is_ascii_hexdigit) {
            return Err("INVALID_NATIVE_INSTALLATION_REF");
        }
        let raw = lines.next().ok_or("INVALID_NATIVE_BINDING_STATE")?;
        let generation = raw
            .parse::<u64>()
            .map_err(|_| "INVALID_NATIVE_GENERATION")?;
        if generation == 0 || lines.next() != Some("") || lines.next().is_some() {
            return Err("INVALID_NATIVE_BINDING_STATE");
        }
        Ok(Self {
            installation_hex: id.to_owned(),
            revocation_generation: generation,
        })
    }
    fn encode(&self) -> Vec<u8> {
        format!(
            "{STATE_SCHEMA}\n{}\n{}\n",
            self.installation_hex, self.revocation_generation
        )
        .into_bytes()
    }
}

fn random_hex() -> Result<String, &'static str> {
    let mut raw = [0u8; 32];
    getrandom::fill(&mut raw).map_err(|_| "NATIVE_OS_RNG_UNAVAILABLE")?;
    Ok(raw.iter().map(|v| format!("{v:02x}")).collect())
}

fn file_is_safe(path: &Path) -> Result<(), &'static str> {
    let meta = fs::symlink_metadata(path).map_err(|_| "NATIVE_BINDING_STATE_UNREADABLE")?;
    if !meta.is_file() || meta.file_type().is_symlink() {
        return Err("NATIVE_BINDING_STATE_LINK_REJECTED");
    }
    Ok(())
}

fn open_locked(path: &Path) -> Result<(File, bool), &'static str> {
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        // Exclusive handle denies concurrent writers. Create-new distinguishes a
        // first install from a crash-truncated existing state (fail closed).
        let initial = OpenOptions::new()
            .read(true)
            .write(true)
            .create_new(true)
            .share_mode(0)
            .open(path);
        match initial {
            Ok(file) => Ok((file, true)),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => OpenOptions::new()
                .read(true)
                .write(true)
                .share_mode(0)
                .open(path)
                .map(|file| (file, false))
                .map_err(|_| "NATIVE_BINDING_FILE_BUSY_OR_DENIED"),
            Err(_) => Err("NATIVE_BINDING_FILE_BUSY_OR_DENIED"),
        }
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("NATIVE_WINDOWS_ONLY")
    }
}

fn locked_state<F, T>(path: &Path, change: F) -> Result<T, &'static str>
where
    F: FnOnce(&Stored) -> Result<(Stored, T), &'static str>,
{
    if path.exists() {
        file_is_safe(path)?;
    }
    let (mut f, newly_created) = open_locked(path)?;
    file_is_safe(path)?;
    let size = f.metadata().map_err(|_| "NATIVE_STATE_STAT_FAILED")?.len();
    if size > MAX_BYTES {
        return Err("NATIVE_BINDING_STATE_TOO_LARGE");
    }
    let mut raw = Vec::new();
    f.read_to_end(&mut raw)
        .map_err(|_| "NATIVE_STATE_READ_FAILED")?;
    let stored = if raw.is_empty() && newly_created {
        Stored {
            installation_hex: random_hex()?,
            revocation_generation: 1,
        }
    } else {
        Stored::parse(&raw)?
    };
    let (next, result) = change(&stored)?;
    let bytes = next.encode();
    f.seek(SeekFrom::Start(0))
        .map_err(|_| "NATIVE_STATE_SEEK_FAILED")?;
    f.write_all(&bytes)
        .map_err(|_| "NATIVE_STATE_WRITE_FAILED")?;
    f.set_len(bytes.len() as u64)
        .map_err(|_| "NATIVE_STATE_TRUNCATE_FAILED")?;
    f.sync_all().map_err(|_| "NATIVE_STATE_SYNC_FAILED")?;
    Ok(result)
}

fn bump(current: &Stored) -> Result<Stored, &'static str> {
    Ok(Stored {
        installation_hex: current.installation_hex.clone(),
        revocation_generation: current
            .revocation_generation
            .checked_add(1)
            .ok_or("NATIVE_GENERATION_OVERFLOW")?,
    })
}

/// Internal process-owned identifiers. Never Serialize or expose to Tauri invoke.
#[allow(dead_code)]
pub(crate) struct NativeProfileEvidence {
    principal_ref: String,
    installation_ref: String,
    session_ref: String,
    session_revision: u64,
    revocation_generation: u64,
    app_local_data_root: PathBuf,
}
impl std::fmt::Debug for NativeProfileEvidence {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("NativeProfileEvidence(REDACTED_AND_NOT_EXPORTED)")
    }
}
impl NativeProfileEvidence {
    /// W47's future server-only adapter may consume these values ONLY after
    /// independently verifying an approved native channel and live epoch.
    /// The DTO is not proof by itself (including if copied into HTTP).
    #[allow(dead_code)]
    pub(crate) fn native_contract_parts(&self) -> (&str, &str, &str, u64, u64, &Path) {
        (
            &self.principal_ref,
            &self.installation_ref,
            &self.session_ref,
            self.session_revision,
            self.revocation_generation,
            &self.app_local_data_root,
        )
    }
}

/// Cross-check Tauri local data against the Windows current-user Known Folder,
/// not a browser/HTTP supplied path. Win32 determines effective user's folder.
#[cfg(windows)]
fn windows_local_appdata() -> Result<PathBuf, &'static str> {
    use std::ptr::null_mut;
    use windows_sys::Win32::{
        System::Com::CoTaskMemFree,
        UI::Shell::{FOLDERID_LocalAppData, SHGetKnownFolderPath},
    };
    unsafe {
        let mut wide: *mut u16 = null_mut();
        let status = SHGetKnownFolderPath(&FOLDERID_LocalAppData, 0, null_mut(), &mut wide);
        if status < 0 || wide.is_null() {
            return Err("WINDOWS_LOCAL_APPDATA_KNOWN_FOLDER_UNAVAILABLE");
        }
        struct OwnedPwstr(*mut u16);
        impl Drop for OwnedPwstr {
            fn drop(&mut self) {
                unsafe {
                    CoTaskMemFree(self.0.cast());
                }
            }
        }
        let _guard = OwnedPwstr(wide);
        let mut len = 0usize;
        while len < 32767 && *wide.add(len) != 0 {
            len += 1;
        }
        if len == 0 || len >= 32767 {
            return Err("WINDOWS_LOCAL_APPDATA_PATH_INVALID");
        }
        Ok(PathBuf::from(
            String::from_utf16(std::slice::from_raw_parts(wide, len))
                .map_err(|_| "WINDOWS_LOCAL_APPDATA_PATH_INVALID")?,
        ))
    }
}

/// Private native owner of stable install ref and Windows-profile revocation fence.
/// Startup increment invalidates previous process generation, including crashes.
pub(crate) struct NativeProfileAuthority {
    os: WindowsPrincipal,
    state: PathBuf,
    principal_ref: String,
    installation_ref: String,
    session_ref: String,
    generation: Mutex<u64>,
    app_data: PathBuf,
    canonical_root: PathBuf,
}
impl std::fmt::Debug for NativeProfileAuthority {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("NativeProfileAuthority(REDACTED)")
    }
}
impl NativeProfileAuthority {
    /// Call only from actual Tauri setup with its trusted bundle identifier.
    /// Never accept identifier/path values from request headers or WebView.
    pub(crate) fn from_tauri(
        dirs: &UserDirectories,
        app_identifier: &str,
    ) -> Result<Self, &'static str> {
        if app_identifier.is_empty()
            || dirs.data.file_name() != Some(std::ffi::OsStr::new("data"))
            || dirs.data.parent().and_then(Path::file_name)
                != Some(std::ffi::OsStr::new(app_identifier))
        {
            return Err("NATIVE_TAURI_INSTALLATION_PATH_MISMATCH");
        }
        Self::new(dirs)
    }

    pub(crate) fn new(dirs: &UserDirectories) -> Result<Self, &'static str> {
        let os = current_windows_principal()?;
        #[cfg(windows)]
        {
            // Canonicalize both OS-known-folder and current Tauri data root;
            // disallow redirected LOCALAPPDATA that points outside this user.
            let known = windows_local_appdata()?
                .canonicalize()
                .map_err(|_| "WINDOWS_LOCAL_APPDATA_UNAVAILABLE")?;
            let target = dirs
                .data
                .canonicalize()
                .map_err(|_| "NATIVE_APPDATA_ROOT_UNAVAILABLE")?;
            if !target.starts_with(&known) || target == known {
                return Err("NATIVE_APPDATA_NOT_IN_CURRENT_WINDOWS_PROFILE");
            }
        }
        Self::from_os(dirs, os)
    }
    fn from_os(dirs: &UserDirectories, os: WindowsPrincipal) -> Result<Self, &'static str> {
        if !dirs.data.is_absolute() || !dirs.data.is_dir() {
            return Err("NATIVE_APPDATA_ROOT_NOT_INITIALIZED");
        }
        let canonical_root = dirs
            .data
            .canonicalize()
            .map_err(|_| "NATIVE_APPDATA_ROOT_UNAVAILABLE")?;
        let state = dirs.data.join(STATE_NAME);
        let (id, generation) = locked_state(&state, |s| {
            let bumped = bump(s)?;
            Ok((
                bumped.clone(),
                (bumped.installation_hex, bumped.revocation_generation),
            ))
        })?;
        // SID is from the Windows process access token, never a request header.
        // It is intentionally hashed with an install-specific random namespace;
        // the resulting reference is an identifier, not an authentication secret.
        let mut hash = Sha256::new();
        hash.update(b"W54_V2_LOCAL_PRINCIPAL_V1\0");
        hash.update(&(os.sid.len() as u32).to_le_bytes());
        hash.update(&os.sid);
        hash.update(id.as_bytes());
        let principal_ref = format!("w54u_{}", hex_lower(&hash.finalize()));
        Ok(Self {
            os,
            state,
            principal_ref,
            installation_ref: format!("w54i_{id}"),
            session_ref: format!("w54s_{}", random_hex()?),
            generation: Mutex::new(generation),
            app_data: dirs.data.clone(),
            canonical_root,
        })
    }
    pub(crate) fn verify_for_native_owner(
        &self,
        session: &SessionAuthority,
    ) -> Result<NativeProfileEvidence, &'static str> {
        if current_windows_principal()? != self.os {
            return Err("NATIVE_OS_OWNER_CHANGED");
        }
        if self
            .app_data
            .canonicalize()
            .map_err(|_| "NATIVE_APPDATA_ROOT_UNAVAILABLE")?
            != self.canonical_root
        {
            return Err("NATIVE_APPDATA_ROOT_CHANGED");
        }
        let rev = session.native_active_revision()?;
        let expected = *self
            .generation
            .lock()
            .map_err(|_| "NATIVE_STATE_MUTEX_POISONED")?;
        let current = locked_state(&self.state, |s| Ok((s.clone(), s.clone())))?;
        if current.revocation_generation != expected
            || format!("w54i_{}", current.installation_hex) != self.installation_ref
        {
            return Err("NATIVE_BINDING_GENERATION_OR_INSTALLATION_STALE");
        }
        Ok(NativeProfileEvidence {
            principal_ref: self.principal_ref.clone(),
            installation_ref: self.installation_ref.clone(),
            session_ref: self.session_ref.clone(),
            session_revision: rev,
            revocation_generation: expected,
            app_local_data_root: self.app_data.clone(),
        })
    }
    /// First fence persistent generation; always revoke live native session.
    /// Unknown or locked state => fail closed, never claim success.
    pub(crate) fn revoke(&self, session: &SessionAuthority) -> Result<(), &'static str> {
        let result = (|| {
            let mut tracked = self
                .generation
                .lock()
                .map_err(|_| "NATIVE_STATE_MUTEX_POISONED")?;
            let expected = *tracked;
            let new_generation = locked_state(&self.state, |s| {
                if s.revocation_generation != expected
                    || format!("w54i_{}", s.installation_hex) != self.installation_ref
                {
                    return Err("NATIVE_BINDING_GENERATION_OR_INSTALLATION_STALE");
                }
                let next = bump(s)?;
                Ok((next.clone(), next.revocation_generation))
            })?;
            *tracked = new_generation;
            Ok::<_, &'static str>(())
        })();
        let local = session.revoke();
        result?;
        local.map(|_| ())
    }
}
fn hex_lower(x: &[u8]) -> String {
    x.iter().map(|v| format!("{v:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};
    fn temp() -> PathBuf {
        let t = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("w54-profile-native-{}-{t}", std::process::id()))
    }
    fn dirs(t: &Path) -> UserDirectories {
        let p = t.join("installed-app");
        UserDirectories {
            data: p.join("data"),
            config: p.join("config"),
            cache: p.join("cache"),
        }
    }
    fn new_session() -> SessionAuthority {
        SessionAuthority::new(
            Some(current_windows_principal().unwrap()),
            Duration::from_secs(180),
        )
        .unwrap()
    }
    #[cfg(windows)]
    #[test]
    fn stable_refs_with_reboot_fence_and_cookie_independence() {
        let t = temp();
        let p = dirs(&t);
        p.initialize().unwrap();
        let s = new_session();
        let first = NativeProfileAuthority::new(&p).unwrap();
        let e = first.verify_for_native_owner(&s).unwrap();
        let (user, installation, first_s, _, first_g, root) = e.native_contract_parts();
        assert_eq!(root, p.data);
        let user = user.to_string();
        let installation = installation.to_string();
        let first_s = first_s.to_string();
        let again = first.verify_for_native_owner(&s).unwrap();
        assert_eq!(again.native_contract_parts().0, user);
        assert_eq!(again.native_contract_parts().2, first_s);
        drop(first);
        let second = NativeProfileAuthority::new(&p).unwrap();
        let e2 = second.verify_for_native_owner(&new_session()).unwrap();
        assert_eq!(e2.native_contract_parts().0, user);
        assert_eq!(e2.native_contract_parts().1, installation);
        assert_ne!(e2.native_contract_parts().2, first_s);
        assert_eq!(e2.native_contract_parts().4, first_g + 1);
        fs::remove_dir_all(t).unwrap();
    }
    #[cfg(windows)]
    #[test]
    fn logout_persists_generation_and_blocks_native_session() {
        let t = temp();
        let p = dirs(&t);
        p.initialize().unwrap();
        let s = new_session();
        let a = NativeProfileAuthority::new(&p).unwrap();
        let old = a
            .verify_for_native_owner(&s)
            .unwrap()
            .native_contract_parts()
            .4;
        a.revoke(&s).unwrap();
        assert!(a.verify_for_native_owner(&s).is_err());
        let b = NativeProfileAuthority::new(&p).unwrap();
        let after = b
            .verify_for_native_owner(&new_session())
            .unwrap()
            .native_contract_parts()
            .4;
        assert_eq!(after, old + 2);
        fs::remove_dir_all(t).unwrap();
    }
    #[cfg(windows)]
    #[test]
    fn different_installation_ref_partitions_same_windows_sid() {
        let t = temp();
        let a = dirs(&t.join("first"));
        let b = dirs(&t.join("second"));
        a.initialize().unwrap();
        b.initialize().unwrap();
        let ra = NativeProfileAuthority::new(&a).unwrap();
        let rb = NativeProfileAuthority::new(&b).unwrap();
        let ea = ra.verify_for_native_owner(&new_session()).unwrap();
        let eb = rb.verify_for_native_owner(&new_session()).unwrap();
        assert_ne!(ea.native_contract_parts().0, eb.native_contract_parts().0);
        assert_ne!(ea.native_contract_parts().1, eb.native_contract_parts().1);
        assert_ne!(ea.native_contract_parts().5, eb.native_contract_parts().5);
        fs::remove_dir_all(t).unwrap();
    }
    #[cfg(windows)]
    #[test]
    fn tamper_and_unknown_generation_state_fail_closed() {
        let t = temp();
        let p = dirs(&t);
        p.initialize().unwrap();
        let s = new_session();
        let a = NativeProfileAuthority::new(&p).unwrap();
        fs::write(p.data.join(STATE_NAME), b"evil/browser-controlled-actor").unwrap();
        assert_eq!(
            a.verify_for_native_owner(&s).unwrap_err(),
            "UNKNOWN_NATIVE_BINDING_STATE"
        );
        fs::remove_dir_all(t).unwrap();
    }
    #[cfg(windows)]
    #[test]
    fn process_child_bumps_generation_without_copying_session() {
        const CHILD_VAR: &str = "W54_TEST_CHILD_NATIVE_DIR";
        let t = temp();
        let p = dirs(&t);
        p.initialize().unwrap();
        let s = new_session();
        let a = NativeProfileAuthority::new(&p).unwrap();
        let old = a
            .verify_for_native_owner(&s)
            .unwrap()
            .native_contract_parts()
            .4;
        let child = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "native_profile::tests::native_child_worker",
                "--nocapture",
            ])
            .env(CHILD_VAR, &t)
            .status()
            .unwrap();
        assert!(child.success(), "real Windows subprocess test failed");
        assert_eq!(
            a.verify_for_native_owner(&s).unwrap_err(),
            "NATIVE_BINDING_GENERATION_OR_INSTALLATION_STALE"
        );
        let b = NativeProfileAuthority::new(&p).unwrap();
        assert_eq!(
            b.verify_for_native_owner(&new_session())
                .unwrap()
                .native_contract_parts()
                .4,
            old + 2
        );
        fs::remove_dir_all(t).unwrap();
    }
    #[cfg(windows)]
    #[test]
    fn empty_existing_state_after_crash_is_denied_not_reissued() {
        let t = temp();
        let p = dirs(&t);
        p.initialize().unwrap();
        fs::write(p.data.join(STATE_NAME), b"").unwrap();
        assert_eq!(
            NativeProfileAuthority::new(&p).unwrap_err(),
            "UNKNOWN_NATIVE_BINDING_STATE"
        );
        fs::remove_dir_all(t).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn arbitrary_browser_supplied_directory_cannot_mint_os_profile_authority() {
        // Temp normally lives UNDER LocalAppData, so derive an actual path
        // outside the OS current-user Known Folder for this negative test.
        let os_local = windows_local_appdata().unwrap();
        let user_root = os_local.parent().unwrap().parent().unwrap();
        let t = user_root.join(format!("w54-profile-negative-{}", random_hex().unwrap()));
        let p = dirs(&t);
        p.initialize().unwrap();
        assert_eq!(
            NativeProfileAuthority::new(&p).unwrap_err(),
            "NATIVE_APPDATA_NOT_IN_CURRENT_WINDOWS_PROFILE"
        );
        fs::remove_dir_all(t).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn native_child_worker() {
        if let Some(p) = std::env::var_os("W54_TEST_CHILD_NATIVE_DIR") {
            let d = dirs(&PathBuf::from(p));
            let s = new_session();
            let child = NativeProfileAuthority::new(&d).unwrap();
            assert!(child.verify_for_native_owner(&s).is_ok());
        }
    }
}
