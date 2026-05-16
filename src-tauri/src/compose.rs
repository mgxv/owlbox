use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::LazyLock;

use anyhow::Context;
use tauri::{AppHandle, Runtime, Url, WebviewUrl, WebviewWindowBuilder};

use crate::gmail_theme;
use crate::webview::{INJECT_DARK_READER, INJECT_GMAIL_THEME, INJECT_SHARED, USER_AGENT};

static BLANK_COMPOSE_URL: LazyLock<Url> =
    LazyLock::new(|| Url::parse("https://mail.google.com/mail/?view=cm&fs=1").unwrap());

// Monotonically increasing per process so each compose window gets a
// unique label and capability glob matching stays clean.
static COMPOSE_COUNTER: AtomicUsize = AtomicUsize::new(0);

pub fn open<R: Runtime>(app: &AppHandle<R>, mailto: Option<&Url>) -> anyhow::Result<()> {
    let url = match mailto {
        Some(m) => with_mailto(m)?,
        None => BLANK_COMPOSE_URL.clone(),
    };

    let n = COMPOSE_COUNTER.fetch_add(1, Ordering::Relaxed);
    let label = format!("compose-{n}");
    let prelude = gmail_theme::initial_prelude(app);

    let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::External(url))
        .title("New Message")
        .inner_size(900.0, 700.0)
        .min_inner_size(600.0, 500.0)
        .resizable(true)
        .user_agent(USER_AGENT)
        .initialization_script_for_all_frames(INJECT_SHARED)
        .initialization_script_for_all_frames(&prelude)
        .initialization_script_for_all_frames(INJECT_DARK_READER)
        .initialization_script_for_all_frames(INJECT_GMAIL_THEME);

    #[cfg(target_os = "macos")]
    {
        builder = builder.title_bar_style(tauri::TitleBarStyle::Transparent);
    }

    builder.build().context("build compose window")?;
    Ok(())
}

fn with_mailto(mailto: &Url) -> anyhow::Result<Url> {
    let mut url = Url::parse("https://mail.google.com/mail/").context("parse compose URL")?;
    url.query_pairs_mut()
        .append_pair("extsrc", "mailto")
        .append_pair("url", mailto.as_str());
    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn query_map(url: &Url) -> HashMap<String, String> {
        url.query_pairs().into_owned().collect()
    }

    #[test]
    fn blank_url_is_gmail_compose() {
        let url = &*BLANK_COMPOSE_URL;
        assert_eq!(url.scheme(), "https");
        assert_eq!(url.host_str(), Some("mail.google.com"));
        assert_eq!(url.path(), "/mail/");
        let pairs = query_map(url);
        assert_eq!(pairs.get("view").map(String::as_str), Some("cm"));
        assert_eq!(pairs.get("fs").map(String::as_str), Some("1"));
    }

    #[test]
    fn mailto_url_targets_gmail_compose() {
        let mailto = Url::parse("mailto:foo@example.com").unwrap();
        let url = with_mailto(&mailto).unwrap();
        assert_eq!(url.scheme(), "https");
        assert_eq!(url.host_str(), Some("mail.google.com"));
        assert_eq!(url.path(), "/mail/");
    }

    #[test]
    fn mailto_url_includes_extsrc_and_url_params() {
        let mailto = Url::parse("mailto:foo@example.com").unwrap();
        let url = with_mailto(&mailto).unwrap();
        let pairs = query_map(&url);
        assert_eq!(pairs.get("extsrc").map(String::as_str), Some("mailto"));
        assert_eq!(
            pairs.get("url").map(String::as_str),
            Some("mailto:foo@example.com")
        );
    }

    #[test]
    fn mailto_url_preserves_subject_and_body() {
        let mailto = Url::parse("mailto:a@b.com?subject=Hi%20there&body=Hello%20world").unwrap();
        let url = with_mailto(&mailto).unwrap();
        let pairs = query_map(&url);
        assert_eq!(
            pairs.get("url").map(String::as_str),
            Some("mailto:a@b.com?subject=Hi%20there&body=Hello%20world")
        );
    }

    #[test]
    fn mailto_url_handles_multiple_recipients() {
        let mailto = Url::parse("mailto:a@b.com,c@d.org?cc=e@f.net").unwrap();
        let url = with_mailto(&mailto).unwrap();
        let pairs = query_map(&url);
        assert_eq!(
            pairs.get("url").map(String::as_str),
            Some("mailto:a@b.com,c@d.org?cc=e@f.net")
        );
    }
}
