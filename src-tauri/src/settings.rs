use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

pub fn get_bool<R: Runtime>(app: &AppHandle<R>, key: &str, default: bool) -> bool {
    app.store("preferences.json")
        .ok()
        .and_then(|s| s.get(key).and_then(|v| v.as_bool()))
        .unwrap_or(default)
}

pub fn get_string<R: Runtime>(app: &AppHandle<R>, key: &str, default: &str) -> String {
    app.store("preferences.json")
        .ok()
        .and_then(|s| s.get(key).and_then(|v| v.as_str().map(String::from)))
        .unwrap_or_else(|| default.to_string())
}

pub fn get_u32<R: Runtime>(app: &AppHandle<R>, key: &str, default: u32) -> u32 {
    app.store("preferences.json")
        .ok()
        .and_then(|s| s.get(key).and_then(|v| v.as_u64()))
        .map(|n| n as u32)
        .unwrap_or(default)
}
