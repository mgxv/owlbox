use tauri::{AppHandle, Listener, Manager, Runtime};

pub fn register_handler<R: Runtime>(app: &AppHandle<R>) {
    let handle = app.clone();
    app.listen("account-email", move |event| {
        let Ok(email) = serde_json::from_str::<String>(event.payload()) else {
            eprintln!("[title] failed to parse email: {:?}", event.payload());
            return;
        };
        if let Some(window) = handle.get_webview_window("main") {
            if let Err(e) = window.set_title(&email) {
                eprintln!("[title] set_title failed: {e}");
            }
        }
    });

    app.listen("title-format-unknown", |event| {
        let raw = serde_json::from_str::<String>(event.payload())
            .unwrap_or_else(|_| event.payload().to_string());
        eprintln!("[title] unrecognized format — count parsing may be broken: {raw}");
    });
}
