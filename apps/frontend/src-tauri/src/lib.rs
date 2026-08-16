mod tray;

use tauri::{
    tray::TrayIconBuilder, AppHandle, Emitter, Manager, RunEvent, WindowEvent,
};

/// Brings the window back without making a new one. The webview holds the Clerk session and the
/// calendar cache the menu bar is drawn from, so it is never destroyed — only hidden.
fn show_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

#[tauri::command]
fn open_window(app: AppHandle) {
    show_window(&app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Has to come before every other plugin, and matters more than politeness here: a second
    // launch would otherwise put a second item in the menu bar.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_window(app);
        }));
    }

    let app = builder
        .plugin(tauri_plugin_opener::init())
        // `balance-desktop://auth?ticket=…`, sent back by the browser that did the OAuth. The webview
        // listens for it and redeems it; all this side has to do is be there to receive it.
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![tray::update_tray, open_window])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // A ticket arriving while the window is hidden should bring it forward — signing in
            // and being left staring at the browser you just came from is nobody's idea of done.
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let handle = app.handle().clone();
                app.deep_link().on_open_url(move |_| show_window(&handle));
            }

            TrayIconBuilder::with_id(tray::TRAY_ID)
                .icon(tray::initial_icon())
                .tooltip("Balance")
                .menu(&tray::build_menu(app.handle(), &Default::default())?)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "quit" => app.exit(0),
                    "open" => show_window(app),
                    "refresh" => {
                        let _ = app.emit(tray::REFRESH_EVENT, ());
                    }
                    id => {
                        if let Some(event_id) = id.strip_prefix("event:") {
                            let _ = app.emit(tray::OPEN_EVENT, event_id);
                            show_window(app);
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| match event {
        // Closing the window hides it. Destroying it would take the session and the week's events
        // with it — the menu bar would go blank, and reopening would mean a cold start.
        RunEvent::WindowEvent {
            event: WindowEvent::CloseRequested { api, .. },
            label,
            ..
        } => {
            api.prevent_close();
            if let Some(window) = app.get_webview_window(&label) {
                let _ = window.hide();
            }
        }
        // The dock icon, clicked while the window is hidden.
        #[cfg(target_os = "macos")]
        RunEvent::Reopen {
            has_visible_windows,
            ..
        } => {
            if !has_visible_windows {
                show_window(app);
            }
        }
        _ => {}
    });
}
