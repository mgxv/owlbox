use std::fmt::Display;

// Both the log facade and sentry::capture_message no-op before their
// respective initializers run, so this is safe to call at any point.
pub fn warn(msg: &str) {
    log::warn!("{msg}");
    sentry::capture_message(msg, sentry::Level::Warning);
}

pub fn check<T, E: Display>(result: Result<T, E>, context: &str) {
    if let Err(e) = result {
        warn(&format!("{context}: {e}"));
    }
}
