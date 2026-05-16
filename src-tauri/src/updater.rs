use std::sync::OnceLock;

use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_updater::UpdaterExt;

use crate::diag;

static PENDING_VERSION: OnceLock<String> = OnceLock::new();

pub fn check_in_background<R: Runtime>(app: &AppHandle<R>) {
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let updater = match handle.updater() {
            Ok(u) => u,
            Err(e) => {
                diag::warn(&format!("[updater] init: {e}"));
                return;
            }
        };
        match updater.check().await {
            Ok(Some(update)) => {
                log::info!("[updater] update available: {}", update.version);
                let version = update.version.clone();
                if let Err(e) = update.download_and_install(|_, _| {}, || {}).await {
                    diag::warn(&format!("[updater] install: {e}"));
                } else {
                    log::info!("[updater] installed; takes effect on next launch");
                    let _ = PENDING_VERSION.set(version.clone());
                    let _ = handle.emit("update-ready", version);
                }
            }
            Ok(None) => log::info!("[updater] up to date"),
            Err(e) => diag::warn(&format!("[updater] check: {e}")),
        }
    });
}

#[tauri::command]
pub fn update_pending_version() -> Option<String> {
    PENDING_VERSION.get().cloned()
}
