//! The menu bar item: what Balance shows about your day when the window isn't open.
//!
//! Nothing here fetches. The webview owns the Clerk session and the calendar cache, so it is the
//! only thing that can say what the next hour holds — it pushes a whole [`TrayState`] through
//! [`update_tray`] whenever that answer changes, and this module renders it. That keeps one source
//! of truth for "what counts as what" instead of a second, half-informed one written in Rust.

use serde::Deserialize;
use tauri::{
    image::Image,
    menu::{IconMenuItem, IsMenuItem, Menu, MenuItem, PredefinedMenuItem},
    AppHandle, Wry,
};

pub const TRAY_ID: &str = "balance";

/// Emitted when a row in the tray menu is chosen, carrying the event's id.
pub const OPEN_EVENT: &str = "tray://open-event";
/// Emitted when the menu's Refresh is chosen.
pub const REFRESH_EVENT: &str = "tray://refresh";

/// macOS never truncates a status item — it grows until the bar runs out of room and then stops
/// drawing the item altogether. So the title arrives already shortened, and this is the backstop.
const MAX_TITLE_CHARS: usize = 34;

/// The bar drawn left of the title. 18 points tall once macOS scales it, so the pixels only set
/// the aspect ratio and how smooth the ends look.
const TRAY_BAR: (u32, u32) = (12, 44);

const NEUTRAL: [u8; 3] = [0x8A, 0x90, 0x97];

/// A Lucide glyph, rasterized by the webview — see `desktop/tray-icons.svelte.ts`. Rust has no
/// idea what a category's icon looks like, only how many pixels it came back as.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayRowIcon {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayEventRow {
    /// The calendar event's id, handed back to the webview when the row is chosen.
    pub id: String,
    /// The whole row as it should read, e.g. "07:30 · Sadhana - Morning".
    pub label: String,
    /// The event's category, already drawn in its colour.
    pub icon: TrayRowIcon,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TraySection {
    /// A grey, unclickable row above the events: "Today", "Tomorrow", "Tue Aug 18".
    pub heading: String,
    pub rows: Vec<TrayEventRow>,
}

/// The call the menu bar offers to walk into, when the next thing is one.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayJoin {
    /// The whole row: "Join Google Meet".
    pub label: String,
    pub url: String,
}

/// Everything the menu bar shows, in one push.
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TrayState {
    /// The text beside the icon, already formatted ("Sprint Start · in 25m"). Empty for icon only.
    pub title: String,
    /// The colour of the bar beside it, "#RRGGBB". Absent means nothing is happening.
    pub color: Option<String>,
    pub tooltip: Option<String>,
    #[serde(default)]
    pub join: Option<TrayJoin>,
    pub sections: Vec<TraySection>,
}

/// A rounded bar in `color`, the shape a calendar block wears everywhere else in the app.
///
/// Drawn rather than shipped as an asset because its colour is the event's — the category the
/// hour counts toward — and that isn't known until the webview says so.
fn bar(color: [u8; 3], (width, height): (u32, u32)) -> Image<'static> {
    let (w, h) = (width as f32, height as f32);
    let radius = w / 2.0;
    let mut rgba = Vec::with_capacity((width * height * 4) as usize);

    for y in 0..height {
        for x in 0..width {
            // Signed distance to a rounded rectangle filling the image, sampled at the pixel's
            // centre; the half-pixel band around zero is what gives the ends smooth edges.
            let dx = ((x as f32 + 0.5) - w / 2.0).abs() - (w / 2.0 - radius);
            let dy = ((y as f32 + 0.5) - h / 2.0).abs() - (h / 2.0 - radius);
            let outside = dx.max(0.0).hypot(dy.max(0.0));
            let inside = dx.max(dy).min(0.0);
            let coverage = (0.5 - (outside + inside - radius)).clamp(0.0, 1.0);

            rgba.extend_from_slice(&color);
            rgba.push((coverage * 255.0).round() as u8);
        }
    }

    Image::new_owned(rgba, width, height)
}

/// "#40966F" → `[0x40, 0x96, 0x6F]`, falling back to the neutral the app uses for untracked time.
fn rgb(hex: &Option<String>) -> [u8; 3] {
    let Some(hex) = hex else { return NEUTRAL };
    let digits = hex.trim_start_matches('#');
    if digits.len() != 6 {
        return NEUTRAL;
    }
    let channel = |i: usize| u8::from_str_radix(&digits[i..i + 2], 16);
    match (channel(0), channel(2), channel(4)) {
        (Ok(r), Ok(g), Ok(b)) => [r, g, b],
        _ => NEUTRAL,
    }
}

fn truncated(title: &str) -> String {
    if title.chars().count() <= MAX_TITLE_CHARS {
        return title.to_string();
    }
    let head: String = title.chars().take(MAX_TITLE_CHARS - 1).collect();
    format!("{}…", head.trim_end())
}

/// The dropdown: the day's sections as the webview grouped them, then the app's own rows.
pub fn build_menu(app: &AppHandle, state: &TrayState) -> tauri::Result<Menu<Wry>> {
    // Every item has to outlive `Menu::with_items`, so they're owned here and borrowed after.
    let mut items: Vec<Box<dyn IsMenuItem<Wry>>> = Vec::new();

    // Above the day, because it's the one row with a deadline on it. The link rides in the id:
    // a menu event carries nothing else, and the alternative is a second copy of the state here.
    if let Some(join) = &state.join {
        items.push(Box::new(MenuItem::with_id(
            app,
            format!("join:{}", join.url),
            &join.label,
            true,
            Some("Cmd+J"),
        )?));
        items.push(Box::new(PredefinedMenuItem::separator(app)?));
    }

    for section in &state.sections {
        if section.rows.is_empty() {
            continue;
        }
        // A disabled item is how macOS menus write a section heading — there's no heading kind.
        items.push(Box::new(MenuItem::new(
            app,
            &section.heading,
            false,
            None::<&str>,
        )?));
        for row in &section.rows {
            let icon = Image::new_owned(row.icon.rgba.clone(), row.icon.width, row.icon.height);
            items.push(Box::new(IconMenuItem::with_id(
                app,
                format!("event:{}", row.id),
                &row.label,
                true,
                Some(icon),
                None::<&str>,
            )?));
        }
    }

    if items.is_empty() {
        items.push(Box::new(MenuItem::new(
            app,
            "Nothing scheduled",
            false,
            None::<&str>,
        )?));
    }

    items.push(Box::new(PredefinedMenuItem::separator(app)?));
    items.push(Box::new(MenuItem::with_id(
        app,
        "open",
        "Open Balance",
        true,
        Some("Cmd+1"),
    )?));
    items.push(Box::new(MenuItem::with_id(
        app,
        "refresh",
        "Refresh",
        true,
        Some("Cmd+R"),
    )?));
    items.push(Box::new(PredefinedMenuItem::separator(app)?));
    items.push(Box::new(MenuItem::with_id(
        app,
        "quit",
        "Quit Balance",
        true,
        Some("Cmd+Q"),
    )?));

    let refs: Vec<&dyn IsMenuItem<Wry>> = items.iter().map(|item| item.as_ref()).collect();
    Menu::with_items(app, &refs)
}

/// Pushed by the webview on every change and on its own minute tick.
#[tauri::command]
pub fn update_tray(app: AppHandle, state: TrayState) -> Result<(), String> {
    let tray = app.tray_by_id(TRAY_ID).ok_or("the tray isn't there")?;

    // `set_title(None)` is a no-op on macOS rather than a clear, so an empty title says "icon only".
    tray.set_title(Some(truncated(&state.title)))
        .map_err(|e| e.to_string())?;
    tray.set_tooltip(Some(state.tooltip.as_deref().unwrap_or("Balance")))
        .map_err(|e| e.to_string())?;
    // Atomic, and it leaves the template flag alone — `set_icon` would quietly reset it.
    tray.set_icon_with_as_template(Some(bar(rgb(&state.color), TRAY_BAR)), false)
        .map_err(|e| e.to_string())?;
    let menu = build_menu(&app, &state).map_err(|e| e.to_string())?;
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    Ok(())
}

/// The icon the app wears before the webview has had a chance to say anything.
pub fn initial_icon() -> Image<'static> {
    bar(NEUTRAL, TRAY_BAR)
}
