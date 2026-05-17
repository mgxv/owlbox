use anyhow::Context;
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder, WindowEvent};

use crate::{diag, paths};

pub fn build_hidden<R: Runtime>(app: &AppHandle<R>) -> anyhow::Result<()> {
    if app.get_webview_window(paths::WINDOW_PREFS).is_some() {
        return Ok(());
    }

    let mut builder = WebviewWindowBuilder::new(
        app,
        paths::WINDOW_PREFS,
        WebviewUrl::App("index.html".into()),
    )
    .title("Preferences")
    .inner_size(500.0, 450.0)
    .resizable(false)
    .minimizable(false)
    .maximizable(false)
    .visible(false)
    .focused(false);

    #[cfg(target_os = "macos")]
    {
        builder = builder.title_bar_style(tauri::TitleBarStyle::Visible);
    }

    let window = builder.build().context("build preferences window")?;

    let hide_window = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            diag::check(hide_window.hide(), "[prefs] hide on close");
        }
    });

    Ok(())
}

pub fn toggle<R: Runtime>(app: &AppHandle<R>) -> anyhow::Result<()> {
    if app.get_webview_window(paths::WINDOW_PREFS).is_none() {
        build_hidden(app)?;
    }
    let window = app
        .get_webview_window(paths::WINDOW_PREFS)
        .context("preferences window missing after build")?;

    let visible = window.is_visible().unwrap_or(false);
    let focused = window.is_focused().unwrap_or(false);

    if visible && focused {
        diag::check(window.hide(), "[prefs] hide on toggle");
    } else {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(())
}
