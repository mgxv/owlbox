use anyhow::Context;
use tauri::menu::{
    Menu, MenuBuilder, MenuEvent, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
};
use tauri::{AppHandle, Listener, Manager, Runtime};

use crate::{compose, diag};

// Multiple selectors so a Gmail markup change doesn't silently break the
// shortcut. Falls back to emitting `menu-action-failed` for visibility.
const FOCUS_SEARCH_JS: &str = r#"(() => {
    const SELECTORS = [
        'input[aria-label*="Search" i]',
        'input[name="q"]',
        'header[role="search"] input',
    ];
    for (const sel of SELECTORS) {
        const el = document.querySelector(sel);
        if (el) {
            el.focus();
            if (el.select) el.select();
            return;
        }
    }
    if (window.__owlbox__) {
        window.__owlbox__.emit("menu-action-failed", "focus_search");
    }
})();"#;

pub fn build_menu<R: Runtime>(app: &AppHandle<R>) -> anyhow::Result<Menu<R>> {
    let app_menu = SubmenuBuilder::new(app, "Owlbox")
        .item(&PredefinedMenuItem::about(app, None, None)?)
        .separator()
        .item(
            &MenuItemBuilder::with_id("preferences", "Preferences…")
                .accelerator("CmdOrCtrl+,")
                .build(app)?,
        )
        .separator()
        .item(&PredefinedMenuItem::hide(app, None)?)
        .item(&PredefinedMenuItem::hide_others(app, None)?)
        .item(&PredefinedMenuItem::show_all(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(
            &MenuItemBuilder::with_id("compose", "New Message")
                .accelerator("Ctrl+Cmd+N")
                .build(app)?,
        )
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .item(
            &MenuItemBuilder::with_id("reload", "Reload")
                .accelerator("CmdOrCtrl+R")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("focus_search", "Find")
                .accelerator("CmdOrCtrl+F")
                .build(app)?,
        )
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .item(&PredefinedMenuItem::close_window(app, None)?)
        .build()?;

    MenuBuilder::new(app)
        .items(&[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu])
        .build()
        .context("build app menu")
}

pub fn register_handler<R: Runtime>(app: &AppHandle<R>) {
    app.listen("menu-action-failed", |event| {
        let action = serde_json::from_str::<String>(event.payload())
            .unwrap_or_else(|_| event.payload().to_string());
        diag::warn(&format!(
            "[shortcuts] '{action}' could not find its Gmail target — DOM may have changed"
        ));
    });
}

pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    match event.id().as_ref() {
        "preferences" => {
            diag::check(
                super::preferences::toggle(app),
                "[shortcuts] preferences toggle",
            );
        }
        "compose" => {
            diag::check(compose::open(app, None), "[shortcuts] compose");
        }
        "reload" => {
            if let Some(window) = app.get_webview_window("main") {
                diag::check(window.eval("location.reload();"), "[shortcuts] reload");
            }
        }
        "focus_search" => {
            if let Some(window) = app.get_webview_window("main") {
                diag::check(
                    window.eval(FOCUS_SEARCH_JS),
                    "[shortcuts] focus_search eval",
                );
            }
        }
        _ => {}
    }
}
