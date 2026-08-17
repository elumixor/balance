//! The Dock icon: today's date, drawn as the app sits there.
//!
//! Nothing is drawn in Rust. The webview owns the type, the palette and what day it is, so it
//! paints the tile on a canvas and hands the PNG down — the same split [`crate::tray`] uses, for
//! the same reason: one place decides how Balance looks.
//!
//! The change is process-local. It never touches the `.app` on disk, so there is nothing to undo
//! on quit and nothing to reset — but it also has to be pushed again on every launch, or the Dock
//! serves the bundle's own icon.

#[cfg(target_os = "macos")]
mod imp {
    use objc2::{AnyThread, MainThreadMarker};
    use objc2_app_kit::{NSApplication, NSImage};
    use objc2_foundation::{NSData, NSSize};

    /// Points, not pixels. macOS reads the size as the image's *point* size, so an oversized PNG
    /// declared this small becomes a high-density representation and stays sharp at every Dock
    /// magnification — there is no `@2x` to ship here.
    const ICON_POINTS: f64 = 128.0;

    pub fn set_icon(png: &[u8]) -> Result<(), String> {
        let mtm = MainThreadMarker::new().ok_or("the Dock can only be drawn on the main thread")?;
        let data = NSData::with_bytes(png);
        let image = NSImage::initWithData(NSImage::alloc(), &data).ok_or("that isn't a readable image")?;
        image.setSize(NSSize::new(ICON_POINTS, ICON_POINTS));
        // Safe in practice — the binding is unsafe only because it can't prove nil is allowed.
        unsafe { NSApplication::sharedApplication(mtm).setApplicationIconImage(Some(&image)) };
        Ok(())
    }
}

/// Pushed by the webview when the app opens and whenever the day turns.
///
/// AppKit is main-thread-only and a command runs on a worker, so the work hops over and the answer
/// is waited for: a Dock left showing yesterday should say so rather than fail quietly.
#[tauri::command]
pub fn set_dock_icon(app: tauri::AppHandle, png: Vec<u8>) -> Result<(), String> {
    let _ = (&app, &png);
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            let _ = tx.send(imp::set_icon(&png));
        })
        .map_err(|e| e.to_string())?;
        return rx.recv().map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    Ok(())
}
