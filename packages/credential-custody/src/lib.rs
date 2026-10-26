//! W55 Windows-only, fake-material-only credential custody prototype.
//! No real provider connection, no W54 authority, no HTTP/JS secret access.
//! Unsealed operations compile ONLY within this crate's #[cfg(test)] build.

#[cfg(not(target_os = "windows"))]
compile_error!("This nonproduction Credential Manager/DPAPI prototype only builds on Windows.");

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    ptr,
    sync::{Mutex, MutexGuard},
};
use windows_sys::Win32::{
    Foundation::{CloseHandle, LocalFree, WAIT_ABANDONED_0, WAIT_OBJECT_0},
    Security::{
        Credentials::{
            CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE,
            CRED_TYPE_GENERIC,
        },
        Cryptography::{
            CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
        },
    },
    System::Threading::{CreateMutexW, ReleaseMutex, WaitForSingleObject},
};
use zeroize::{Zeroize, Zeroizing};

const MAX_FAKE_SECRET_BYTES: usize = 512;
const MAX_WIN_CRED_BLOB: usize = 2560;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Identity {
    pub tenant: String,
    pub channel: String,
    pub account: String,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Fence {
    pub session_revision: u64,
    pub binding_revision: u64,
    pub account_revocation_epoch: u64,
}
#[derive(Debug, PartialEq, Eq)]
pub enum VaultError {
    Sealed,
    Denied,
    Missing,
    Stale,
    Expired,
    Revoked,
    Corrupt,
    OsUnavailable,
}
pub type Result<T> = std::result::Result<T, VaultError>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Inspection {
    pub credential_revision: u64,
    pub expires_at: u64,
    pub active: bool,
}
/// Intentionally no public method for reading the contained bytes.
/// Only approved future native worker bridge may obtain a separate, reviewed API.
pub struct SecretLease {
    bytes: Zeroizing<Vec<u8>>,
}
impl SecretLease {
    pub fn len(&self) -> usize {
        self.bytes.len()
    }
    pub fn is_empty(&self) -> bool {
        self.bytes.is_empty()
    }
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    schema: u32,
    identity: StoredIdentity,
    fence: StoredFence,
    credential_revision: u64,
    expires_at: u64,
    revoked: bool,
    fake_material_b64: String,
}
#[derive(Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
struct StoredIdentity {
    tenant: String,
    channel: String,
    account: String,
}
#[derive(Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
struct StoredFence {
    session_revision: u64,
    binding_revision: u64,
    account_revocation_epoch: u64,
}
impl Drop for Envelope {
    fn drop(&mut self) {
        self.fake_material_b64.zeroize();
    }
}
impl From<&Identity> for StoredIdentity {
    fn from(k: &Identity) -> Self {
        Self {
            tenant: k.tenant.clone(),
            channel: k.channel.clone(),
            account: k.account.clone(),
        }
    }
}
impl From<Fence> for StoredFence {
    fn from(f: Fence) -> Self {
        Self {
            session_revision: f.session_revision,
            binding_revision: f.binding_revision,
            account_revocation_epoch: f.account_revocation_epoch,
        }
    }
}
/// Kernel named mutex serializes synthetic test operations across independent Windows
/// processes in the same local-session namespace. This does NOT provide durable W44
/// authorization, protect against same-SID malicious mutex squatting, or recover
/// incomplete in-flight revocations after a process crash.
struct TargetGuard<'a> {
    _local: MutexGuard<'a, ()>,
    os_mutex: windows_sys::Win32::Foundation::HANDLE,
}
impl Drop for TargetGuard<'_> {
    fn drop(&mut self) {
        unsafe {
            ReleaseMutex(self.os_mutex);
            CloseHandle(self.os_mutex);
        }
    }
}
/// WinCred is limited to small OS-protected fake records.
pub struct Vault {
    namespace: String,
    lock: Mutex<()>,
    #[cfg(test)]
    fake_test_enabled: bool,
}
impl Vault {
    /// Production/default constructor: always sealed and never usable for secret operations.
    pub fn new() -> Self {
        Self {
            namespace: "yance-v2-w55-sealed".into(),
            lock: Mutex::new(()),
            #[cfg(test)]
            fake_test_enabled: false,
        }
    }
    fn authorized(&self) -> Result<()> {
        #[cfg(test)]
        if self.fake_test_enabled {
            return Ok(());
        }
        Err(VaultError::Sealed)
    }
    fn target(&self, k: &Identity) -> Result<String> {
        self.authorized()?;
        if k.tenant.len() > 80
            || k.channel.len() > 50
            || k.account.len() > 120
            || !k.tenant.starts_with("fake-")
            || !k.account.starts_with("fake-")
            || !matches!(
                k.channel.as_str(),
                "FB_PERSONAL" | "FB_PAGE" | "WHATSAPP_PERSONAL" | "TELEGRAM_PERSONAL"
            )
        {
            return Err(VaultError::Denied);
        }
        let mut h = Sha256::new();
        for x in [&self.namespace, &k.tenant, &k.channel, &k.account] {
            h.update((x.len() as u32).to_le_bytes());
            h.update(x.as_bytes());
        }
        Ok(format!(
            "YanceV2-W55-SYNTHETIC-ONLY:{}",
            hex_bytes(&h.finalize())
        ))
    }
    /// Single-record test-only CAS lock across processes. Lock contention or
    /// abandoned/invalid handles fail closed rather than recovering unverified state.
    fn lock_target(&self, k: &Identity) -> Result<TargetGuard<'_>> {
        let local = self.lock.lock().map_err(|_| VaultError::OsUnavailable)?;
        let t = self.target(k)?;
        let name = format!("Local\\W55-SYNTHETIC-CAS-{}", t);
        let wide_name = wide(&name);
        let handle = unsafe { CreateMutexW(ptr::null(), 0, wide_name.as_ptr()) };
        if handle.is_null() {
            return Err(VaultError::OsUnavailable);
        }
        let status = unsafe { WaitForSingleObject(handle, 10_000) };
        if status == WAIT_OBJECT_0 {
            Ok(TargetGuard {
                _local: local,
                os_mutex: handle,
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
    fn load(&self, k: &Identity) -> Result<(String, Envelope)> {
        let t = self.target(k)?;
        let protected = read_cred(&t)?;
        let mut plaintext = Zeroizing::new(dpapi(false, &protected, t.as_bytes())?);
        let env: Envelope = serde_json::from_slice(&plaintext).map_err(|_| VaultError::Corrupt)?;
        plaintext.zeroize();
        if env.schema != 1 || env.identity != StoredIdentity::from(k) {
            return Err(VaultError::Corrupt);
        }
        Ok((t, env))
    }
    fn save(&self, t: &str, env: &Envelope) -> Result<()> {
        let serialized = serde_json::to_vec(env).map_err(|_| VaultError::Corrupt)?;
        let plain = Zeroizing::new(serialized);
        let protected = Zeroizing::new(dpapi(true, &plain, t.as_bytes())?);
        if protected.len() > MAX_WIN_CRED_BLOB {
            return Err(VaultError::Denied);
        }
        write_cred(t, &protected)
    }
    fn check(env: &Envelope, f: Fence, expected_revision: u64, now: u64) -> Result<()> {
        if env.revoked {
            return Err(VaultError::Revoked);
        }
        if env.expires_at <= now {
            return Err(VaultError::Expired);
        }
        if env.fence != StoredFence::from(f) || env.credential_revision != expected_revision {
            return Err(VaultError::Stale);
        }
        Ok(())
    }
    /// NOT a production credential-ingress API: sealed in all normal library builds.
    pub fn store_fake(
        &self,
        k: &Identity,
        f: Fence,
        fake_bytes: &[u8],
        expires_at: u64,
        now: u64,
    ) -> Result<()> {
        self.authorized()?;
        if expires_at <= now
            || fake_bytes.is_empty()
            || fake_bytes.len() > MAX_FAKE_SECRET_BYTES
            || f.session_revision == 0
            || f.binding_revision == 0
            || f.account_revocation_epoch == 0
        {
            return Err(VaultError::Denied);
        }
        let _guard = self.lock_target(k)?;
        let t = self.target(k)?;
        match read_cred(&t) {
            Ok(_) => return Err(VaultError::Stale), // no resurrection of tombstones
            Err(VaultError::Missing) => {}
            Err(e) => return Err(e),
        }
        let env = Envelope {
            schema: 1,
            identity: k.into(),
            fence: f.into(),
            credential_revision: 1,
            expires_at,
            revoked: false,
            fake_material_b64: STANDARD.encode(fake_bytes),
        };
        self.save(&t, &env)
    }
    pub fn inspect(
        &self,
        k: &Identity,
        f: Fence,
        expected_revision: u64,
        now: u64,
    ) -> Result<Inspection> {
        self.authorized()?;
        let _guard = self.lock_target(k)?;
        let (_, env) = self.load(k)?;
        Self::check(&env, f, expected_revision, now)?;
        Ok(Inspection {
            credential_revision: env.credential_revision,
            expires_at: env.expires_at,
            active: true,
        })
    }
    pub fn lease(
        &self,
        k: &Identity,
        f: Fence,
        expected_revision: u64,
        now: u64,
    ) -> Result<SecretLease> {
        self.authorized()?;
        let _guard = self.lock_target(k)?;
        let (_, env) = self.load(k)?;
        Self::check(&env, f, expected_revision, now)?;
        let bytes = STANDARD
            .decode(env.fake_material_b64.as_bytes())
            .map_err(|_| VaultError::Corrupt)?;
        if bytes.is_empty() || bytes.len() > MAX_FAKE_SECRET_BYTES {
            return Err(VaultError::Corrupt);
        }
        Ok(SecretLease {
            bytes: Zeroizing::new(bytes),
        })
    }
    pub fn rotate_fake(
        &self,
        k: &Identity,
        f: Fence,
        expected_revision: u64,
        new_fake_bytes: &[u8],
        new_expiry: u64,
        now: u64,
    ) -> Result<u64> {
        self.authorized()?;
        if new_fake_bytes.is_empty()
            || new_fake_bytes.len() > MAX_FAKE_SECRET_BYTES
            || new_expiry <= now
        {
            return Err(VaultError::Denied);
        }
        let _guard = self.lock_target(k)?;
        let (t, mut env) = self.load(k)?;
        Self::check(&env, f, expected_revision, now)?;
        env.credential_revision = env
            .credential_revision
            .checked_add(1)
            .ok_or(VaultError::Stale)?;
        env.expires_at = new_expiry;
        env.fake_material_b64.zeroize();
        env.fake_material_b64 = STANDARD.encode(new_fake_bytes);
        self.save(&t, &env)?;
        Ok(env.credential_revision)
    }
    pub fn revoke(&self, k: &Identity, f: Fence, expected_revision: u64, now: u64) -> Result<()> {
        self.authorized()?;
        let _guard = self.lock_target(k)?;
        let (t, mut env) = self.load(k)?;
        Self::check(&env, f, expected_revision, now)?;
        env.revoked = true;
        env.fake_material_b64.zeroize();
        env.fake_material_b64.clear();
        env.credential_revision = env
            .credential_revision
            .checked_add(1)
            .ok_or(VaultError::Stale)?;
        self.save(&t, &env)
    }
    pub fn expire(&self, k: &Identity, f: Fence, expected_revision: u64, now: u64) -> Result<()> {
        self.authorized()?;
        let _guard = self.lock_target(k)?;
        let (t, mut env) = self.load(k)?;
        if env.revoked {
            return Err(VaultError::Revoked);
        }
        if env.fence != StoredFence::from(f) || env.credential_revision != expected_revision {
            return Err(VaultError::Stale);
        }
        if now < env.expires_at {
            return Err(VaultError::Denied);
        }
        env.revoked = true;
        env.fake_material_b64.zeroize();
        env.fake_material_b64.clear();
        env.credential_revision = env
            .credential_revision
            .checked_add(1)
            .ok_or(VaultError::Stale)?;
        self.save(&t, &env)
    }
    #[cfg(test)]
    fn fake_test(namespace: String) -> Self {
        Self {
            namespace,
            lock: Mutex::new(()),
            fake_test_enabled: true,
        }
    }
    #[cfg(test)]
    fn delete_exact_fake_test_target(&self, k: &Identity) {
        if let Ok(t) = self.target(k) {
            let wide = wide(&t);
            unsafe {
                windows_sys::Win32::Security::Credentials::CredDeleteW(
                    wide.as_ptr(),
                    CRED_TYPE_GENERIC,
                    0,
                );
            }
        }
    }
}
impl Default for Vault {
    fn default() -> Self {
        Self::new()
    }
}
fn hex_bytes(bytes: &[u8]) -> String {
    const HEX: &[u8] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        s.push(HEX[(b >> 4) as usize] as char);
        s.push(HEX[(b & 15) as usize] as char);
    }
    s
}
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}
fn read_cred(target: &str) -> Result<Zeroizing<Vec<u8>>> {
    let t = wide(target);
    let mut ptr_cred: *mut CREDENTIALW = ptr::null_mut();
    // SAFETY: Windows owns the returned allocation; it is copied before CredFree.
    if unsafe { CredReadW(t.as_ptr(), CRED_TYPE_GENERIC, 0, &mut ptr_cred) } == 0 {
        let raw = std::io::Error::last_os_error().raw_os_error().unwrap_or(0);
        return if raw == 1168 {
            Err(VaultError::Missing)
        } else {
            Err(VaultError::OsUnavailable)
        };
    }
    if ptr_cred.is_null() {
        return Err(VaultError::Corrupt);
    }
    let result = unsafe {
        let c = &*ptr_cred;
        if c.CredentialBlobSize > MAX_WIN_CRED_BLOB as u32 || c.CredentialBlob.is_null() {
            None
        } else {
            Some(Zeroizing::new(
                std::slice::from_raw_parts(c.CredentialBlob, c.CredentialBlobSize as usize)
                    .to_vec(),
            ))
        }
    };
    unsafe {
        CredFree(ptr_cred.cast());
    }
    result.ok_or(VaultError::Corrupt)
}
fn write_cred(target: &str, protected: &[u8]) -> Result<()> {
    if protected.is_empty() || protected.len() > MAX_WIN_CRED_BLOB {
        return Err(VaultError::Denied);
    }
    let mut t = wide(target);
    let mut data = Zeroizing::new(protected.to_vec());
    let c = CREDENTIALW {
        Type: CRED_TYPE_GENERIC,
        TargetName: t.as_mut_ptr(),
        CredentialBlobSize: data.len() as u32,
        CredentialBlob: data.as_mut_ptr(),
        Persist: CRED_PERSIST_LOCAL_MACHINE, // OS logon user's local store, NOT DPAPI machine scope.
        ..Default::default()
    };
    if unsafe { CredWriteW(&c, 0) } == 0 {
        return Err(VaultError::OsUnavailable);
    }
    Ok(())
}
fn dpapi(protect: bool, bytes: &[u8], scope_entropy: &[u8]) -> Result<Vec<u8>> {
    if bytes.is_empty() || scope_entropy.is_empty() || bytes.len() > u32::MAX as usize {
        return Err(VaultError::Corrupt);
    }
    let input = CRYPT_INTEGER_BLOB {
        cbData: bytes.len() as u32,
        pbData: bytes.as_ptr() as *mut u8,
    };
    let entropy = CRYPT_INTEGER_BLOB {
        cbData: scope_entropy.len() as u32,
        pbData: scope_entropy.as_ptr() as *mut u8,
    };
    let mut out = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: ptr::null_mut(),
    };
    // SAFETY: DPAPI input is borrowed synchronously; output is freed by LocalFree.
    // No CRYPTPROTECT_LOCAL_MACHINE: encrypted data is scoped to current Windows user.
    let success = unsafe {
        if protect {
            CryptProtectData(
                &input,
                ptr::null(),
                &entropy,
                ptr::null(),
                ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out,
            )
        } else {
            CryptUnprotectData(
                &input,
                ptr::null_mut(),
                &entropy,
                ptr::null(),
                ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out,
            )
        }
    };
    if success == 0 {
        return Err(VaultError::Corrupt);
    }
    if out.pbData.is_null() || out.cbData > 65536 {
        if !out.pbData.is_null() {
            unsafe {
                LocalFree(out.pbData.cast());
            }
        }
        return Err(VaultError::Corrupt);
    }
    let data = unsafe { std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec() };
    unsafe {
        std::ptr::write_bytes(out.pbData, 0, out.cbData as usize);
        LocalFree(out.pbData.cast());
    }
    Ok(data)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};
    fn identity(channel: &str, account: &str) -> Identity {
        Identity {
            tenant: "fake-tenant-W55".into(),
            channel: channel.into(),
            account: account.into(),
        }
    }
    fn fence() -> Fence {
        Fence {
            session_revision: 7,
            binding_revision: 8,
            account_revocation_epoch: 9,
        }
    }
    struct Fixture {
        vault: Vault,
        owned: Vec<Identity>,
    }
    impl Fixture {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let ns = format!("W55-unit-only-{}-{:?}", unique, std::thread::current().id());
            Self {
                vault: Vault::fake_test(ns),
                owned: vec![],
            }
        }
        fn own(&mut self, k: Identity) -> Identity {
            self.owned.push(k.clone());
            k
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            for k in &self.owned {
                self.vault.delete_exact_fake_test_target(k);
            }
        }
    }
    #[test]
    fn t01_normal_build_default_is_sealed() {
        let v = Vault::new();
        let k = identity("FB_PERSONAL", "fake-a");
        assert_eq!(v.inspect(&k, fence(), 1, 10), Err(VaultError::Sealed));
        assert!(matches!(
            v.lease(&k, fence(), 1, 10),
            Err(VaultError::Sealed)
        ));
        assert_eq!(
            v.store_fake(&k, fence(), b"TEST-ONLY", 100, 10),
            Err(VaultError::Sealed)
        );
        assert_eq!(
            v.rotate_fake(&k, fence(), 1, b"TEST", 100, 10),
            Err(VaultError::Sealed)
        );
        assert_eq!(v.revoke(&k, fence(), 1, 10), Err(VaultError::Sealed));
        assert_eq!(v.expire(&k, fence(), 1, 200), Err(VaultError::Sealed));
    }
    #[test]
    fn t02_wincred_dpapi_fake_roundtrip_and_restart() {
        let mut fx = Fixture::new();
        let k = fx.own(identity("FB_PERSONAL", "fake-a"));
        fx.vault
            .store_fake(&k, fence(), b"W55-FAKE-ONLY-001", 1000, 50)
            .unwrap();
        assert_eq!(
            fx.vault
                .inspect(&k, fence(), 1, 50)
                .unwrap()
                .credential_revision,
            1
        );
        let target = fx.vault.target(&k).unwrap();
        let encrypted = read_cred(&target).unwrap();
        assert!(!encrypted
            .windows(b"W55-FAKE-ONLY-001".len())
            .any(|w| w == b"W55-FAKE-ONLY-001"));
        assert_eq!(
            dpapi(false, &encrypted, b"wrong-entropy"),
            Err(VaultError::Corrupt)
        );
        let restart = Vault::fake_test(fx.vault.namespace.clone());
        let lease = restart.lease(&k, fence(), 1, 51).unwrap();
        assert_eq!(lease.bytes.as_slice(), b"W55-FAKE-ONLY-001");
        assert!(restart.inspect(&k, fence(), 1, 52).unwrap().active);
    }
    #[test]
    fn t03_cross_account_and_channel_denied() {
        let mut fx = Fixture::new();
        let k = fx.own(identity("FB_PERSONAL", "fake-a"));
        fx.vault.store_fake(&k, fence(), b"FAKE", 1000, 10).unwrap();
        let b = identity("FB_PERSONAL", "fake-b");
        let other_channel = identity("FB_PAGE", "fake-a");
        assert_eq!(
            fx.vault.inspect(&b, fence(), 1, 10),
            Err(VaultError::Missing)
        );
        assert_eq!(
            fx.vault.inspect(&other_channel, fence(), 1, 10),
            Err(VaultError::Missing)
        );
        let other_tenant = Identity {
            tenant: "fake-other".into(),
            ..k.clone()
        };
        assert_eq!(
            fx.vault.inspect(&other_tenant, fence(), 1, 10),
            Err(VaultError::Missing)
        );
    }
    #[test]
    fn t04_old_session_binding_and_account_epoch_denied() {
        let mut fx = Fixture::new();
        let k = fx.own(identity("WHATSAPP_PERSONAL", "fake-jid"));
        fx.vault.store_fake(&k, fence(), b"FAKE", 1000, 10).unwrap();
        for f in [
            Fence {
                session_revision: 6,
                ..fence()
            },
            Fence {
                binding_revision: 7,
                ..fence()
            },
            Fence {
                account_revocation_epoch: 8,
                ..fence()
            },
        ] {
            assert!(matches!(
                fx.vault.lease(&k, f, 1, 10),
                Err(VaultError::Stale)
            ));
        }
        assert!(matches!(
            fx.vault.lease(&k, fence(), 2, 10),
            Err(VaultError::Stale)
        ));
    }
    #[test]
    fn t05_rotation_invalidates_old_revision() {
        let mut fx = Fixture::new();
        let k = fx.own(identity("FB_PAGE", "fake-p"));
        fx.vault
            .store_fake(&k, fence(), b"FIRST-FAKE", 1000, 10)
            .unwrap();
        let revision = fx
            .vault
            .rotate_fake(&k, fence(), 1, b"SECOND-FAKE", 1500, 20)
            .unwrap();
        assert_eq!(revision, 2);
        assert!(matches!(
            fx.vault.lease(&k, fence(), 1, 21),
            Err(VaultError::Stale)
        ));
        assert_eq!(
            fx.vault.lease(&k, fence(), 2, 21).unwrap().bytes.as_slice(),
            b"SECOND-FAKE"
        );
    }
    #[test]
    fn t06_revocation_tombstone_survives_restart() {
        let mut fx = Fixture::new();
        let k = fx.own(identity("TELEGRAM_PERSONAL", "fake-t"));
        fx.vault.store_fake(&k, fence(), b"FAKE", 1000, 10).unwrap();
        fx.vault.revoke(&k, fence(), 1, 11).unwrap();
        let reboot = Vault::fake_test(fx.vault.namespace.clone());
        assert!(matches!(
            reboot.lease(&k, fence(), 1, 12),
            Err(VaultError::Revoked)
        ));
        assert_eq!(
            reboot.store_fake(&k, fence(), b"OLD-FAKE", 1000, 12),
            Err(VaultError::Stale)
        );
        let protected = read_cred(&reboot.target(&k).unwrap()).unwrap();
        let plain = dpapi(false, &protected, reboot.target(&k).unwrap().as_bytes()).unwrap();
        assert!(!plain.windows(b"FAKE".len()).any(|w| w == b"FAKE"));
    }
    #[test]
    fn t07_expire_rejects_old_secret_and_wipes_on_expiry() {
        let mut fx = Fixture::new();
        let k = fx.own(identity("WHATSAPP_PERSONAL", "fake-exp"));
        fx.vault
            .store_fake(&k, fence(), b"EXPIRE-FAKE", 99, 10)
            .unwrap();
        assert!(matches!(
            fx.vault.lease(&k, fence(), 1, 99),
            Err(VaultError::Expired)
        ));
        assert_eq!(fx.vault.expire(&k, fence(), 1, 80), Err(VaultError::Denied));
        fx.vault.expire(&k, fence(), 1, 99).unwrap();
        assert!(matches!(
            fx.vault.lease(&k, fence(), 1, 100),
            Err(VaultError::Revoked)
        ));
    }
    #[test]
    fn t08_invalid_realish_and_oversized_material_denied() {
        let mut fx = Fixture::new();
        let not_fake = identity("FB_PERSONAL", "real-like-id");
        assert_eq!(
            fx.vault.store_fake(&not_fake, fence(), b"XX", 50, 10),
            Err(VaultError::Denied)
        );
        let k = fx.own(identity("FB_PERSONAL", "fake-size"));
        let big = vec![0x41; 513];
        assert_eq!(
            fx.vault.store_fake(&k, fence(), &big, 50, 10),
            Err(VaultError::Denied)
        );
        assert_eq!(
            fx.vault.store_fake(&k, fence(), b"X", 10, 10),
            Err(VaultError::Denied)
        );
    }
    #[test]
    fn t09_corrupted_dpapi_blob_rejected() {
        let mut fx = Fixture::new();
        let k = fx.own(identity("FB_PERSONAL", "fake-corrupt"));
        let t = fx.vault.target(&k).unwrap();
        write_cred(&t, b"fake-but-not-a-DPAPI-blob").unwrap();
        assert_eq!(
            fx.vault.inspect(&k, fence(), 1, 10),
            Err(VaultError::Corrupt)
        );
    }
    #[test]
    fn t10_wrong_entropy_and_target_ref_no_leakage() {
        let mut fx = Fixture::new();
        let k = fx.own(identity("TELEGRAM_PERSONAL", "fake-secret-name"));
        fx.vault
            .store_fake(&k, fence(), b"FAKE-TOKEN-NO-HTTP", 500, 10)
            .unwrap();
        let t = fx.vault.target(&k).unwrap();
        assert!(!t.contains("fake-secret-name"));
        assert!(!t.contains("TELEGRAM_PERSONAL"));
        let encrypted = read_cred(&t).unwrap();
        let plain = dpapi(false, &encrypted, t.as_bytes()).unwrap();
        assert!(!plain.is_empty());
        assert_eq!(
            dpapi(false, &encrypted, b"forged-channel-key"),
            Err(VaultError::Corrupt)
        );
    }
    #[test]
    fn t11_old_revision_cannot_rotate_or_revoke() {
        let mut fx = Fixture::new();
        let k = fx.own(identity("FB_PAGE", "fake-revision"));
        fx.vault
            .store_fake(&k, fence(), b"FAKE-A", 500, 10)
            .unwrap();
        fx.vault
            .rotate_fake(&k, fence(), 1, b"FAKE-B", 600, 20)
            .unwrap();
        assert_eq!(
            fx.vault.rotate_fake(&k, fence(), 1, b"FAKE-C", 700, 30),
            Err(VaultError::Stale)
        );
        assert_eq!(fx.vault.revoke(&k, fence(), 1, 30), Err(VaultError::Stale));
    }
    #[test]
    fn t12_child_process_reader() {
        let ns = match std::env::var("W55_CHILD_TEST_NAMESPACE") {
            Ok(ns) => ns,
            Err(_) => return, // only the explicit parent test invokes this case
        };
        assert!(ns.starts_with("W55-unit-only-"));
        let v = Vault::fake_test(ns);
        let k = identity("TELEGRAM_PERSONAL", "fake-child");
        match std::env::var("W55_CHILD_TEST_PHASE").unwrap().as_str() {
            "live" => {
                assert_eq!(
                    v.lease(&k, fence(), 1, 30).unwrap().bytes.as_slice(),
                    b"FAKE-CROSS-PROCESS"
                );
            }
            "revoked" => {
                assert!(matches!(
                    v.lease(&k, fence(), 1, 30),
                    Err(VaultError::Revoked)
                ));
            }
            _ => panic!("invalid nonproduction test mode"),
        }
    }
    #[test]
    fn t13_real_separate_process_recovery_and_revoke() {
        let mut fx = Fixture::new();
        let k = fx.own(identity("TELEGRAM_PERSONAL", "fake-child"));
        fx.vault
            .store_fake(&k, fence(), b"FAKE-CROSS-PROCESS", 100, 20)
            .unwrap();
        let child_exe = std::env::current_exe().unwrap();
        let invoke = |phase: &str| {
            std::process::Command::new(&child_exe)
                .arg("--exact")
                .arg("tests::t12_child_process_reader")
                .env("W55_CHILD_TEST_NAMESPACE", &fx.vault.namespace)
                .env("W55_CHILD_TEST_PHASE", phase)
                .status()
                .unwrap()
        };
        assert!(
            invoke("live").success(),
            "fresh independent process must recover WinCred fake material"
        );
        fx.vault.revoke(&k, fence(), 1, 21).unwrap();
        assert!(
            invoke("revoked").success(),
            "independent process must reject revoked tombstone"
        );
    }
}

pub mod cloud_keys;

#[cfg(test)]
mod security_delta;
