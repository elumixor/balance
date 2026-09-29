//! The reminder card: a small window that floats in the corner when something is about to start.
//!
//! macOS notifications can't carry buttons — no Join, no route, no snooze — and a reminder whose
//! whole point is "here is the link, and here is how long the bus takes" is useless without them.
//! So the card is a second webview of the app's own `/reminder` route, and everything it shows
//! arrives in the URL: the window that computed the reminder already knows the answer, and a
//! second webview asking the server again would be a second, slower copy of it.
//!
//! It floats above other windows and follows you across Spaces, and it is a notification, not a
//! window of Balance: a non-activating `NSPanel` that can never become key. A click on Join or
//! the cross lands on the button it was aimed at, the first time, without Balance becoming the
//! active app — which is what used to bring the hidden main window forward and swallow the first
//! click as "activate", so every button had to be pressed twice.

use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};

pub const WINDOW_LABEL: &str = "reminder";

/// Big enough for a title, a time and a row of buttons; the card measures itself once it has
/// drawn and asks for the height it actually needs.
const SIZE: (f64, f64) = (380.0, 200.0);
/// The gap to the screen's corner, in points — the same breathing room a notification leaves.
const MARGIN: f64 = 16.0;

#[cfg(target_os = "macos")]
tauri_nspanel::tauri_panel! {
    panel!(ReminderPanel {
        config: {
            can_become_key_window: false,
            can_become_main_window: false,
            is_floating_panel: true
        }
    })
}

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
        present(&app, &window)?;
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
    // The window is never key, so without this WebKit would spend the first click on nothing.
    .accept_first_mouse(true)
    .visible_on_all_workspaces(true)
    .build()
    .map_err(|e| e.to_string())?;

    place(&app, &window);
    float(&app, &window)
}

/// Dismissed, or acted on. Destroyed rather than closed: the app turns a close request into a
/// hide so the main window survives, and a hidden card would come back showing a stale reminder.
#[tauri::command]
pub fn close_reminder(app: AppHandle) -> Result<(), String> {
    app.clone()
        .run_on_main_thread(move || {
            if let Some(window) = as_window(&app) {
                let _ = window.destroy();
            }
        })
        .map_err(|e| e.to_string())
}

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

/// Makes the window a panel that never activates the app, and shows it.
///
/// Tauri's always-on-top is only the floating level, which sits under a full-screen app — the one
/// place a reminder matters most. Raised to the level the menu bar's own status windows use, and
/// told it may join every Space, including a full-screen one. `NonactivatingPanel` is the part
/// that keeps a click on the card from making Balance the active app.
#[cfg(target_os = "macos")]
fn float(app: &AppHandle, window: &tauri::WebviewWindow) -> Result<(), String> {
    use tauri_nspanel::{objc2_app_kit, WebviewWindowExt};

    track_pointer(window)?;
    let window = window.clone();
    app.run_on_main_thread(move || {
        let Ok(panel) = window.to_panel::<ReminderPanel>() else {
            return;
        };
        let _ = panel.add_style_mask(objc2_app_kit::NSWindowStyleMask::NonactivatingPanel);
        panel.set_level(objc2_app_kit::NSStatusWindowLevel as i64);
        panel.set_collection_behavior(
            objc2_app_kit::NSWindowCollectionBehavior::CanJoinAllSpaces
                | objc2_app_kit::NSWindowCollectionBehavior::FullScreenAuxiliary
                | objc2_app_kit::NSWindowCollectionBehavior::Stationary,
        );
        panel.show();
    })
    .map_err(|e| e.to_string())
}

/// Hover states on a card that is never key.
///
/// WebKit only follows the pointer inside the key window (`NSTrackingActiveInKeyWindow`, see
/// `trackingAreaOptions` in WebKit's `WebViewImpl.mm`), and this panel never is one, so nothing on
/// it ever lit up under the mouse. A second tracking area on the web view itself, active always,
/// hands it the same moved/entered/exited events its own would — added once, since the card is
/// one window reused, and following the view's size on its own (`InVisibleRect`).
#[cfg(target_os = "macos")]
fn track_pointer(window: &tauri::WebviewWindow) -> Result<(), String> {
    window
        .with_webview(|webview| {
            use objc2::AnyThread;
            use objc2_app_kit::{NSTrackingArea, NSTrackingAreaOptions, NSView};
            use objc2_foundation::NSRect;

            // Safe: `inner` is the window's live `WKWebView`, and this closure runs on the main
            // thread while the window holds it.
            let view = unsafe { &*webview.inner().cast::<NSView>() };
            let options = NSTrackingAreaOptions::MouseEnteredAndExited
                | NSTrackingAreaOptions::MouseMoved
                | NSTrackingAreaOptions::ActiveAlways
                | NSTrackingAreaOptions::InVisibleRect;
            // The owner isn't retained; the view owns the area, so it outlives neither.
            let area = unsafe {
                NSTrackingArea::initWithRect_options_owner_userInfo(
                    NSTrackingArea::alloc(),
                    NSRect::ZERO,
                    options,
                    Some(view),
                    None,
                )
            };
            view.addTrackingArea(&area);
        })
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "macos"))]
fn float(_app: &AppHandle, window: &tauri::WebviewWindow) -> Result<(), String> {
    window.show().map_err(|e| e.to_string())
}

/// Brought to the front without being made key — `orderFrontRegardless`, the way a notification
/// banner appears over whatever is being worked on.
#[cfg(target_os = "macos")]
fn present(app: &AppHandle, window: &tauri::WebviewWindow) -> Result<(), String> {
    use tauri_nspanel::ManagerExt;

    let Ok(panel) = app.get_webview_panel(WINDOW_LABEL) else {
        return window.show().map_err(|e| e.to_string());
    };
    app.run_on_main_thread(move || panel.show())
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "macos"))]
fn present(_app: &AppHandle, window: &tauri::WebviewWindow) -> Result<(), String> {
    window.show().map_err(|e| e.to_string())
}

/// The card as a Tauri window again, so Tauri's own teardown owns what it built. The panel is
/// only ever a costume over Tauri's window, and destroying it while it is still wearing one is
/// two owners releasing the same object.
#[cfg(target_os = "macos")]
fn as_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    use tauri_nspanel::ManagerExt;

    match app.get_webview_panel(WINDOW_LABEL) {
        Ok(panel) => panel.to_window(),
        Err(_) => app.get_webview_window(WINDOW_LABEL),
    }
}

#[cfg(not(target_os = "macos"))]
fn as_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    app.get_webview_window(WINDOW_LABEL)
}
