use tauri::{AppHandle, Manager, Runtime};

use crate::paths;

#[tauri::command]
pub async fn reset_app<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        if let Err(e) = window.clear_all_browsing_data() {
            log::warn!("[reset] clear_all_browsing_data: {e}");
        }
    }

    if let Some(path) = paths::prefs_path() {
        if path.exists() {
            if let Err(e) = std::fs::remove_file(&path) {
                log::warn!("[reset] remove preferences: {e}");
            }
        }
    }

    Ok(())
}
