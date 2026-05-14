use tauri::{AppHandle, Listener, Manager, Runtime};

use crate::diag;

pub fn register_handler<R: Runtime>(app: &AppHandle<R>) {
    let handle = app.clone();
    app.listen("account-email", move |event| {
        let Ok(email) = serde_json::from_str::<String>(event.payload()) else {
            diag::warn(&format!(
                "[title] failed to parse email: {:?}",
                event.payload()
            ));
            return;
        };
        if let Some(window) = handle.get_webview_window("main") {
            diag::check(window.set_title(&email), "[title] set_title");
        }
    });

    app.listen("title-format-unknown", |event| {
        let raw = serde_json::from_str::<String>(event.payload())
            .unwrap_or_else(|_| event.payload().to_string());
        diag::warn(&format!(
            "[title] unrecognized format — count parsing may be broken: {raw}"
        ));
    });
}
