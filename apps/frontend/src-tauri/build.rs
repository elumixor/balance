fn main() {
  // The window is loaded over HTTP rather than Tauri's own protocol (see PORT in src/lib.rs),
  // which makes it a *remote* origin to the ACL — and remote origins are refused every command
  // the app defines itself unless the app declares them here and a capability allows them.
  // Without this the menu bar silently never updates in a built app.
  tauri_build::try_build(
    tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
      "update_tray",
      "set_dock_icon",
      "show_reminder",
      "close_reminder",
      "resize_reminder",
      "open_window",
    ])),
  )
  .expect("failed to run tauri-build")
}
