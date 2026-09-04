//! The reminder card: a small window that floats in the corner when something is about to start.
//!
//! macOS notifications can't carry buttons — no Join, no route, no snooze — and a reminder whose
//! whole point is "here is the link, and here is how long the bus takes" is useless without them.
//! So the card is a second webview of the app's own `/reminder` route, and everything it shows
//! arrives in the URL: the window that computed the reminder already knows the answer, and a
//! second webview asking the server again would be a second, slower copy of it.
//!
//! It floats above other windows and follows you across Spaces, and it never takes the keyboard:
//! the card can't become the key window, so pressing Join or the cross is a click on a notification,
//! not a switch to Balance. Bringing the app forward after the card is gone was how the main window
//! used to reappear on a dismiss — AppKit hands key status to the next window it can find, and a
//! hidden window will do.

use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};

pub const WINDOW_LABEL: &str = "reminder";

/// Big enough for a title, a time and a row of buttons; the card measures itself once it has
/// drawn and asks for the height it actually needs.
const SIZE: (f64, f64) = (380.0, 200.0);
/// The gap to the screen's corner, in points — the same breathing room a notification leaves.
const MARGIN: f64 = 16.0;

/// Shows the card, replacing whatever it was showing before.
///
/// `payload` is the encoded reminder, passed straight through to the route. One window, reused:
/// two reminders a minute apart shouldn't stack up two webviews, and the second is the one worth
/// looking at anyway.
#[tauri::command]
pub fn show_reminder(app: AppHandle, payload: String) -> Result<(), String> {
    let url = crate::app_url(&format!("/reminder?r={payload}"));

    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        window
            .navigate(url.parse().map_err(|_| "bad reminder URL")?)
            .map_err(|e| e.to_string())?;
        place(&app, &window);
        window.show().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(
        &app,
        WINDOW_LABEL,
        WebviewUrl::External(url.parse().map_err(|_| "bad reminder URL")?),
    )
    .title("Reminder")
    .inner_size(SIZE.0, SIZE.1)
    .decorations(false)
    .resizable(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .shadow(true)
    // The card draws its own rounded panel, so the window behind it is nothing at all.
    .transparent(true)
    // Shown by hand once it's in the corner: built visible, it flashes in the middle of the
    // screen first. And never focused — a reminder that steals the keyboard mid-sentence is worse
    // than the thing it's reminding you of.
    .visible(false)
    .focused(false)
    .focusable(false)
    .visible_on_all_workspaces(true)
    .build()
    .map_err(|e| e.to_string())?;

    place(&app, &window);
    float(&window);
    window.show().map_err(|e| e.to_string())?;
    Ok(())
}

/// Dismissed, or acted on. Destroyed rather than closed: the app turns a close request into a
/// hide so the main window survives, and a hidden card would come back showing a stale reminder.
///
/// Clicking the card made Balance the active app, and with the card gone there is nothing of
/// Balance left to look at — so the activation goes back to whatever was being worked on, the
/// same way a notification banner leaves things.
#[tauri::command]
pub fn close_reminder(app: AppHandle) -> Result<(), String> {
    let main_visible = app
        .get_webview_window("main")
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false);
    if !main_visible {
        deactivate(&app);
    }
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        window.destroy().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn deactivate(app: &AppHandle) {
    let _ = app.run_on_main_thread(|| {
        use objc2_app_kit::NSApplication;
        let Some(mtm) = objc2::MainThreadMarker::new() else {
            return;
        };
        NSApplication::sharedApplication(mtm).deactivate();
    });
}

#[cfg(not(target_os = "macos"))]
fn deactivate(_app: &AppHandle) {}

/// The card asks for the height its content came out at — see `src/routes/reminder/+page.svelte`.
#[tauri::command]
pub fn resize_reminder(app: AppHandle, height: f64) -> Result<(), String> {
    let Some(window) = app.get_webview_window(WINDOW_LABEL) else {
        return Ok(());
    };
    window
        .set_size(tauri::LogicalSize::new(SIZE.0, height.clamp(80.0, 640.0)))
        .map_err(|e| e.to_string())?;
    place(&app, &window);
    Ok(())
}

/// Top-right of the screen you're working on, below the menu bar — where macOS puts its own.
fn place(app: &AppHandle, window: &tauri::WebviewWindow) {
    let Ok(Some(monitor)) = app.primary_monitor() else {
        return;
    };
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    let width = window
        .outer_size()
        .map(|size| size.width as i32)
        .unwrap_or((SIZE.0 * scale) as i32);
    let margin = (MARGIN * scale) as i32;
    let x = area.position.x + area.size.width as i32 - width - margin;
    let y = area.position.y + margin;
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

/// Tauri's always-on-top is only the floating level, which sits under a full-screen app — the one
/// place a reminder matters most. Raised to the level the menu bar's own status windows use, and
/// told it may join every Space, including a full-screen one.
#[cfg(target_os = "macos")]
fn float(window: &tauri::WebviewWindow) {
    use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};

    let window = window.clone();
    let _ = window.clone().run_on_main_thread(move || {
        let Ok(handle) = window.ns_window() else {
            return;
        };
        // Tauri hands out the `NSWindow` as an opaque pointer, and it is only sound to look at
        // from here — the main thread, while the window it belongs to is still alive.
        let ns_window: &NSWindow = unsafe { &*handle.cast::<NSWindow>() };
        ns_window.setLevel(objc2_app_kit::NSStatusWindowLevel);
        ns_window.setCollectionBehavior(
            NSWindowCollectionBehavior::CanJoinAllSpaces
                | NSWindowCollectionBehavior::FullScreenAuxiliary
                | NSWindowCollectionBehavior::Stationary,
        );
    });
}

#[cfg(not(target_os = "macos"))]
fn float(_window: &tauri::WebviewWindow) {}
