//! Windows-only, test-compiled security negative cases. All material is fictional.
use super::*;
use std::{
    fs,
    path::PathBuf,
    process::{Command, Stdio},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

fn identity() -> Identity {
    Identity {
        tenant: "fake-w55-delta".into(),
        channel: "FB_PAGE".into(),
        account: "fake-race".into(),
    }
}
fn fence() -> Fence {
    Fence {
        session_revision: 7,
        binding_revision: 8,
        account_revocation_epoch: 9,
    }
}
struct TestCtx {
    vault: Vault,
    path: Option<PathBuf>,
}
impl TestCtx {
    fn new() -> Self {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        Self {
            vault: Vault::fake_test(format!("W55-delta-{unique}-{:?}", thread::current().id())),
            path: None,
        }
    }
}
impl Drop for TestCtx {
    fn drop(&mut self) {
        self.vault.delete_exact_fake_test_target(&identity());
        if let Some(ref p) = self.path {
            let _ = fs::remove_dir_all(p);
        }
    }
}

#[test]
fn t18_two_os_processes_compete_for_rotate_and_revoke() {
    let mut t = TestCtx::new();
    t.vault
        .store_fake(&identity(), fence(), b"W55-FAKE-RACE-OLD", 300, 20)
        .unwrap();
    let dir = std::env::temp_dir().join(format!(
        "w55-synthetic-{}",
        hex_bytes(&Sha256::digest(t.vault.namespace.as_bytes()))
    ));
    fs::create_dir(&dir).unwrap();
    t.path = Some(dir.clone());
    let exe = std::env::current_exe().unwrap();
    let spawn = |phase: &str| {
        Command::new(&exe)
            .arg("--exact")
            .arg("security_delta::t19_child_race_worker")
            .env("W55_RACE_NS", &t.vault.namespace)
            .env("W55_RACE_DIR", &dir)
            .env("W55_RACE_PHASE", phase)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap()
    };
    let rotate = spawn("rotate");
    let revoke = spawn("revoke");
    let mut both_ready = false;
    for _ in 0..500 {
        if dir.join("ready-rotate").exists() && dir.join("ready-revoke").exists() {
            both_ready = true;
            break;
        }
        thread::sleep(Duration::from_millis(10));
    }
    assert!(
        both_ready,
        "synthetic workers must arrive at the OS process race barrier"
    );
    fs::write(dir.join("go"), b"1").unwrap();
    let x = rotate.wait_with_output().unwrap();
    let y = revoke.wait_with_output().unwrap();
    assert!(
        x.status.success() && y.status.success(),
        "separate workers must fail safely"
    );
    let r = fs::read_to_string(dir.join("result-rotate")).unwrap();
    let v = fs::read_to_string(dir.join("result-revoke")).unwrap();
    assert_eq!(
        usize::from(r == "rotated") + usize::from(v == "revoked-ok"),
        1,
        "exactly one expected-revision-1 mutation may win across processes"
    );
    assert!(matches!(
        t.vault.lease(&identity(), fence(), 1, 101),
        Err(VaultError::Stale | VaultError::Revoked)
    ));
    if r == "rotated" {
        assert_eq!(v, "stale");
        t.vault.revoke(&identity(), fence(), 2, 102).unwrap();
    } else {
        assert_eq!(r, "revoked");
    }
    assert!(matches!(
        t.vault.lease(&identity(), fence(), 1, 103),
        Err(VaultError::Revoked)
    ));
    assert_eq!(
        t.vault
            .store_fake(&identity(), fence(), b"W55-FAKE-OLD", 400, 103),
        Err(VaultError::Stale)
    );
}
#[test]
fn t19_child_race_worker() {
    let ns = match std::env::var("W55_RACE_NS") {
        Ok(ns) => ns,
        Err(_) => return,
    };
    assert!(ns.starts_with("W55-delta-"));
    let dir = PathBuf::from(std::env::var("W55_RACE_DIR").unwrap());
    let phase = std::env::var("W55_RACE_PHASE").unwrap();
    assert!(phase == "rotate" || phase == "revoke");
    fs::write(dir.join(format!("ready-{phase}")), b"1").unwrap();
    let mut released = false;
    for _ in 0..500 {
        if dir.join("go").exists() {
            released = true;
            break;
        }
        thread::sleep(Duration::from_millis(10));
    }
    assert!(released, "parent did not release fake test barrier");
    let vault = Vault::fake_test(ns);
    let outcome = if phase == "rotate" {
        match vault.rotate_fake(&identity(), fence(), 1, b"W55-FAKE-RACE-NEW", 400, 100) {
            Ok(2) => "rotated",
            Err(VaultError::Stale) => "stale",
            Err(VaultError::Revoked) => "revoked",
            _ => panic!("sanitized unexpected rotate result"),
        }
    } else {
        match vault.revoke(&identity(), fence(), 1, 100) {
            Ok(()) => "revoked-ok",
            Err(VaultError::Stale) => "stale",
            Err(VaultError::Revoked) => "revoked",
            _ => panic!("sanitized unexpected revoke result"),
        }
    };
    fs::write(dir.join(format!("result-{phase}")), outcome).unwrap();
}
#[test]
fn t20_errors_and_panic_diagnostics_contain_no_fake_secret() {
    let marker = "W55-FAKE-DIAGNOSTIC-PRIVATE-MATERIAL";
    let vault = Vault::new();
    let err = vault
        .store_fake(&identity(), fence(), marker.as_bytes(), 120, 1)
        .unwrap_err();
    assert_eq!(err, VaultError::Sealed);
    let diagnostic = format!("{err:?}");
    assert!(!diagnostic.contains(marker) && !diagnostic.contains("fake-race"));
    let output = Command::new(std::env::current_exe().unwrap())
        .arg("--exact")
        .arg("security_delta::t21_child_exception")
        .env("W55_EXCEPTION_PROBE", "1")
        .output()
        .unwrap();
    assert!(output.status.success());
    for stream in [output.stdout, output.stderr] {
        let s = String::from_utf8_lossy(&stream);
        assert!(
            !s.contains(marker) && !s.contains("fake-race"),
            "child exception displayed a fake credential or identity"
        );
    }
}
#[test]
fn t21_child_exception() {
    if std::env::var("W55_EXCEPTION_PROBE").as_deref() != Ok("1") {
        return;
    }
    let vault = Vault::new();
    let err = vault
        .store_fake(
            &identity(),
            fence(),
            b"W55-FAKE-DIAGNOSTIC-PRIVATE-MATERIAL",
            120,
            1,
        )
        .unwrap_err();
    let result = std::panic::catch_unwind(|| panic!("Sanitized W55 VaultError={err:?}"));
    assert!(result.is_err());
}
