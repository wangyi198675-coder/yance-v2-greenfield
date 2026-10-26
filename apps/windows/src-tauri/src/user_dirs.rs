//! W54 | Single Windows user, per-installation Tauri-owned directories.
//! No client supplied user/SID, no V1 import, no app-wide/global vault.
//! This module only resolves local paths; domain Owners manage their own DBs.
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};
use tauri::path::PathResolver;

const VERSION_FILE: &str = "w54-local-layout.version";
const SCHEMA: &[u8] = b"W54_LOCAL_LAYOUT_V1\n";
#[derive(Clone, Debug)]
pub(crate) struct UserDirectories {
    /// Machine-local non-roaming application data: future AgentOS/DB Owner target.
    pub(crate) data: PathBuf,
    /// User-specific configuration; never put provider secrets in a plain file.
    pub(crate) config: PathBuf,
    /// User-specific disposable cache; never make it the authority for grants.
    pub(crate) cache: PathBuf,
}

impl UserDirectories {
    pub(crate) fn resolve<R: tauri::Runtime>(resolver: &PathResolver<R>) -> Result<Self, String> {
        Self::from_paths(
            resolver
                .app_local_data_dir()
                .map_err(|_| "APP_LOCAL_DATA_DIR_UNAVAILABLE")?
                .join("data"),
            resolver
                .app_config_dir()
                .map_err(|_| "APP_CONFIG_DIR_UNAVAILABLE")?
                .join("config"),
            resolver
                .app_cache_dir()
                .map_err(|_| "APP_CACHE_DIR_UNAVAILABLE")?
                .join("cache"),
        )
    }

    fn from_paths(data: PathBuf, config: PathBuf, cache: PathBuf) -> Result<Self, String> {
        if [data.as_path(), config.as_path(), cache.as_path()]
            .iter()
            .any(|p| !p.is_absolute())
        {
            return Err("RELATIVE_PROFILE_PATH_REJECTED".into());
        }
        if data == config || data == cache || config == cache {
            return Err("SHARED_PROFILE_DIRECTORY_REJECTED".into());
        }
        Ok(Self {
            data,
            config,
            cache,
        })
    }

    /// Only create the three directories the current Tauri OS path resolver
    /// returned, then initialize a nonsecret layout marker. Fail closed on
    /// unexpected layout versions; never copy or delete existing user files.
    pub(crate) fn initialize(&self) -> Result<(), String> {
        for dir in [&self.data, &self.config, &self.cache] {
            // Do not adopt a pre-existing junction/symlink *at the target*.
            if let Ok(meta) = fs::symlink_metadata(dir) {
                if meta.file_type().is_symlink() || !meta.is_dir() {
                    return Err("UNSAFE_PROFILE_TARGET".into());
                }
            }
            fs::create_dir_all(dir).map_err(|_| "CREATE_USER_DIR_FAILED")?;
            let meta = fs::symlink_metadata(dir).map_err(|_| "PROFILE_DIR_UNAVAILABLE")?;
            if meta.file_type().is_symlink() || !meta.is_dir() {
                return Err("UNSAFE_PROFILE_TARGET".into());
            }
        }
        let marker = self.data.join(VERSION_FILE);
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&marker)
        {
            Ok(mut file) => {
                file.write_all(SCHEMA)
                    .map_err(|_| "PROFILE_MARKER_WRITE_FAILED")?;
                file.sync_all().map_err(|_| "PROFILE_MARKER_SYNC_FAILED")?;
            }
            Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(_) => return Err("PROFILE_MARKER_OPEN_FAILED".into()),
        }
        let mut bytes = Vec::new();
        OpenOptions::new()
            .read(true)
            .open(&marker)
            .map_err(|_| "PROFILE_MARKER_READ_FAILED")?
            .take(128)
            .read_to_end(&mut bytes)
            .map_err(|_| "PROFILE_MARKER_READ_FAILED")?;
        if bytes != SCHEMA {
            return Err("UNKNOWN_USER_LAYOUT_REQUIRES_OWNER_MIGRATION".into());
        }
        Ok(())
    }
}

/// This contract may be consumed by original DB/brain owners only after
/// they explicitly implement their own authorized storage and migrations.
#[allow(dead_code)]
pub(crate) fn is_beneath(root: &Path, candidate: &Path) -> bool {
    candidate.is_absolute() && candidate != root && candidate.starts_with(root)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp() -> PathBuf {
        let n = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("w54-isolation-test-{}-{n}", std::process::id()))
    }
    fn user(root: &Path, name: &str) -> UserDirectories {
        UserDirectories::from_paths(
            root.join(name)
                .join("LocalAppData")
                .join("com.yance.v2.native-session-lab"),
            root.join(name)
                .join("RoamingAppData")
                .join("com.yance.v2.native-session-lab"),
            root.join(name)
                .join("Cache")
                .join("com.yance.v2.native-session-lab"),
        )
        .unwrap()
    }

    #[test]
    fn simulated_two_distinct_user_profiles_never_overlap() {
        let t = temp();
        let a = user(&t, "user-a");
        let b = user(&t, "user-b");
        a.initialize().unwrap();
        b.initialize().unwrap();
        fs::write(a.data.join("PRIVATE_DUMMY.txt"), b"a-only").unwrap();
        fs::write(b.data.join("PRIVATE_DUMMY.txt"), b"b-only").unwrap();
        assert_eq!(
            fs::read(a.data.join("PRIVATE_DUMMY.txt")).unwrap(),
            b"a-only"
        );
        assert_eq!(
            fs::read(b.data.join("PRIVATE_DUMMY.txt")).unwrap(),
            b"b-only"
        );
        assert!(!a.data.starts_with(&b.data));
        assert!(!b.config.starts_with(&a.config));
        fs::remove_dir_all(t).unwrap();
    }

    #[test]
    fn simulated_upgrade_and_reinstall_preserve_same_user_data() {
        let t = temp();
        let p = user(&t, "same-user");
        p.initialize().unwrap();
        fs::write(p.data.join("dummy-existing-memory.db"), b"persist").unwrap();
        // Startup after simulated upgrade/reinstall is intentionally idempotent;
        // this is not a true MSI uninstall/reinstall execution.
        p.initialize().unwrap();
        assert_eq!(
            fs::read(p.data.join("dummy-existing-memory.db")).unwrap(),
            b"persist"
        );
        assert_eq!(fs::read(p.data.join(VERSION_FILE)).unwrap(), SCHEMA);
        fs::remove_dir_all(t).unwrap();
    }

    #[test]
    fn unknown_layout_fails_without_destroying_or_migrating_data() {
        let t = temp();
        let p = user(&t, "user");
        p.initialize().unwrap();
        fs::write(p.data.join(VERSION_FILE), b"FUTURE_UNKNOWN_LAYOUT\n").unwrap();
        fs::write(p.data.join("keep.txt"), b"must-survive").unwrap();
        assert_eq!(
            p.initialize().unwrap_err(),
            "UNKNOWN_USER_LAYOUT_REQUIRES_OWNER_MIGRATION"
        );
        assert_eq!(fs::read(p.data.join("keep.txt")).unwrap(), b"must-survive");
        fs::remove_dir_all(t).unwrap();
    }

    #[test]
    fn rejected_paths_are_not_initialized() {
        assert!(UserDirectories::from_paths(
            PathBuf::from("C:relative"),
            PathBuf::from("config"),
            PathBuf::from("cache")
        )
        .is_err());
        let path = temp();
        assert!(UserDirectories::from_paths(path.clone(), path.clone(), path).is_err());
    }

    #[test]
    fn owner_storage_path_must_be_inside_current_data_root() {
        let t = temp();
        let p = user(&t, "user");
        assert!(is_beneath(&p.data, &p.data.join("brain.sqlite")));
        assert!(!is_beneath(&p.data, &p.config.join("brain.sqlite")));
        assert!(!is_beneath(&p.data, &p.data));
    }
}
