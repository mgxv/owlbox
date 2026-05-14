use tauri::{AppHandle, Listener, Manager, Runtime, Theme};

use crate::{diag, settings};

fn parse(value: &str) -> Option<Theme> {
    match value {
        "light" => Some(Theme::Light),
        "dark" => Some(Theme::Dark),
        _ => None,
    }
}

pub fn apply<R: Runtime>(app: &AppHandle<R>) {
    let theme = parse(&settings::get_string(app, "theme", "system"));
    for (label, window) in app.webview_windows() {
        diag::check(
            window.set_theme(theme),
            &format!("[theme] set_theme {label}"),
        );
    }
}

pub fn register_handler<R: Runtime>(app: &AppHandle<R>) {
    let handle = app.clone();
    app.listen("theme-changed", move |_| apply(&handle));
}
