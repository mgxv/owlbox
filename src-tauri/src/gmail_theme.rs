use tauri::{AppHandle, Listener, Manager, Runtime};

use crate::{diag, settings};

fn resolve<R: Runtime>(app: &AppHandle<R>) -> &'static str {
    match settings::get_string(app, "gmailTheme", "light").as_str() {
        "dark" => "dark",
        _ => "light",
    }
}

// Baked into the webview as an initialization_script so the very first frame
// has the correct theme target without an IPC round trip.
pub fn initial_prelude<R: Runtime>(app: &AppHandle<R>) -> String {
    let mode = resolve(app);
    format!("window.__OWLBOX_GMAIL_THEME_INITIAL__ = {mode:?};")
}

pub fn apply<R: Runtime>(app: &AppHandle<R>) {
    let Some(main) = app.get_webview_window("main") else {
        return;
    };
    let mode = resolve(app);
    let js = format!("window.OwlboxGmailTheme && OwlboxGmailTheme.set({mode:?});");
    diag::check(main.eval(js), "[gmail-theme] push");
}

pub fn register_handler<R: Runtime>(app: &AppHandle<R>) {
    let handle = app.clone();
    app.listen("gmail-theme-changed", move |_| apply(&handle));
}
