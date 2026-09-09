//! The menu bar as a background agent, rather than something somebody has to open.
//!
//! What is in the menu bar, the Dock icon and the reminders all run inside the app's own process,
//! so "is Balance running" is the whole of whether they exist. A login item that only ran at login
//! is not enough: a crash, or a Mac woken from a login that failed, leaves the menu bar empty
//! until the person notices and opens the app — which is exactly the moment they were relying on
//! being told something.
//!
//! So the agent is a `launchd` job of our own rather than the autostart plugin's: same `RunAtLoad`,
//! plus `KeepAlive` for an exit that wasn't asked for. Quitting from the tray is a clean exit and
//! stays quit; a crash comes back. It is always launched with `--hidden`, so nothing appears on
//! screen for a start nobody asked for.

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

/// The job's name, and the plist's. The bundle id, so nothing else can collide with it.
const LABEL: &str = "com.elumixor.balance.desktop";

/// What `tauri-plugin-autostart` wrote before this existed. Removed wherever this writes, or a
/// login would start Balance twice — once from each job — and the second would exit into the
/// first's single-instance guard.
const LEGACY_LABEL: &str = "Balance";

fn agents_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "no home directory".to_string())?;
    let dir = PathBuf::from(home).join("Library/LaunchAgents");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn plist_path(label: &str) -> Result<PathBuf, String> {
    Ok(agents_dir()?.join(format!("{label}.plist")))
}

fn plist(program: &str) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>{LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>{program}</string>
    <string>{flag}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
</dict>
</plist>
"#,
        LABEL = LABEL,
        program = program,
        flag = crate::HIDDEN_FLAG,
    )
}

/// Where the running app is, as the job has to name it: an app moved out of the Downloads folder
/// and into Applications is a different path, and a job pointing at the old one starts nothing.
///
/// The executable is inside the bundle (`Balance.app/Contents/MacOS/Balance`), which is what
/// `launchd` wants — a `.app` directory is for `open`, not for a job.
fn program() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    exe.to_str()
        .map(str::to_owned)
        .ok_or_else(|| "the app's path isn't text".to_string())
}

fn launchctl(args: &[&str]) {
    let _ = std::process::Command::new("/bin/launchctl")
        .args(args)
        .output();
}

fn domain() -> String {
    format!("gui/{}", unsafe { libc::getuid() })
}

fn unload(label: &str) {
    launchctl(&["bootout", &format!("{}/{label}", domain())]);
}

/// Writes the job and hands it to `launchd` now, so it is running before the next login too.
pub fn enable() -> Result<(), String> {
    let path = plist_path(LABEL)?;
    std::fs::write(&path, plist(&program()?)).map_err(|e| e.to_string())?;

    // Anything already registered under either name is replaced rather than left beside this.
    unload(LEGACY_LABEL);
    let _ = std::fs::remove_file(plist_path(LEGACY_LABEL)?);
    unload(LABEL);
    launchctl(&[
        "bootstrap",
        &domain(),
        path.to_str().ok_or("the job's path isn't text")?,
    ]);
    Ok(())
}

pub fn disable() -> Result<(), String> {
    unload(LABEL);
    unload(LEGACY_LABEL);
    for label in [LABEL, LEGACY_LABEL] {
        match std::fs::remove_file(plist_path(label)?) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(())
}

pub fn enabled() -> bool {
    plist_path(LABEL).is_ok_and(|path| path.exists())
}

#[tauri::command]
pub fn login_item_enabled() -> bool {
    enabled()
}

#[tauri::command]
pub fn set_login_item(app: AppHandle, enabled: bool) -> Result<(), String> {
    remember_choice(&app, enabled);
    if enabled {
        enable()
    } else {
        disable()
    }
}

/// Registered on the first launch, and refreshed on every one after it: the job names the app's
/// path, and an app that has been moved — or replaced by the bundle the updater wrote — has to be
/// pointed at again. A person who has switched it off in settings stays switched off.
pub fn register(app: &AppHandle) {
    if cfg!(dev) {
        return;
    }
    if chose_off(app) {
        return;
    }
    if let Err(e) = enable() {
        log::warn!("couldn't register the login item: {e}");
    }
}

/// Left behind when the switch in settings is turned off, so the next launch doesn't put the job
/// back under somebody who has said they don't want it.
fn opted_out_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("login-item-off"))
}

fn chose_off(app: &AppHandle) -> bool {
    opted_out_path(app).is_ok_and(|path| path.exists())
}

fn remember_choice(app: &AppHandle, enabled_now: bool) {
    let Ok(path) = opted_out_path(app) else {
        return;
    };
    if enabled_now {
        let _ = std::fs::remove_file(path);
    } else {
        let _ = std::fs::write(path, b"");
    }
}
