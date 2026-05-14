// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Arc, LazyLock};

use regex::Regex;

static EMAIL_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[\w.+\-]+@[\w.\-]+\.[a-zA-Z]{2,}").unwrap());

fn scrub_emails(s: &str) -> String {
    EMAIL_RE.replace_all(s, "<redacted-email>").to_string()
}

fn main() -> anyhow::Result<()> {
    let _sentry_guard = init_sentry();
    owlbox_lib::run()
}

fn init_sentry() -> Option<sentry::ClientInitGuard> {
    let dsn = option_env!("SENTRY_DSN").filter(|s| !s.is_empty())?;
    if !crash_reporting_enabled() {
        return None;
    }
    Some(sentry::init((
        dsn,
        sentry::ClientOptions {
            release: sentry::release_name!(),
            send_default_pii: false,
            before_send: Some(Arc::new(|mut event| {
                event.user = None;
                event.request = None;
                if let Some(msg) = event.message.as_mut() {
                    *msg = scrub_emails(msg);
                }
                for ex in event.exception.values.iter_mut() {
                    if let Some(value) = ex.value.as_mut() {
                        *value = scrub_emails(value);
                    }
                }
                Some(event)
            })),
            ..Default::default()
        },
    )))
}

// Sentry must initialize before Tauri so it catches early panics; read
// prefs.json directly from the path tauri-plugin-store writes to.
fn crash_reporting_enabled() -> bool {
    let Some(path) = owlbox_lib::paths::prefs_path() else {
        return false;
    };
    let Ok(content) = std::fs::read_to_string(&path) else {
        return false;
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) else {
        return false;
    };
    json.get("crashReporting")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scrubs_single_email() {
        assert_eq!(scrub_emails("user@example.com"), "<redacted-email>");
    }

    #[test]
    fn scrubs_email_inside_message() {
        assert_eq!(
            scrub_emails("Failed to send to alice@example.com today"),
            "Failed to send to <redacted-email> today"
        );
    }

    #[test]
    fn scrubs_multiple_emails() {
        let out = scrub_emails("from a@b.com to c@d.org");
        assert_eq!(out, "from <redacted-email> to <redacted-email>");
        assert!(!out.contains('@'));
    }

    #[test]
    fn scrubs_plus_and_dot_addressing() {
        assert_eq!(
            scrub_emails("user.name+tag@sub.example.co.uk"),
            "<redacted-email>"
        );
    }

    #[test]
    fn leaves_non_email_text_untouched() {
        assert_eq!(scrub_emails("connection refused"), "connection refused");
        assert_eq!(scrub_emails(""), "");
        assert_eq!(
            scrub_emails("see @docs for details"),
            "see @docs for details"
        );
    }
}
