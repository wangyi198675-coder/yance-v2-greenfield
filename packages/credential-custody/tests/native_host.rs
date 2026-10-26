//! Non-cfg(test) Rust WinCred+DPAPI lifecycle using fictional material only.
//! The host verification callback is a test stand-in; production requires W54.
use sha2::{Digest, Sha256};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use yance_w55_fake_credential_custody::{
    cloud_keys::{CloudProvider, NativeKeyCustody, NativeScope},
    VaultError,
};
fn scope() -> NativeScope {
    let unique = format!(
        "w55-offline-qa-{}-{:?}",
        std::process::id(),
        std::time::SystemTime::now()
    );
    let a = format!(
        "w54i_{:x}",
        Sha256::digest(format!("{unique}-install").as_bytes())
    );
    let b = format!(
        "w54u_{:x}",
        Sha256::digest(format!("{unique}-osuser").as_bytes())
    );
    NativeScope::from_w54_native_only(&a, &b).expect("fictional formatted identifiers")
}
#[test]
fn native_os_user_storage_revoke_and_fence_in_normal_build() {
    let live = Arc::new(AtomicBool::new(true));
    let witness = Arc::clone(&live);
    let vault = NativeKeyCustody::from_native_host(scope(), move || {
        if witness.load(Ordering::SeqCst) {
            Ok(())
        } else {
            Err(VaultError::Denied)
        }
    })
    .expect("test-native owner alive");
    let provider = CloudProvider::OpenRouter;
    const K1: &[u8] = b"sk-or-v1-NOT-ISSUED-W55-TEST-KEY-A";
    const K2: &[u8] = b"sk-or-v1-NOT-ISSUED-W55-TEST-KEY-B";
    assert_eq!(vault.enroll(provider, K1), Ok(1));
    let state = vault.status(provider).unwrap();
    assert_eq!(state.revision, 1);
    assert!(state.configured && !state.revoked);
    assert_eq!(vault.rotate(provider, 1, K2), Ok(2));
    assert_eq!(vault.rotate(provider, 1, K1), Err(VaultError::Stale));
    let mut matched = false;
    vault
        .with_native_key(provider, 2, |bytes| {
            matched = bytes == K2;
            Ok(())
        })
        .unwrap();
    assert!(matched);
    assert_eq!(vault.revoke(provider, 2), Ok(3));
    assert!(matches!(
        vault.with_native_key(provider, 3, |_| Ok(())),
        Err(VaultError::Revoked)
    ));
    assert_eq!(
        vault.re_enroll_revoked(provider, 2, K1),
        Err(VaultError::Stale)
    );
    assert_eq!(vault.re_enroll_revoked(provider, 3, K1), Ok(4));
    assert_eq!(vault.revoke(provider, 4), Ok(5));
    live.store(false, Ordering::SeqCst);
    assert!(matches!(vault.status(provider), Err(VaultError::Denied)));
    assert_eq!(
        vault.re_enroll_revoked(provider, 5, K2),
        Err(VaultError::Denied)
    );
}
