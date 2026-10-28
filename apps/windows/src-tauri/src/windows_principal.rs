//! OS-bound process identity, never sourced from the renderer, Origin or HTTP.
//! Windows token/SID and AuthenticationId establish a local logon binding,
//! NOT authorization to any external service or proof of app-code integrity.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct WindowsPrincipal {
    pub sid: Vec<u8>,
    pub logon_low: u32,
    pub logon_high: i32,
    pub process_id: u32,
}

#[cfg(windows)]
pub(crate) fn current_windows_principal() -> Result<WindowsPrincipal, &'static str> {
    use std::{
        ffi::c_void,
        mem::size_of,
        ptr::{null_mut, read_unaligned},
    };
    use windows_sys::Win32::{
        Foundation::{CloseHandle, HANDLE},
        Security::{
            GetLengthSid, GetTokenInformation, IsValidSid, TokenStatistics, TokenUser, TOKEN_QUERY,
            TOKEN_STATISTICS, TOKEN_USER,
        },
        System::Threading::{GetCurrentProcess, GetCurrentProcessId, OpenProcessToken},
    };
    unsafe {
        let mut handle: HANDLE = null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut handle) == 0 {
            return Err("OPEN_PROCESS_TOKEN_FAILED");
        }
        struct Guard(HANDLE);
        impl Drop for Guard {
            fn drop(&mut self) {
                unsafe {
                    CloseHandle(self.0);
                }
            }
        }
        let _guard = Guard(handle);
        fn token_data(handle: HANDLE, kind: i32) -> Result<Vec<u8>, &'static str> {
            let mut needed = 0u32;
            unsafe {
                GetTokenInformation(handle, kind, null_mut(), 0, &mut needed);
            }
            if needed == 0 || needed > 65_536 {
                return Err("TOKEN_INFORMATION_SIZE_INVALID");
            }
            let mut data = vec![0u8; needed as usize];
            let success = unsafe {
                GetTokenInformation(
                    handle,
                    kind,
                    data.as_mut_ptr().cast::<c_void>(),
                    needed,
                    &mut needed,
                )
            };
            if success == 0 {
                return Err("GET_TOKEN_INFORMATION_FAILED");
            }
            Ok(data)
        }
        let user_data = token_data(handle, TokenUser)?;
        if user_data.len() < size_of::<TOKEN_USER>() {
            return Err("TOKEN_USER_TOO_SMALL");
        }
        let user = read_unaligned(user_data.as_ptr().cast::<TOKEN_USER>());
        let sid_ptr = user.User.Sid;
        if sid_ptr.is_null() || IsValidSid(sid_ptr) == 0 {
            return Err("INVALID_OS_SID");
        }
        let sid_len = GetLengthSid(sid_ptr) as usize;
        if sid_len == 0 || sid_len > 1024 {
            return Err("INVALID_OS_SID_LENGTH");
        }
        let sid = std::slice::from_raw_parts(sid_ptr.cast::<u8>(), sid_len).to_vec();
        let statistics_data = token_data(handle, TokenStatistics)?;
        if statistics_data.len() < size_of::<TOKEN_STATISTICS>() {
            return Err("TOKEN_STATISTICS_TOO_SMALL");
        }
        let stats = read_unaligned(statistics_data.as_ptr().cast::<TOKEN_STATISTICS>());
        Ok(WindowsPrincipal {
            sid,
            logon_low: stats.AuthenticationId.LowPart,
            logon_high: stats.AuthenticationId.HighPart,
            process_id: GetCurrentProcessId(),
        })
    }
}
#[cfg(not(windows))]
pub(crate) fn current_windows_principal() -> Result<WindowsPrincipal, &'static str> {
    Err("WINDOWS_NATIVE_ONLY")
}
