use anyhow::Context;
use tauri::{AppHandle, Manager, Runtime, Url};

fn build_compose_url(mailto: &Url) -> anyhow::Result<Url> {
    let mut gmail_url = Url::parse("https://mail.google.com/mail/")?;
    gmail_url
        .query_pairs_mut()
        .append_pair("extsrc", "mailto")
        .append_pair("url", mailto.as_str());
    Ok(gmail_url)
}

pub fn dispatch<R: Runtime>(app: &AppHandle<R>, mailto: &Url) -> anyhow::Result<()> {
    let gmail_url = build_compose_url(mailto)?;

    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();

    window
        .navigate(gmail_url)
        .context("navigate to gmail compose")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn query_map(url: &Url) -> HashMap<String, String> {
        url.query_pairs().into_owned().collect()
    }

    #[test]
    fn builds_gmail_compose_url() {
        let mailto = Url::parse("mailto:foo@example.com").unwrap();
        let url = build_compose_url(&mailto).unwrap();
        assert_eq!(url.scheme(), "https");
        assert_eq!(url.host_str(), Some("mail.google.com"));
        assert_eq!(url.path(), "/mail/");
    }

    #[test]
    fn includes_extsrc_and_url_params() {
        let mailto = Url::parse("mailto:foo@example.com").unwrap();
        let url = build_compose_url(&mailto).unwrap();
        let pairs = query_map(&url);
        assert_eq!(pairs.get("extsrc").map(String::as_str), Some("mailto"));
        assert_eq!(
            pairs.get("url").map(String::as_str),
            Some("mailto:foo@example.com")
        );
    }

    #[test]
    fn preserves_subject_and_body() {
        let mailto = Url::parse("mailto:a@b.com?subject=Hi%20there&body=Hello%20world").unwrap();
        let url = build_compose_url(&mailto).unwrap();
        let pairs = query_map(&url);
        assert_eq!(
            pairs.get("url").map(String::as_str),
            Some("mailto:a@b.com?subject=Hi%20there&body=Hello%20world")
        );
    }

    #[test]
    fn handles_multiple_recipients() {
        let mailto = Url::parse("mailto:a@b.com,c@d.org?cc=e@f.net").unwrap();
        let url = build_compose_url(&mailto).unwrap();
        let pairs = query_map(&url);
        assert_eq!(
            pairs.get("url").map(String::as_str),
            Some("mailto:a@b.com,c@d.org?cc=e@f.net")
        );
    }
}
