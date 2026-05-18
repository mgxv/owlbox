use anyhow::Context;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_deep_link::DeepLinkExt;

mod autostart;
mod badge;
pub mod build_info;
mod compose;
mod diag;
mod external;
mod notifications;
pub mod paths;
mod preferences;
mod reset;
mod settings;
mod shortcuts;
mod theme;
mod title;
mod updater;
mod webview;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() -> anyhow::Result<()> {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window(paths::WINDOW_MAIN) {
                // Bring-forward dance: no-op on already-correct state.
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(
            tauri_plugin_log::Builder::new()
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stderr,
                ))
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir { file_name: None },
                ))
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .skip_initial_state("preferences")
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            autostart::launch_at_login_enabled,
            build_info::crash_reporting_available,
            notifications::notification_permission_granted,
            reset::reset_app,
            updater::update_pending_version,
        ])
        .on_menu_event(shortcuts::handle_menu_event)
        .setup(|app| {
            let handle = app.handle().clone();

            log::info!("Owlbox {} starting", env!("CARGO_PKG_VERSION"));

            verify_prefs_path(&handle);

            let menu = shortcuts::build_menu(&handle).context("build app menu")?;
            app.set_menu(menu).context("install app menu")?;

            badge::register_handler(&handle);
            title::register_handler(&handle);
            theme::register_handler(&handle);
            autostart::register_handler(&handle);
            shortcuts::register_handler(&handle);
            notifications::request_permission(&handle);
            notifications::register_handler(&handle);

            webview::build(app)?;
            preferences::build_hidden(&handle)?;
            theme::apply(&handle);
            autostart::apply(&handle);
            shortcuts::apply_default_zoom(&handle);
            updater::check_in_background(&handle);

            let compose_handle = handle.clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    if url.scheme() == "mailto" {
                        diag::check(
                            compose::open(&compose_handle, Some(&url)),
                            "[deep-link] mailto dispatch",
                        );
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
                if let Some(window) = app.get_webview_window(paths::WINDOW_MAIN) {
                    let visible = window.is_visible().unwrap_or(false);
                    let minimized = window.is_minimized().unwrap_or(false);
                    if !has_visible_windows || !visible || minimized {
                        // Bring-forward dance: no-op on already-correct state.
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

// Catches drift between main.rs's pre-Tauri file read and Tauri's
// app_data_dir resolver — a silent mismatch would disable crash reporting.
fn verify_prefs_path<R: Runtime>(app: &AppHandle<R>) {
    let Some(expected) = paths::prefs_path() else {
        return;
    };
    match app.path().app_data_dir() {
        Ok(dir) => {
            let actual = dir.join(paths::PREFS_FILENAME);
            if actual != expected {
                diag::warn(&format!(
                    "[prefs] path drift — main.rs reads {expected:?}, Tauri uses {actual:?}"
                ));
            }
        }
        Err(e) => diag::warn(&format!("[prefs] could not resolve app_data_dir: {e}")),
    }
}
