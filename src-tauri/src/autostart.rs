use tauri::{AppHandle, Listener, Runtime};
use tauri_plugin_autostart::ManagerExt;

use crate::{diag, settings};

pub fn apply<R: Runtime>(app: &AppHandle<R>) {
    let want = settings::get_bool(app, "launchAtStartup", false);
    let manager = app.autolaunch();
    let is = manager.is_enabled().unwrap_or(false);
    if want && !is {
        diag::check(manager.enable(), "[autostart] enable");
    } else if !want && is {
        diag::check(manager.disable(), "[autostart] disable");
    }
}

#[tauri::command]
pub fn launch_at_login_enabled(app: tauri::AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

pub fn register_handler<R: Runtime>(app: &AppHandle<R>) {
    let handle = app.clone();
    app.listen("launch-at-startup-changed", move |_| apply(&handle));
}
