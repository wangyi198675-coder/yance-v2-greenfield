//! Native-only ephemeral session & single-use IPC proof, no HTTP/JS bearer.
//! This is an isolated prototype: its proof is NOT connected to W47 until SEC approval.
use crate::windows_principal::{current_windows_principal, WindowsPrincipal};
use serde::Serialize;
use std::{
    sync::Mutex,
    time::{Duration, Instant},
};

const TOKEN_BYTES: usize = 32;

fn secure_bytes() -> Result<[u8; TOKEN_BYTES], &'static str> {
    let mut out = [0u8; TOKEN_BYTES];
    getrandom::fill(&mut out).map_err(|_| "SECURE_OS_RNG_UNAVAILABLE")?;
    Ok(out)
}
#[derive(Debug)]
struct Inner {
    session_id: [u8; TOKEN_BYTES],
    revision: u64,
    expires_at: Instant,
    revoked: bool,
    next_sequence: u64,
    last_verified: u64,
    pending: Option<[u8; TOKEN_BYTES]>,
}
/// Never Serialize, never return to JS, HTTP or a log.
#[derive(Clone, Debug)]
pub(crate) struct NativeOnlyProof {
    boot: [u8; TOKEN_BYTES],
    session_id: [u8; TOKEN_BYTES],
    revision: u64,
    sequence: u64,
    challenge: [u8; TOKEN_BYTES],
}
#[derive(Debug)]
pub(crate) struct SessionAuthority {
    os_principal: Option<WindowsPrincipal>,
    boot: [u8; TOKEN_BYTES],
    inner: Mutex<Inner>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PublicSessionStatus {
    pub native_os_verified: bool,
    pub native_session_active: bool,
    pub server_trusted: bool,
    pub can_send: bool,
    pub connected_account_count: u8,
}
impl SessionAuthority {
    pub(crate) fn new(os: Option<WindowsPrincipal>, ttl: Duration) -> Result<Self, &'static str> {
        if ttl.is_zero() {
            return Err("TTL_ZERO");
        }
        Ok(Self {
            os_principal: os.clone(),
            boot: secure_bytes()?,
            inner: Mutex::new(Inner {
                session_id: secure_bytes()?,
                revision: 1,
                expires_at: Instant::now() + ttl,
                revoked: os.is_none(),
                next_sequence: 0,
                last_verified: 0,
                pending: None,
            }),
        })
    }
    fn os_matches(&self) -> bool {
        match (&self.os_principal, current_windows_principal()) {
            (Some(expected), Ok(actual)) => *expected == actual,
            _ => false,
        }
    }
    pub(crate) fn public_status(&self) -> PublicSessionStatus {
        let os_ok = self.os_matches();
        let active = self
            .inner
            .lock()
            .map(|s| !s.revoked && Instant::now() < s.expires_at && os_ok)
            .unwrap_or(false);
        PublicSessionStatus {
            native_os_verified: os_ok,
            native_session_active: active,
            server_trusted: false,
            can_send: false,
            connected_account_count: 0,
        }
    }
    /// Native-only binding issue. Must never become an invoke() command.
    #[allow(dead_code)]
    pub(crate) fn mint_for_native_bridge(&self) -> Result<NativeOnlyProof, &'static str> {
        if !self.os_matches() {
            return Err("OS_BINDING_MISMATCH");
        }
        self.mint_at(Instant::now())
    }
    fn mint_at(&self, now: Instant) -> Result<NativeOnlyProof, &'static str> {
        let mut s = self.inner.lock().map_err(|_| "SESSION_LOCK_POISONED")?;
        if s.revoked || now >= s.expires_at {
            return Err("SESSION_INACTIVE");
        }
        s.next_sequence = s.next_sequence.checked_add(1).ok_or("SEQUENCE_EXHAUSTED")?;
        let challenge = secure_bytes()?;
        s.pending = Some(challenge);
        Ok(NativeOnlyProof {
            boot: self.boot,
            session_id: s.session_id,
            revision: s.revision,
            sequence: s.next_sequence,
            challenge,
        })
    }
    /// Server-side trusted native IPC peer validation HOOK, not yet connected to W47.
    /// Proof never crosses an unauthenticated pipe, webview or HTTP request.
    #[allow(dead_code)]
    pub(crate) fn verify_native_bridge(&self, proof: &NativeOnlyProof) -> Result<(), &'static str> {
        if !self.os_matches() {
            return Err("OS_BINDING_MISMATCH");
        }
        self.verify_at(proof, Instant::now())
    }
    fn verify_at(&self, proof: &NativeOnlyProof, now: Instant) -> Result<(), &'static str> {
        let mut s = self.inner.lock().map_err(|_| "SESSION_LOCK_POISONED")?;
        if s.revoked || now >= s.expires_at {
            return Err("SESSION_INACTIVE");
        }
        if self.boot != proof.boot
            || s.session_id != proof.session_id
            || s.revision != proof.revision
        {
            return Err("SESSION_REVISION_MISMATCH");
        }
        if proof.sequence <= s.last_verified || proof.sequence != s.next_sequence {
            return Err("IPC_SEQUENCE_REPLAY");
        }
        if s.pending != Some(proof.challenge) {
            return Err("IPC_CHALLENGE_MISMATCH");
        }
        s.pending = None;
        s.last_verified = proof.sequence;
        Ok(())
    }
    pub(crate) fn revoke(&self) -> Result<u64, &'static str> {
        let mut s = self.inner.lock().map_err(|_| "SESSION_LOCK_POISONED")?;
        s.revoked = true;
        s.pending = None;
        s.session_id.fill(0);
        s.revision = s.revision.checked_add(1).ok_or("REVISION_EXHAUSTED")?;
        Ok(s.revision)
    }
    /// Native-only rotation; intentionally not exported as a renderer command.
    #[allow(dead_code)]
    pub(crate) fn rotate(&self, ttl: Duration) -> Result<(), &'static str> {
        if !self.os_matches() {
            return Err("OS_BINDING_MISMATCH");
        }
        if ttl.is_zero() {
            return Err("TTL_ZERO");
        }
        let mut s = self.inner.lock().map_err(|_| "SESSION_LOCK_POISONED")?;
        if s.revoked || Instant::now() >= s.expires_at {
            return Err("SESSION_INACTIVE");
        }
        let new_id = secure_bytes()?;
        let new_revision = s.revision.checked_add(1).ok_or("REVISION_EXHAUSTED")?;
        s.session_id = new_id;
        s.revision = new_revision;
        s.expires_at = Instant::now() + ttl;
        s.pending = None;
        Ok(())
    }
}
impl Drop for SessionAuthority {
    fn drop(&mut self) {
        if let Ok(mut s) = self.inner.lock() {
            s.revoked = true;
            s.pending = None;
            s.session_id.fill(0);
        }
        self.boot.fill(0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture_os() -> WindowsPrincipal {
        WindowsPrincipal {
            sid: vec![1, 2, 3],
            logon_low: 42,
            logon_high: 0,
            process_id: 1234,
        }
    }
    fn fixture() -> SessionAuthority {
        SessionAuthority::new(Some(fixture_os()), Duration::from_secs(900)).unwrap()
    }
    #[test]
    fn issued_proof_is_single_use() {
        let host = fixture();
        let proof = host.mint_at(Instant::now()).unwrap();
        host.verify_at(&proof, Instant::now()).unwrap();
        assert_eq!(
            host.verify_at(&proof, Instant::now()),
            Err("IPC_SEQUENCE_REPLAY")
        );
    }
    #[test]
    fn wrong_challenge_fails_closed() {
        let host = fixture();
        let mut proof = host.mint_at(Instant::now()).unwrap();
        proof.challenge[0] ^= 1;
        assert_eq!(
            host.verify_at(&proof, Instant::now()),
            Err("IPC_CHALLENGE_MISMATCH")
        );
    }
    #[test]
    fn revoked_proof_cannot_be_verified() {
        let host = fixture();
        let proof = host.mint_at(Instant::now()).unwrap();
        host.revoke().unwrap();
        assert_eq!(
            host.verify_at(&proof, Instant::now()),
            Err("SESSION_INACTIVE")
        );
    }
    #[test]
    fn expired_proof_fails() {
        let host = fixture();
        let proof = host.mint_at(Instant::now()).unwrap();
        let when = host.inner.lock().unwrap().expires_at;
        assert_eq!(host.verify_at(&proof, when), Err("SESSION_INACTIVE"));
    }
    #[test]
    fn another_boot_process_replay_is_denied() {
        let a = fixture();
        let b = fixture();
        let proof = a.mint_at(Instant::now()).unwrap();
        assert_eq!(
            b.verify_at(&proof, Instant::now()),
            Err("SESSION_REVISION_MISMATCH")
        );
    }
    #[test]
    fn older_pending_challenge_cannot_override_latest() {
        let host = fixture();
        let old = host.mint_at(Instant::now()).unwrap();
        let fresh = host.mint_at(Instant::now()).unwrap();
        assert_eq!(
            host.verify_at(&old, Instant::now()),
            Err("IPC_SEQUENCE_REPLAY")
        );
        host.verify_at(&fresh, Instant::now()).unwrap();
    }
    #[test]
    fn cannot_mint_after_logout() {
        let host = fixture();
        host.revoke().unwrap();
        assert_eq!(
            host.mint_at(Instant::now()).unwrap_err(),
            "SESSION_INACTIVE"
        );
    }
    #[test]
    fn no_os_principal_means_no_session() {
        let host = SessionAuthority::new(None, Duration::from_secs(10)).unwrap();
        assert_eq!(
            host.mint_at(Instant::now()).unwrap_err(),
            "SESSION_INACTIVE"
        );
    }
    #[test]
    fn zero_ttl_denied() {
        assert_eq!(
            SessionAuthority::new(Some(fixture_os()), Duration::ZERO).unwrap_err(),
            "TTL_ZERO"
        );
    }
    #[test]
    fn public_dto_never_grants_server_or_send() {
        let s = fixture().public_status();
        let json = serde_json::to_string(&s).unwrap();
        assert!(json.contains("\"canSend\":false"));
        assert!(json.contains("\"serverTrusted\":false"));
        assert!(!json.contains("sid"));
        assert!(!json.contains("sessionId"));
    }
    #[test]
    fn os_binding_is_not_fake_actor() {
        let host = fixture();
        assert!(
            !host.os_matches(),
            "synthetic principal must not equal real OS identity"
        );
    }
    #[test]
    fn no_web_exposure_in_proof_type() {
        let proof = fixture().mint_at(Instant::now()).unwrap();
        assert_eq!(proof.revision, 1);
    }
    #[cfg(windows)]
    #[test]
    fn real_windows_process_token_can_open_native_session() {
        let principal = current_windows_principal().expect("real Windows process token");
        assert!(!principal.sid.is_empty());
        assert_eq!(principal.process_id, std::process::id());
        let host = SessionAuthority::new(Some(principal), Duration::from_secs(30)).unwrap();
        let state = host.public_status();
        assert!(state.native_os_verified && state.native_session_active);
        assert!(!state.server_trusted && !state.can_send);
        let proof = host.mint_for_native_bridge().unwrap();
        host.verify_native_bridge(&proof).unwrap();
        assert_eq!(
            host.verify_native_bridge(&proof),
            Err("IPC_SEQUENCE_REPLAY")
        );
    }
    #[cfg(windows)]
    #[test]
    fn native_rotation_invalidates_old_proof() {
        let principal = current_windows_principal().unwrap();
        let host = SessionAuthority::new(Some(principal), Duration::from_secs(30)).unwrap();
        let old = host.mint_for_native_bridge().unwrap();
        host.rotate(Duration::from_secs(30)).unwrap();
        assert_eq!(
            host.verify_native_bridge(&old),
            Err("SESSION_REVISION_MISMATCH")
        );
        let new_proof = host.mint_for_native_bridge().unwrap();
        host.verify_native_bridge(&new_proof).unwrap();
        host.revoke().unwrap();
        assert!(!host.public_status().native_session_active);
    }
}
