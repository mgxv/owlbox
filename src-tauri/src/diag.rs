use std::fmt::Display;

// sentry::capture_message no-ops without an initialized client, so this
// is safe to call before main.rs sets Sentry up.
pub fn warn(msg: &str) {
    eprintln!("{msg}");
    sentry::capture_message(msg, sentry::Level::Warning);
}

pub fn check<T, E: Display>(result: Result<T, E>, context: &str) {
    if let Err(e) = result {
        warn(&format!("{context}: {e}"));
    }
}
