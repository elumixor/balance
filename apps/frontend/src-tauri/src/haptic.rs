//! A tick under the finger, for a pointer that has just landed on something pressable.
//!
//! The Force Touch trackpad plays it only while a finger is on it, and plays nothing on a mouse,
//! so asking for one costs nothing when there is nobody to feel it.

#[tauri::command]
pub fn perform_haptic(app: tauri::AppHandle) -> Result<(), String> {
    let _ = &app;
    #[cfg(target_os = "macos")]
    app.run_on_main_thread(|| {
        use objc2_app_kit::{
            NSHapticFeedbackManager, NSHapticFeedbackPattern, NSHapticFeedbackPerformanceTime,
            NSHapticFeedbackPerformer,
        };
        NSHapticFeedbackManager::defaultPerformer().performFeedbackPattern_performanceTime(
            NSHapticFeedbackPattern::Alignment,
            NSHapticFeedbackPerformanceTime::Now,
        );
    })
    .map_err(|e| e.to_string())?;
    Ok(())
}
