pub fn sentry_dsn() -> Option<&'static str> {
    option_env!("SENTRY_DSN").filter(|s| !s.is_empty())
}

#[tauri::command]
pub fn crash_reporting_available() -> bool {
    sentry_dsn().is_some()
}
