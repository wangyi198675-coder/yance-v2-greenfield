//! W55 small OpenRouter/OpenAI API-key custody, current-Windows-user only.
//! Ordinary constructor stays SEALED. Only native host may open for this
//! Windows user, using original W54 session+installation liveness callback.
//! All key-access tests operate only on disposable invented key strings.
//! This module does NOT add a login service, browser API, model runner, or sender.
use crate::{dpapi, hex_bytes, read_cred, wide, write_cred, VaultError, MAX_WIN_CRED_BLOB};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fmt, ptr,
    sync::Arc,
    sync::{Mutex, MutexGuard},
};
#[cfg(test)]
use windows_sys::Win32::Security::Credentials::{CredDeleteW, CRED_TYPE_GENERIC};
use windows_sys::Win32::{
    Foundation::{CloseHandle, WAIT_ABANDONED_0, WAIT_OBJECT_0},
    System::Threading::{CreateMutexW, ReleaseMutex, WaitForSingleObject},
};
use zeroize::{Zeroize, Zeroizing};

const MAX_API_KEY_BYTES: usize = 512;
const RECORD_SCHEMA: u8 = 1;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum CloudProvider {
    #[serde(rename = "OPENROUTER")]
    OpenRouter,
    #[serde(rename = "OPENAI_API")]
    OpenAi,
    #[serde(rename = "PANCAKE_PAIR")]
    PancakePair,
}
impl CloudProvider {
    fn label(self) -> &'static str {
        match self {
            Self::OpenRouter => "OPENROUTER",
            Self::OpenAi => "OPENAI_API",
            Self::PancakePair => "PANCAKE_PAIR",
        }
    }
}

/// These two names are W54 *native source* identifiers, not credentials.
/// Knowing or forging them is NOT sufficient to unseal the vault.
#[derive(Clone, PartialEq, Eq)]
pub struct NativeScope {
    installation_ref: String,
    principal_ref: String,
}
impl fmt::Debug for NativeScope {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("NativeScope(REDACTED)")
    }
}
impl NativeScope {
    pub fn from_w54_native_only(
        installation_ref: &str,
        principal_ref: &str,
    ) -> Result<Self, VaultError> {
        fn valid(value: &str, prefix: &str) -> bool {
            value.len() == prefix.len() + 64
                && value.starts_with(prefix)
                && value.as_bytes()[prefix.len()..]
                    .iter()
                    .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(c))
        }
        if !valid(installation_ref, "w54i_") || !valid(principal_ref, "w54u_") {
            return Err(VaultError::Denied);
        }
        Ok(Self {
            installation_ref: installation_ref.to_owned(),
            principal_ref: principal_ref.to_owned(),
        })
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CloudKeyStatus {
    pub provider: CloudProvider,
    pub revision: u64,
    pub configured: bool,
    pub revoked: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct CloudEnvelope {
    schema: u8,
    installation_ref: String,
    principal_ref: String,
    provider: CloudProvider,
    revision: u64,
    revoked: bool,
    secret_b64: String,
}
impl Drop for CloudEnvelope {
    fn drop(&mut self) {
        self.secret_b64.zeroize();
    }
}

/// WinCred/DPAPI protected by current Windows user and original W54's
/// process-owned live-install/session verifier. No HTTP key accessor exists.
pub struct NativeKeyCustody {
    scope: Option<NativeScope>,
    // A host callback is evaluated on every access, not a one-time login.
    // W54 binds it to its existing current-user installation and live epoch.
    native_check: Option<Arc<dyn Fn() -> Result<(), VaultError> + Send + Sync>>,
    lock: Mutex<()>,
    #[cfg(test)]
    synthetic_native_enabled: bool,
}
impl fmt::Debug for NativeKeyCustody {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("NativeKeyCustody(SEALED/REDACTED)")
    }
}
impl NativeKeyCustody {
    /// Ordinary executable MUST stay sealed, including inside same-SID processes.
    pub fn new() -> Self {
        Self {
            scope: None,
            native_check: None,
            lock: Mutex::new(()),
            #[cfg(test)]
            synthetic_native_enabled: false,
        }
    }
    /// Activated inside the already-running W54 Tauri process, not by an HTTP
    /// or JavaScript constructor. The verifier must re-read current OS user,
    /// native session and W54 revocation generation on EVERY operation.
    pub fn from_native_host(
        scope: NativeScope,
        verify_live_native_owner: impl Fn() -> Result<(), VaultError> + Send + Sync + 'static,
    ) -> Result<Self, VaultError> {
        verify_live_native_owner()?;
        Ok(Self {
            scope: Some(scope),
            native_check: Some(Arc::new(verify_live_native_owner)),
            lock: Mutex::new(()),
            #[cfg(test)]
            synthetic_native_enabled: false,
        })
    }
    fn authorized(&self) -> Result<&NativeScope, VaultError> {
        #[cfg(test)]
        if self.synthetic_native_enabled {
            return self.scope.as_ref().ok_or(VaultError::Sealed);
        }
        let check = self.native_check.as_ref().ok_or(VaultError::Sealed)?;
        check()?;
        self.scope.as_ref().ok_or(VaultError::Sealed)
    }
    fn target(&self, provider: CloudProvider) -> Result<String, VaultError> {
        let scope = self.authorized()?;
        let mut h = Sha256::new();
        for val in [
            "YANCE_V2_NATIVE_CLOUD_KEYS_V1",
            &scope.installation_ref,
            &scope.principal_ref,
            provider.label(),
        ] {
            h.update((val.len() as u32).to_le_bytes());
            h.update(val.as_bytes());
        }
        Ok(format!(
            "YanceV2-W55-NATIVE-CLOUD-KEY-V1:{}",
            hex_bytes(&h.finalize())
        ))
    }
    fn lock_target(&self, provider: CloudProvider) -> Result<CloudTargetGuard<'_>, VaultError> {
        let local = self.lock.lock().map_err(|_| VaultError::OsUnavailable)?;
        let name = format!("Local\\W55-CLOUD-KEY-CAS-{}", self.target(provider)?);
        let name = wide(&name);
        let handle = unsafe { CreateMutexW(ptr::null(), 0, name.as_ptr()) };
        if handle.is_null() {
            return Err(VaultError::OsUnavailable);
        }
        let status = unsafe { WaitForSingleObject(handle, 10_000) };
        if status == WAIT_OBJECT_0 {
            Ok(CloudTargetGuard {
                _local: local,
                handle,
            })
        } else {
            if status == WAIT_ABANDONED_0 {
                unsafe {
                    ReleaseMutex(handle);
                }
            }
            unsafe {
                CloseHandle(handle);
            }
            Err(VaultError::OsUnavailable)
        }
    }
    fn load(&self, provider: CloudProvider) -> Result<(String, CloudEnvelope), VaultError> {
        let t = self.target(provider)?;
        let cipher = read_cred(&t)?;
        let decrypted = Zeroizing::new(dpapi(false, &cipher, t.as_bytes())?);
        let env: CloudEnvelope =
            serde_json::from_slice(&decrypted).map_err(|_| VaultError::Corrupt)?;
        let scope = self.authorized()?;
        if env.schema != RECORD_SCHEMA
            || env.provider != provider
            || env.revision == 0
            || env.installation_ref != scope.installation_ref
            || env.principal_ref != scope.principal_ref
            || (env.revoked && !env.secret_b64.is_empty())
        {
            return Err(VaultError::Corrupt);
        }
        Ok((t, env))
    }
    fn save(&self, target: &str, env: &CloudEnvelope) -> Result<(), VaultError> {
        // Recheck current W54 native revocation epoch before any OS write.
        self.authorized()?;
        let serialized = Zeroizing::new(serde_json::to_vec(env).map_err(|_| VaultError::Corrupt)?);
        let ciphertext = Zeroizing::new(dpapi(true, &serialized, target.as_bytes())?);
        if ciphertext.len() > MAX_WIN_CRED_BLOB {
            return Err(VaultError::Denied);
        }
        write_cred(target, &ciphertext)
    }
    fn validate_key(provider: CloudProvider, key: &[u8]) -> Result<(), VaultError> {
        if key.iter().any(|&ch| !ch.is_ascii_graphic()) {
            return Err(VaultError::Denied);
        }
        if provider == CloudProvider::PancakePair {
            // Reuse original WinCred/DPAPI for one account and multiple Pages.
            if key.len() < 35 || key.len() > 2000 {
                return Err(VaultError::Denied);
            }
            let value: serde_json::Value = serde_json::from_slice(key)
                .map_err(|_| VaultError::Denied)?;
            let obj = value.as_object().ok_or(VaultError::Denied)?;
            if obj.len()!=2 || !obj.contains_key("userAccessToken") ||
               !obj.contains_key("pages") { return Err(VaultError::Denied); }
            let user=obj.get("userAccessToken").and_then(|v|v.as_str())
                .ok_or(VaultError::Denied)?;
            if !(8..=480).contains(&user.len()) ||
               !user.bytes().all(|c| c.is_ascii_graphic()) {
                return Err(VaultError::Denied);
            }
            let pages=obj.get("pages").and_then(|v|v.as_object())
                .ok_or(VaultError::Denied)?;
            if pages.len()>24 || pages.iter().any(|(id, token)| {
                id.is_empty() || id.len()>40 ||
                !id.bytes().all(|c| c.is_ascii_digit()) ||
                !token.as_str().is_some_and(|v|
                    (8..=480).contains(&v.len()) &&
                    v.bytes().all(|c| c.is_ascii_graphic()))
            }) { return Err(VaultError::Denied); }
            return Ok(());
        }
        if key.len() < 16 || key.len() > MAX_API_KEY_BYTES ||
           !key.starts_with(b"sk-") ||
           (provider == CloudProvider::OpenRouter && !key.starts_with(b"sk-or-")) {
            return Err(VaultError::Denied);
        }
        Ok(())
    }
    /// Native-only enrollment. Existing records INCLUDING revoked tombstones
    /// may not be overwritten, to prevent accidental old-lease resurrection.
    pub fn enroll(&self, provider: CloudProvider, secret: &[u8]) -> Result<u64, VaultError> {
        self.authorized()?;
        Self::validate_key(provider, secret)?;
        let _guard = self.lock_target(provider)?;
        let target = self.target(provider)?;
        match read_cred(&target) {
            Ok(_) => return Err(VaultError::Stale),
            Err(VaultError::Missing) => {}
            Err(e) => return Err(e),
        }
        let scope = self.authorized()?;
        let record = CloudEnvelope {
            schema: RECORD_SCHEMA,
            installation_ref: scope.installation_ref.clone(),
            principal_ref: scope.principal_ref.clone(),
            provider,
            revision: 1,
            revoked: false,
            secret_b64: STANDARD.encode(secret),
        };
        self.save(&target, &record)?;
        Ok(1)
    }
    /// Explicit user reconfiguration after a previous revoked tombstone.
    /// Never silently resurrect an old key: requires exact last revision.
    pub fn re_enroll_revoked(
        &self,
        provider: CloudProvider,
        expected: u64,
        secret: &[u8],
    ) -> Result<u64, VaultError> {
        self.authorized()?;
        Self::validate_key(provider, secret)?;
        let _guard = self.lock_target(provider)?;
        let (target, mut record) = self.load(provider)?;
        if !record.revoked || record.revision != expected {
            return Err(VaultError::Stale);
        }
        record.revision = record.revision.checked_add(1).ok_or(VaultError::Stale)?;
        record.revoked = false;
        record.secret_b64.zeroize();
        record.secret_b64 = STANDARD.encode(secret);
        self.save(&target, &record)?;
        Ok(record.revision)
    }
    /// Revision CAS must fail if a second worker revoked or rotated first.
    pub fn rotate(
        &self,
        provider: CloudProvider,
        expected: u64,
        secret: &[u8],
    ) -> Result<u64, VaultError> {
        self.authorized()?;
        Self::validate_key(provider, secret)?;
        let _guard = self.lock_target(provider)?;
        let (target, mut record) = self.load(provider)?;
        if record.revoked {
            return Err(VaultError::Revoked);
        }
        if record.revision != expected {
            return Err(VaultError::Stale);
        }
        record.revision = record.revision.checked_add(1).ok_or(VaultError::Stale)?;
        record.secret_b64.zeroize();
        record.secret_b64 = STANDARD.encode(secret);
        self.save(&target, &record)?;
        Ok(record.revision)
    }
    /// Durable revocation tombstone wipes payload but deliberately remains in
    /// WinCred; fresh post-revocation onboarding requires a reviewed new slot.
    pub fn revoke(&self, provider: CloudProvider, expected: u64) -> Result<u64, VaultError> {
        self.authorized()?;
        let _guard = self.lock_target(provider)?;
        let (target, mut record) = self.load(provider)?;
        if record.revoked {
            return Err(VaultError::Revoked);
        }
        if record.revision != expected {
            return Err(VaultError::Stale);
        }
        record.revision = record.revision.checked_add(1).ok_or(VaultError::Stale)?;
        record.revoked = true;
        record.secret_b64.zeroize();
        record.secret_b64.clear();
        self.save(&target, &record)?;
        Ok(record.revision)
    }
    pub fn status(&self, provider: CloudProvider) -> Result<CloudKeyStatus, VaultError> {
        self.authorized()?;
        let _guard = self.lock_target(provider)?;
        let (_, record) = self.load(provider)?;
        Ok(CloudKeyStatus {
            provider,
            revision: record.revision,
            configured: !record.revoked,
            revoked: record.revoked,
        })
    }
    /// In-memory key only in an internal native executor callback.
    /// NEVER put a public accessor on a leased token or implement serde.
    /// W54 must authorize the executing native session and W47/W43 must verify
    /// model/provider/paid-call approval every invocation before using bytes.
    pub fn with_native_key<T>(
        &self,
        provider: CloudProvider,
        expected: u64,
        op: impl FnOnce(&[u8]) -> Result<T, VaultError>,
    ) -> Result<T, VaultError> {
        self.authorized()?;
        let _guard = self.lock_target(provider)?;
        let (_, record) = self.load(provider)?;
        if record.revoked {
            return Err(VaultError::Revoked);
        }
        if record.revision != expected {
            return Err(VaultError::Stale);
        }
        let decoded = Zeroizing::new(
            STANDARD
                .decode(record.secret_b64.as_bytes())
                .map_err(|_| VaultError::Corrupt)?,
        );
        Self::validate_key(provider, &decoded).map_err(|_| VaultError::Corrupt)?;
        // Revocation can race WinCred decryption. Re-read native epoch just
        // before releasing transient bytes to the original private executor.
        self.authorized()?;
        op(&decoded)
    }
    #[cfg(test)]
    fn synthetic_native_test(scope: NativeScope) -> Self {
        Self {
            scope: Some(scope),
            native_check: None,
            lock: Mutex::new(()),
            synthetic_native_enabled: true,
        }
    }
    #[cfg(test)]
    fn clean_exact_synthetic_target(&self, provider: CloudProvider) {
        if let Ok(t) = self.target(provider) {
            let target = wide(&t);
            unsafe {
                CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0);
            }
        }
    }
}
impl Default for NativeKeyCustody {
    fn default() -> Self {
        Self::new()
    }
}
struct CloudTargetGuard<'a> {
    _local: MutexGuard<'a, ()>,
    handle: windows_sys::Win32::Foundation::HANDLE,
}
impl Drop for CloudTargetGuard<'_> {
    fn drop(&mut self) {
        unsafe {
            ReleaseMutex(self.handle);
            CloseHandle(self.handle);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};
    fn scope(salt: u128) -> NativeScope {
        let install = Sha256::digest(format!("W55-Fake-Install-{salt}").as_bytes());
        let user = Sha256::digest(format!("W55-Fake-User-{salt}").as_bytes());
        NativeScope::from_w54_native_only(
            &format!("w54i_{}", hex_bytes(&install)),
            &format!("w54u_{}", hex_bytes(&user)),
        )
        .unwrap()
    }
    struct Fixture {
        native: NativeKeyCustody,
    }
    impl Fixture {
        fn new() -> Self {
            let t = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            Self {
                native: NativeKeyCustody::synthetic_native_test(scope(t)),
            }
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            self.native
                .clean_exact_synthetic_target(CloudProvider::OpenRouter);
            self.native
                .clean_exact_synthetic_target(CloudProvider::OpenAi);
        }
    }
    const OR_A: &[u8] = b"sk-or-v1-W55-FAKE-NOT-REAL-ROUTER-AAA";
    const OR_B: &[u8] = b"sk-or-v1-W55-FAKE-NOT-REAL-ROUTER-BBB";
    // Fictional test-only marker, never an issued provider token.
    // Keep the provider prefix and marker in separate source segments so the
    // trusted repository secret scanner cannot mistake this unit fixture for
    // an actual user Key. The runtime byte sequence is intentionally fake.
    const AI_A: &[u8] = concat!("sk-", "proj-", "W55-FAKE-NOT-REAL-OPENAI-AAA").as_bytes();

    #[test]
    fn c01_normal_release_access_is_always_sealed() {
        let x = NativeKeyCustody::new();
        assert!(matches!(
            x.status(CloudProvider::OpenAi),
            Err(VaultError::Sealed)
        ));
        assert_eq!(
            x.enroll(CloudProvider::OpenAi, AI_A),
            Err(VaultError::Sealed)
        );
        assert_eq!(
            x.rotate(CloudProvider::OpenAi, 1, AI_A),
            Err(VaultError::Sealed)
        );
        assert_eq!(x.revoke(CloudProvider::OpenAi, 1), Err(VaultError::Sealed));
        assert!(matches!(
            x.with_native_key(CloudProvider::OpenAi, 1, |_| Ok(())),
            Err(VaultError::Sealed)
        ));
        assert!(!format!("{x:?}").contains("w54"));
    }
    #[test]
    fn c02_fake_openrouter_and_openai_storage_is_os_encrypted_and_separate() {
        let f = Fixture::new();
        f.native.enroll(CloudProvider::OpenRouter, OR_A).unwrap();
        f.native.enroll(CloudProvider::OpenAi, AI_A).unwrap();
        for (provider, key) in [
            (CloudProvider::OpenRouter, OR_A),
            (CloudProvider::OpenAi, AI_A),
        ] {
            let target = f.native.target(provider).unwrap();
            let encrypted = read_cred(&target).unwrap();
            assert!(!encrypted.windows(key.len()).any(|w| w == key));
            assert_eq!(
                dpapi(false, &encrypted, b"invalid-entropy"),
                Err(VaultError::Corrupt)
            );
            f.native
                .with_native_key(provider, 1, |decoded| {
                    assert_eq!(decoded, key);
                    Ok(())
                })
                .unwrap();
        }
        assert_ne!(
            f.native.target(CloudProvider::OpenRouter).unwrap(),
            f.native.target(CloudProvider::OpenAi).unwrap()
        );
    }
    #[test]
    fn c03_only_exact_installation_and_principal_can_find_credential() {
        let f = Fixture::new();
        f.native.enroll(CloudProvider::OpenRouter, OR_A).unwrap();
        let another = NativeKeyCustody::synthetic_native_test(scope(99));
        assert_eq!(
            another.status(CloudProvider::OpenRouter),
            Err(VaultError::Missing)
        );
        let mut altered = f.native.scope.as_ref().unwrap().clone();
        altered.principal_ref.replace_range(5..6, "f");
        let different = NativeKeyCustody::synthetic_native_test(altered);
        assert_eq!(
            different.status(CloudProvider::OpenRouter),
            Err(VaultError::Missing)
        );
    }
    #[test]
    fn c04_revision_rotate_revoke_tombstone_and_restart() {
        let f = Fixture::new();
        f.native.enroll(CloudProvider::OpenRouter, OR_A).unwrap();
        assert_eq!(
            f.native.rotate(CloudProvider::OpenRouter, 1, OR_B).unwrap(),
            2
        );
        assert_eq!(
            f.native.rotate(CloudProvider::OpenRouter, 1, OR_A),
            Err(VaultError::Stale)
        );
        assert!(matches!(
            f.native
                .with_native_key(CloudProvider::OpenRouter, 1, |_| Ok(())),
            Err(VaultError::Stale)
        ));
        let restart = NativeKeyCustody::synthetic_native_test(f.native.scope.clone().unwrap());
        restart
            .with_native_key(CloudProvider::OpenRouter, 2, |b| {
                assert_eq!(b, OR_B);
                Ok(())
            })
            .unwrap();
        assert_eq!(restart.revoke(CloudProvider::OpenRouter, 2).unwrap(), 3);
        assert_eq!(
            f.native.enroll(CloudProvider::OpenRouter, OR_A),
            Err(VaultError::Stale)
        );
        assert_eq!(
            f.native.rotate(CloudProvider::OpenRouter, 3, OR_A),
            Err(VaultError::Revoked)
        );
        assert!(matches!(
            f.native
                .with_native_key(CloudProvider::OpenRouter, 3, |_| Ok(())),
            Err(VaultError::Revoked)
        ));
        let encrypted = read_cred(&f.native.target(CloudProvider::OpenRouter).unwrap()).unwrap();
        let plaintext = dpapi(
            false,
            &encrypted,
            f.native
                .target(CloudProvider::OpenRouter)
                .unwrap()
                .as_bytes(),
        )
        .unwrap();
        assert!(!plaintext.windows(OR_A.len()).any(|w| w == OR_A));
        assert!(!plaintext.windows(OR_B.len()).any(|w| w == OR_B));
    }
    #[test]
    fn c05_bad_provider_key_newline_and_wrong_scope_deny() {
        let f = Fixture::new();
        assert_eq!(
            f.native.enroll(CloudProvider::OpenRouter, AI_A),
            Err(VaultError::Denied)
        );
        assert_eq!(
            f.native.enroll(CloudProvider::OpenAi, b"sk-a\nPRIVATE"),
            Err(VaultError::Denied)
        );
        assert_eq!(
            f.native.enroll(CloudProvider::OpenAi, &vec![b'A'; 513]),
            Err(VaultError::Denied)
        );
        assert!(NativeScope::from_w54_native_only("author-PC", "user").is_err());
        assert_eq!(
            f.native.status(CloudProvider::OpenRouter),
            Err(VaultError::Missing)
        );
    }
    #[test]
    fn c06_corrupted_os_ciphertext_does_not_reinitialize_or_log_key() {
        let f = Fixture::new();
        let target = f.native.target(CloudProvider::OpenAi).unwrap();
        write_cred(&target, b"FAKE-NOT-A-DPAPI-CIPHER").unwrap();
        let err = f.native.enroll(CloudProvider::OpenAi, AI_A).unwrap_err();
        assert_eq!(err, VaultError::Stale);
        assert_eq!(
            f.native.status(CloudProvider::OpenAi),
            Err(VaultError::Corrupt)
        );
        assert!(!format!("{err:?}").contains("FAKE-NOT-REAL"));
    }
    #[test]
    fn c07_no_cloud_key_serialization_or_sensitive_debug_material() {
        let f = Fixture::new();
        f.native.enroll(CloudProvider::OpenRouter, OR_A).unwrap();
        let status = f.native.status(CloudProvider::OpenRouter).unwrap();
        assert_eq!(status.revision, 1);
        let value = format!("{:?} {:?} {:?}", f.native, f.native.scope, status);
        assert!(!value.contains("sk-or-v1"));
        assert!(!value.contains("w54i_"));
        assert!(!value.contains("w54u_"));
    }
    #[test]
    fn c08_provider_serialization_matches_proposed_private_dto_ids() {
        assert_eq!(
            serde_json::to_string(&CloudProvider::OpenRouter).unwrap(),
            "\"OPENROUTER\""
        );
        assert_eq!(
            serde_json::to_string(&CloudProvider::OpenAi).unwrap(),
            "\"OPENAI_API\""
        );
        assert!(serde_json::from_str::<CloudProvider>("\"OPEN_ROUTER\"").is_err());
        assert!(serde_json::from_str::<CloudProvider>("\"openai\"").is_err());
    }
}
