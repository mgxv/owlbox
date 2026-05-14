use anyhow::Context;
use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;

mod autostart;
mod badge;
mod external;
mod mailto;
mod preferences;
mod settings;
mod shortcuts;
mod theme;
mod title;
mod webview;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() -> anyhow::Result<()> {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .skip_initial_state("preferences")
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
        .on_menu_event(shortcuts::handle_menu_event)
        .setup(|app| {
            let handle = app.handle().clone();

            app.set_menu(shortcuts::build_menu(&handle)?)?;

            badge::register_handler(&handle);
            title::register_handler(&handle);
            theme::register_handler(&handle);
            autostart::register_handler(&handle);
            shortcuts::register_handler(&handle);

            webview::build(app)?;
            preferences::build_hidden(&handle)?;
            theme::apply(&handle);
            autostart::apply(&handle);

            let mailto_handle = handle.clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    if url.scheme() == "mailto" {
                        let _ = mailto::dispatch(&mailto_handle, &url);
                    }
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .context("error while building tauri application")?
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen {
                has_visible_windows,
                ..
            } = event
            {
                if let Some(window) = app.get_webview_window("main") {
                    let visible = window.is_visible().unwrap_or(false);
                    let minimized = window.is_minimized().unwrap_or(false);
                    if !has_visible_windows || !visible || minimized {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
    Ok(())
}
