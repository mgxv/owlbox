use std::sync::atomic::{AtomicI64, Ordering};

use tauri::{AppHandle, Listener, Manager, Runtime};

use crate::{diag, settings};

static LAST_COUNT: AtomicI64 = AtomicI64::new(0);

pub fn register_handler<R: Runtime>(app: &AppHandle<R>) {
    let count_handle = app.clone();
    app.listen("unread-count", move |event| {
        let Ok(count) = event.payload().trim().parse::<i64>() else {
            diag::warn(&format!(
                "[badge] failed to parse count: {:?}",
                event.payload()
            ));
            return;
        };
        LAST_COUNT.store(count, Ordering::Relaxed);
        apply(&count_handle, count);
    });

    let pref_handle = app.clone();
    app.listen("badge-pref-changed", move |_| {
        apply(&pref_handle, LAST_COUNT.load(Ordering::Relaxed));
    });
}

fn apply<R: Runtime>(handle: &AppHandle<R>, count: i64) {
    let Some(window) = handle.get_webview_window("main") else {
        return;
    };
    let enabled = settings::get_bool(handle, "showDockBadge", true);
    let value = if enabled && count > 0 {
        Some(count)
    } else {
        None
    };
    diag::check(window.set_badge_count(value), "[badge] set_badge_count");
}
