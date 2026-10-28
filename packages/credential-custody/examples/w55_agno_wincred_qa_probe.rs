//! DEBUG-ONLY synthetic WinCred -> existing W47 private stdio -> original W43 Agno.
//! Fixed QA namespace cannot address any real W54 installation. NOT product code.
#[cfg(not(debug_assertions))]
fn main() {
    // Even if CI compiles all Cargo examples in Release, the QA fixture
    // cannot initialize or access a Windows credential.
    std::process::exit(3)
}

#[cfg(debug_assertions)]
use std::{
    env,
    io::{self, Write},
    process,
};
#[cfg(debug_assertions)]
use yance_w55_fake_credential_custody::{
    cloud_keys::{CloudProvider, NativeKeyCustody, NativeScope},
    VaultError,
};
#[cfg(debug_assertions)]
fn deny() -> ! {
    process::exit(3)
}
#[cfg(debug_assertions)]
fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() != 3 {
        deny()
    }
    let provider = match args[2].as_str() {
        "OPENROUTER" => CloudProvider::OpenRouter,
        "OPENAI_API" => CloudProvider::OpenAi,
        _ => deny(),
    };
    // Hardcoded unreal installation and unreal Windows principal ref.
    // NEVER accept dynamic scope from arguments, user files, env or HTTP.
    let scope = NativeScope::from_w54_native_only(
        &format!("w54i_{}", "c".repeat(64)),
        &format!("w54u_{}", "d".repeat(64)),
    )
    .unwrap_or_else(|_| deny());
    let vault = NativeKeyCustody::from_native_host(scope, || Ok(())).unwrap_or_else(|_| deny());
    let material = match provider {
        CloudProvider::OpenRouter => concat!("sk-", "or-v1-", "W55-NOT-REAL-ONLY-FAKE-AGNO-QA"),
        CloudProvider::OpenAi => concat!("sk-", "proj-", "W55-NOT-REAL-ONLY-FAKE-AGNO-QA"),
    };
    let result = match args[1].as_str() {
        "seed" => match vault.status(provider) {
            Err(VaultError::Missing) => vault.enroll(provider, material.as_bytes()),
            Ok(s) if s.revoked => {
                vault.re_enroll_revoked(provider, s.revision, material.as_bytes())
            }
            Ok(s) => vault.rotate(provider, s.revision, material.as_bytes()),
            _ => Err(VaultError::Denied),
        }
        .map(|_| ()),
        "lease" => {
            let s = vault.status(provider).unwrap_or_else(|_| deny());
            if !s.configured || s.revoked {
                deny()
            }
            vault.with_native_key(provider, s.revision, |bytes| {
                io::stdout()
                    .write_all(bytes)
                    .map_err(|_| VaultError::OsUnavailable)?;
                io::stdout()
                    .flush()
                    .map_err(|_| VaultError::OsUnavailable)?;
                Ok(())
            })
        }
        "revoke" => {
            let s = vault.status(provider).unwrap_or_else(|_| deny());
            if !s.configured || s.revoked {
                deny()
            }
            vault.revoke(provider, s.revision).map(|_| ())
        }
        _ => Err(VaultError::Denied),
    };
    if result.is_err() {
        deny()
    }
}
