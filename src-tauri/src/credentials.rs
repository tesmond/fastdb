use std::ptr;
use windows::core::{PCWSTR, PWSTR};
use windows::Win32::Foundation::*;
use windows::Win32::Security::Credentials::*;

pub fn store_password(
    target: &str,
    username: &str,
    password: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let target_wide: Vec<u16> = target.encode_utf16().chain(std::iter::once(0)).collect();
    let username_wide: Vec<u16> = username.encode_utf16().chain(std::iter::once(0)).collect();
    let password_wide: Vec<u16> = password.encode_utf16().chain(std::iter::once(0)).collect();

    let mut credential = CREDENTIALW {
        Flags: CRED_FLAGS(0),
        Type: CRED_TYPE_GENERIC,
        TargetName: PWSTR::from_raw(target_wide.as_ptr() as *mut u16),
        Comment: PWSTR::null(),
        LastWritten: FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        },
        CredentialBlobSize: (password_wide.len() * 2) as u32,
        CredentialBlob: password_wide.as_ptr() as *mut u8,
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        AttributeCount: 0,
        Attributes: ptr::null_mut(),
        TargetAlias: PWSTR::null(),
        UserName: PWSTR::from_raw(username_wide.as_ptr() as *mut u16),
    };

    unsafe {
        CredWriteW(&mut credential, 0).map_err(|e| format!("Failed to write credential: {}", e))?;
    }
    Ok(())
}

pub fn retrieve_password(target: &str) -> Result<String, Box<dyn std::error::Error>> {
    let target_wide: Vec<u16> = target.encode_utf16().chain(std::iter::once(0)).collect();
    let mut credential: *mut CREDENTIALW = ptr::null_mut();

    unsafe {
        CredReadW(
            PCWSTR::from_raw(target_wide.as_ptr()),
            CRED_TYPE_GENERIC,
            0,
            &mut credential,
        )
        .map_err(|e| format!("Failed to read credential: {}", e))?;

        if credential.is_null() {
            return Err("Credential not found".into());
        }

        let cred = &*credential;
        let password_len = cred.CredentialBlobSize as usize / 2;
        let password_slice =
            std::slice::from_raw_parts(cred.CredentialBlob as *const u16, password_len);
        let password = String::from_utf16_lossy(password_slice);
        CredFree(credential as *mut _);
        Ok(password)
    }
}

pub fn delete_password(target: &str) -> Result<(), Box<dyn std::error::Error>> {
    let target_wide: Vec<u16> = target.encode_utf16().chain(std::iter::once(0)).collect();

    unsafe {
        CredDeleteW(
            PCWSTR::from_raw(target_wide.as_ptr()),
            CRED_TYPE_GENERIC,
            0,
        )
        .map_err(|e| format!("Failed to delete credential: {}", e))?;
    }
    Ok(())
}
