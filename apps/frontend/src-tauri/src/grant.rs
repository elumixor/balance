//! Where the Mac keeps its standing permission to sign itself back in.
//!
//! iOS holds the device grant in Capacitor Preferences, which outlives the webview's own storage.
//! The desktop shell has no such store: everything the webview writes lives in WebKit's data store
//! for `http://localhost:8123`, which does not survive every launch — so the app opened on a
//! sign-in screen, and a login-item launch with no window had no session for the menu bar to draw.
//! A file in the app's data directory is the one place here that nothing prunes.
//!
//! It is a secret, so it is written 0600 and never logged.

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

const FILE: &str = "device-grant";

fn path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(FILE))
}

/// The grant this device holds, or `None` when it has never been signed in or has signed out.
#[tauri::command]
pub fn read_device_grant(app: AppHandle) -> Result<Option<String>, String> {
    let file = path(&app)?;
    match std::fs::read_to_string(&file) {
        Ok(token) => Ok(Some(token).filter(|token| !token.is_empty())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn write_device_grant(app: AppHandle, token: String) -> Result<(), String> {
    let file = path(&app)?;
    std::fs::write(&file, token.as_bytes()).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

#[tauri::command]
pub fn clear_device_grant(app: AppHandle) -> Result<(), String> {
    match std::fs::remove_file(path(&app)?) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
