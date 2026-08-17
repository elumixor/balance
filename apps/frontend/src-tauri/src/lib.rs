mod dock;
mod reminder;
mod tray;

use std::time::Duration;

use tauri::{
    tray::TrayIconBuilder, AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder,
    WindowEvent,
};

/// Matches `TICK_MS`/`REFRESH_MS` in `src/lib/desktop/agenda.svelte.ts` — the recompute cadence
/// and how often the weeks behind it are re-checked against the calendar.
const AGENDA_TICK: Duration = Duration::from_secs(30);
const AGENDA_REFRESH: Duration = Duration::from_secs(5 * 60);

/// Emitted on a native timer so the menu bar's clock keeps moving whether or not a window is on
/// screen. `setInterval` in the webview gets throttled by WebKit once its window is hidden — which
/// is every waking minute, for a menu-bar app — so the tick has to come from outside it.
fn spawn_agenda_ticks(app: &AppHandle) {
    let tick_app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(AGENDA_TICK);
        interval.tick().await; // fires immediately; the webview already computes its own first frame
        loop {
            interval.tick().await;
            let _ = tick_app.emit("agenda://tick", ());
        }
    });

    let refresh_app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(AGENDA_REFRESH);
        interval.tick().await;
        loop {
            interval.tick().await;
            let _ = refresh_app.emit("agenda://refresh", ());
        }
    });
}

/// The app is served over HTTP from here rather than through Tauri's `tauri://` custom protocol.
///
/// Clerk keeps the signed-in client in a cookie, and WebKit gives a custom scheme no cookie jar at
/// all — which is why the app asked for a password on every launch. An origin the browser
/// recognises gets normal storage rules, and the session survives a restart like it does anywhere
/// else. Clerk's redirect URLs become valid `http://` ones for the same reason.
///
/// Fixed, not picked at random: cookies belong to an origin, and an origin includes its port. A
/// port that moved between launches would lose the session it was chosen to keep.
const PORT: u16 = 8123;

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

/// A path in the app, as the origin every window is loaded from.
///
/// In development the Vite server is already a real origin, so it plays the part the localhost
/// server plays in a release build — same storage rules, same redirect URLs, no second case.
pub fn app_url(path: &str) -> String {
    let origin = if cfg!(dev) {
        "http://localhost:8081".to_string()
    } else {
        format!("http://localhost:{PORT}")
    };
    format!("{origin}{path}")
}

/// Anything the app throws before it has any of its own code running to catch it.
///
/// A packaged build has no devtools attached, so a webview that fails to boot shows a blank window
/// and says nothing anywhere. This runs before the app's own bundle does, which is the only way to
/// hear about the failures that stop that bundle from loading at all.
const REPORT_ERRORS: &str = r#"
(() => {
  const send = (message) => {
    try {
      window.__TAURI_INTERNALS__?.invoke("plugin:log|log", { level: 5, message });
    } catch {}
  };
  window.addEventListener("error", (e) =>
    send(`webview error: ${e.message} (${e.filename}:${e.lineno}:${e.colno})`),
  );
  window.addEventListener("unhandledrejection", (e) => send(`webview rejection: ${e.reason}`));
})();
"#;

fn build_main_window(app: &AppHandle) -> tauri::Result<()> {
    let url = app_url("/").parse().expect("the window URL is built from a constant port");

    let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
        .title("Balance")
        .inner_size(1180.0, 800.0)
        // Below this the side rail collapses, and the window buttons would land on the calendar.
        .min_inner_size(820.0, 520.0)
        .resizable(true)
        .initialization_script(REPORT_ERRORS)
        .center();

    // No title bar of its own: the rail runs to the top of the window and the window buttons sit
    // on it. `apps/frontend/src/lib/components/nav/SideNav.svelte` keeps that strip clear.
    #[cfg(target_os = "macos")]
    let window = window
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);

    window.build()?;
    Ok(())
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
        .plugin(tauri_plugin_localhost::Builder::new(PORT).build())
        .plugin(tauri_plugin_opener::init())
        // `balance-desktop://auth?ticket=…`, sent back by the browser that did the OAuth. The webview
        // listens for it and redeems it; all this side has to do is be there to receive it.
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            tray::update_tray,
            dock::set_dock_icon,
            reminder::show_reminder,
            reminder::close_reminder,
            reminder::resize_reminder,
            open_window
        ])
        .setup(|app| {
            // Built here rather than declared in `tauri.conf.json`: a window defined there is
            // opened on the custom protocol before the localhost server is up to serve it.
            build_main_window(app.handle())?;
            spawn_agenda_ticks(app.handle());

            // Registered in a release build too, and at a level the webview can reach through
            // `@tauri-apps/plugin-log`. Everything the desktop half does happens on a screen
            // nobody is looking at — a menu bar that quietly stopped updating used to leave no
            // trace anywhere, which is most of why it went unnoticed for so long.
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(if cfg!(debug_assertions) {
                        log::LevelFilter::Info
                    } else {
                        log::LevelFilter::Warn
                    })
                    .build(),
            )?;

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
                        if let Some(url) = id.strip_prefix("join:") {
                            use tauri_plugin_opener::OpenerExt;
                            let _ = app.opener().open_url(url, None::<&str>);
                        } else if let Some(event_id) = id.strip_prefix("event:") {
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
        } if label == "main" => {
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
