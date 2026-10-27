//! Real current-user WinCred+DPAPI, separate Windows child each operation.
//! The non-real QA namespace is random and explicitly cleaned after test.
//! No existing user's real credentials are read or sent to any service.
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    process::{Command, Stdio},
    time::{SystemTime, UNIX_EPOCH},
};

struct FakeNamespace(String);
impl FakeNamespace {
    fn new() -> Self {
        let seed = format!(
            "{}-{}-{:?}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            std::thread::current().id()
        );
        let h = Sha256::digest(seed.as_bytes());
        let suffix: String = h[..16].iter().map(|b| format!("{b:02x}")).collect();
        Self(format!("W55_WEB_QA_{suffix}"))
    }
    fn call(&self, cmd: Value) -> (bool, Value) {
        let executable = env!("CARGO_BIN_EXE_web_local_cloud_keys");
        let mut child = Command::new(executable)
            .env("W55_WEB_QA_SCOPE", &self.0)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("OS child started");
        {
            let mut stdin = child.stdin.take().unwrap();
            serde_json::to_writer(&mut stdin, &cmd).expect("only invented material");
        }
        let out = child.wait_with_output().expect("OS child waited");
        // NEVER log raw stdout: lease contains intentionally fake material only.
        let parsed: Value = serde_json::from_slice(&out.stdout).expect("one bounded response");
        (out.status.success(), parsed)
    }
    fn success(&self, cmd: Value) -> Value {
        let (pass, out) = self.call(cmd);
        assert!(pass, "operation must succeed");
        assert_eq!(out["ok"], true);
        out
    }
    fn rejected(&self, cmd: Value) {
        let (pass, out) = self.call(cmd);
        assert!(!pass, "fail closed");
        assert_eq!(out["ok"], false);
        assert_eq!(out["error"], "NATIVE_CREDENTIAL_DENIED");
    }
}
impl Drop for FakeNamespace {
    fn drop(&mut self) {
        for provider in ["OPENROUTER", "OPENAI_API", "PANCAKE_PAIR"] {
            let _ = self.call(json!({"op":"qa_cleanup","provider":provider}));
        }
    }
}
#[test]
fn web_byok_real_windows_child_os_user_dpapi_cas_provider_separation_and_revoke() {
    let s = FakeNamespace::new();
    const OR1: &str = "sk-or-v1-W55-WEB-QA-NOT-REAL-AAA";
    const OR2: &str = "sk-or-v1-W55-WEB-QA-NOT-REAL-BBB";
    const AI1: &str = concat!("sk-", "proj-", "W55-WEB-QA-NOT-REAL-CCC");
    let open = s.success(json!({"op":"status","provider":"OPENROUTER"}));
    assert_eq!(open["revision"], 0);
    assert_eq!(open["configured"], false);
    assert_eq!(open["revoked"], false);
    let ai = s.success(json!({"op":"status","provider":"OPENAI_API"}));
    assert_eq!(ai["revision"], 0);
    let saved = s.success(json!({"op":"store","provider":"OPENROUTER","secret":OR1}));
    assert_eq!(saved["revision"], 1);
    assert_eq!(saved["configured"], true);
    assert!(!saved.to_string().contains(OR1));
    s.rejected(json!({"op":"store","provider":"OPENROUTER","secret":OR2}));
    s.rejected(json!({"op":"store","provider":"OPENROUTER","secret":OR2,
  "expectedRevision":9}));
    // Another process reopens the same Windows user's encrypted record.
    let restarted = s.success(json!({"op":"status","provider":"OPENROUTER"}));
    assert_eq!(restarted["revision"], 1);
    let lease = s.success(json!({"op":"lease_for_agno","provider":"OPENROUTER",
  "expectedRevision":1}));
    assert_eq!(lease["privateKey"], OR1);
    // Never put secret into logs/output. This value is only in test memory.
    let updated = s.success(json!({"op":"store","provider":"OPENROUTER",
  "expectedRevision":1,"secret":OR2}));
    assert_eq!(updated["revision"], 2);
    s.rejected(json!({"op":"lease_for_agno","provider":"OPENROUTER",
  "expectedRevision":1}));
    let independent = s.success(json!({"op":"store","provider":"OPENAI_API",
  "secret":AI1}));
    assert_eq!(independent["revision"], 1);
    assert_eq!(
        s.success(json!({"op":"status","provider":"OPENROUTER"}))["revision"],
        2
    );
    assert_eq!(
        s.success(json!({"op":"lease_for_agno","provider":"OPENAI_API",
  "expectedRevision":1}))["privateKey"],
        AI1
    );
    let revoked = s.success(json!({"op":"revoke","provider":"OPENROUTER",
  "expectedRevision":2}));
    assert_eq!(revoked["revision"], 3);
    assert_eq!(revoked["configured"], false);
    assert_eq!(revoked["revoked"], true);
    s.rejected(json!({"op":"lease_for_agno","provider":"OPENROUTER",
  "expectedRevision":3}));
    s.rejected(json!({"op":"lease_for_agno","provider":"OPENROUTER",
  "expectedRevision":2}));
    assert_eq!(
        s.success(json!({"op":"status","provider":"OPENAI_API"}))["configured"],
        true
    );
    let revoked_ai = s.success(json!({"op":"revoke","provider":"OPENAI_API",
  "expectedRevision":1}));
    assert_eq!(revoked_ai["revision"], 2);
    assert_eq!(revoked_ai["revoked"], true);
    s.rejected(json!({"op":"lease_for_agno","provider":"OPENAI_API",
  "expectedRevision":2}));
    let onboarding = s.success(json!({"op":"store","provider":"OPENROUTER",
  "expectedRevision":3,"secret":OR1}));
    assert_eq!(onboarding["revision"], 4);
    s.success(json!({"op":"revoke","provider":"OPENROUTER","expectedRevision":4}));
    // No secrets may be accepted in status or via unsupported operations.
    s.rejected(json!({"op":"status","provider":"OPENROUTER","secret":OR1}));
    s.rejected(json!({"op":"export","provider":"OPENROUTER"}));
    s.rejected(json!({"op":"lease_for_agno","provider":"OPENROUTER","expectedRevision":4}));
    // Remove only QA WinCred records and independently verify there is no
    // remaining synthetic credential or post-cleanup Agno Key lease.
    for provider in ["OPENROUTER", "OPENAI_API"] {
        assert_eq!(
            s.success(json!({"op":"qa_cleanup","provider":provider}))["qaCleaned"],
            true
        );
        let empty = s.success(json!({"op":"status","provider":provider}));
        assert_eq!(empty["configured"], false);
        assert_eq!(empty["revision"], 0);
    }
    println!("W55_WEB_REAL_OS_WINCRED_DPAPI_SEPARATE_CHILD_PASS providers=2 restart=true rotate=true revoke=true oldRevisionDenied=true redacted=true paidCalls=0");
}

#[test]
fn web_fb_page_fake_pair_atomic_dpapi_isolated_from_model_leases() {
    let scope = FakeNamespace::new();
    const USER: &str = "FAKE-PANCAKE-USER-12345-NOT-REAL";
    const PAGE: &str = "FAKE-PANCAKE-PAGE-98765-NOT-REAL";
    let pair = json!({"userAccessToken":USER,"pages":{"1111":PAGE,"2222":"FAKE-PANCAKE-PAGE-22222"}}).to_string();
    let first = scope.success(json!({"op":"status","provider":"PANCAKE_PAIR"}));
    assert_eq!(first["configured"], false);
    assert_eq!(first["revision"], 0);
    let saved=scope.success(json!({"op":"store","provider":"PANCAKE_PAIR","secret":pair}));
    assert_eq!(saved["configured"],true);
    assert_eq!(saved["revision"],1);
    assert!(!saved.to_string().contains(USER));
    assert!(!saved.to_string().contains(PAGE));
    let second=scope.success(json!({"op":"status","provider":"PANCAKE_PAIR"}));
    assert_eq!(second["revision"],1);
    // Social secrets must never be returned through private Brain/Agno key APIs.
    scope.rejected(json!({"op":"lease_for_agno","provider":"PANCAKE_PAIR",
        "expectedRevision":1}));
    scope.rejected(json!({"op":"store","provider":"OPENROUTER","secret":pair}));
    let revision=scope.success(json!({"op":"revoke","provider":"PANCAKE_PAIR",
        "expectedRevision":1}));
    assert_eq!(revision["configured"],false);
    assert_eq!(revision["revoked"],true);
    scope.rejected(json!({"op":"lease_for_agno","provider":"PANCAKE_PAIR",
        "expectedRevision":2}));
    assert_eq!(scope.success(json!({"op":"qa_cleanup","provider":"PANCAKE_PAIR"}))
        ["qaCleaned"],true);
    assert_eq!(scope.success(json!({"op":"status","provider":"PANCAKE_PAIR"}))
        ["revision"],0);
}
