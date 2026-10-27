use yance_w55_fake_credential_custody::{
    cloud_keys::{CloudProvider, NativeKeyCustody, NativeScope},
    VaultError,
};
#[test]
fn external_crate_cannot_operate_sealed_cloud_store() {
    let vault = NativeKeyCustody::new();
    assert!(matches!(
        vault.status(CloudProvider::OpenRouter),
        Err(VaultError::Sealed)
    ));
    assert!(matches!(
        vault.revoke(CloudProvider::OpenAi, 1),
        Err(VaultError::Sealed)
    ));
    let selector = NativeScope::from_w54_native_only(
        &format!("w54i_{}", "a".repeat(64)),
        &format!("w54u_{}", "b".repeat(64)),
    )
    .unwrap();
    assert_eq!(format!("{selector:?}"), "NativeScope(REDACTED)");
    assert!(matches!(
        vault.with_native_key(CloudProvider::OpenAi, 1, |_| Ok(())),
        Err(VaultError::Sealed)
    ));
}
