use anyhow::Context;
use tauri::webview::NewWindowResponse;
use tauri::{App, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::{diag, external};

const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";

// Bypass workspace.google.com marketing page; mail.google.com redirects there
// for logged-out users and the sign-in button silently fails inside the webview.
const INITIAL_URL: &str = "https://accounts.google.com/ServiceLogin?service=mail&continue=https%3A%2F%2Fmail.google.com%2Fmail%2Fu%2F0";

const INJECT_SHARED: &str = include_str!("../../injected/shared.js");
const INJECT_TITLE_SYNC: &str = include_str!("../../injected/title-sync.js");

pub fn build(app: &mut App) -> anyhow::Result<WebviewWindow> {
    let url: tauri::Url = INITIAL_URL.parse()?;

    // WKWebView drops window.open() without a UI delegate. Route Google
    // auth/mail URLs inline; everything else to the default browser.
    let popup_handle = app.handle().clone();
    let on_new_window = move |url: tauri::Url, _features| -> NewWindowResponse<_> {
        if external::stays_inside(&url) {
            if let Some(window) = popup_handle.get_webview_window("main") {
                diag::check(window.navigate(url), "[webview] popup navigate");
            }
        } else {
            external::open(url.as_str());
        }
        NewWindowResponse::Deny
    };

    let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
        .title("Owlbox")
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .resizable(true)
        .user_agent(USER_AGENT)
        .initialization_script(INJECT_SHARED)
        .initialization_script(INJECT_TITLE_SYNC)
        .on_new_window(on_new_window);

    #[cfg(target_os = "macos")]
    {
        builder = builder.title_bar_style(tauri::TitleBarStyle::Transparent);
    }

    let window = builder.build().context("build main webview")?;

    use tauri_plugin_window_state::{StateFlags, WindowExt};
    diag::check(
        window.restore_state(StateFlags::all()),
        "[webview] restore window state",
    );

    // Hide on close so the Gmail session survives; Cmd+Q still quits.
    let close_handle = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            diag::check(close_handle.hide(), "[webview] hide on close");
        }
    });

    Ok(window)
}
