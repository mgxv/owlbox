use anyhow::Context;
use tauri::webview::NewWindowResponse;
use tauri::{
    App, AppHandle, Listener, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    WindowEvent,
};

use crate::{diag, external, gmail_theme};

pub(crate) const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";

// workspace.google.com is the marketing page mail.google.com redirects to for
// logged-out users; sign-in there silently fails inside the webview.
const INITIAL_URL: &str = "https://accounts.google.com/ServiceLogin?service=mail&continue=https%3A%2F%2Fmail.google.com%2Fmail%2Fu%2F0";

pub(crate) const INJECT_SHARED: &str = include_str!("../../injected/shared.js");
const INJECT_TITLE_SYNC: &str = include_str!("../../injected/title-sync.js");
pub(crate) const INJECT_DARK_READER: &str = include_str!("../../injected/dark-reader.js");
pub(crate) const INJECT_GMAIL_THEME: &str = include_str!("../../injected/gmail-theme.js");

pub fn build(app: &mut App) -> anyhow::Result<WebviewWindow> {
    let url: tauri::Url = INITIAL_URL.parse().context("parse INITIAL_URL")?;

    let popup_handle = app.handle().clone();
    let prelude = gmail_theme::initial_prelude(app.handle());
    let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
        .title("Owlbox")
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .resizable(true)
        .user_agent(USER_AGENT)
        // _for_all_frames hits cross-origin iframes (OGS popups);
        // title-sync stays main-frame only since it reads the top title.
        .initialization_script_for_all_frames(INJECT_SHARED)
        .initialization_script(INJECT_TITLE_SYNC)
        .initialization_script_for_all_frames(&prelude)
        .initialization_script_for_all_frames(INJECT_DARK_READER)
        .initialization_script_for_all_frames(INJECT_GMAIL_THEME)
        .on_new_window(move |url, _features| handle_popup(&popup_handle, url));

    #[cfg(target_os = "macos")]
    {
        builder = builder.title_bar_style(tauri::TitleBarStyle::Transparent);
    }

    let window = builder.build().context("build main webview")?;

    restore_window_state(&window);
    install_close_handler(&window);
    install_script_error_listener(app);

    Ok(window)
}

// WKWebView drops window.open() without a UI delegate; route Google
// auth/mail URLs inline and everything else to the system browser.
fn handle_popup<R: Runtime>(handle: &AppHandle<R>, url: tauri::Url) -> NewWindowResponse<R> {
    if external::stays_inside(&url) {
        if let Some(window) = handle.get_webview_window("main") {
            diag::check(window.navigate(url), "[webview] popup navigate");
        }
    } else {
        external::open(url.as_str());
    }
    NewWindowResponse::Deny
}

fn restore_window_state(window: &WebviewWindow) {
    use tauri_plugin_window_state::{StateFlags, WindowExt};
    diag::check(
        window.restore_state(StateFlags::all()),
        "[webview] restore window state",
    );
}

// Hide rather than close so the Gmail session survives; Cmd+Q still quits.
fn install_close_handler(window: &WebviewWindow) {
    let close_handle = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            diag::check(close_handle.hide(), "[webview] hide on close");
        }
    });
}

fn install_script_error_listener(app: &App) {
    app.listen("injected-script-error", |event| {
        diag::warn(&format!("[injected] script error: {}", event.payload()));
    });
}
