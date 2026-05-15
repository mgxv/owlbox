use std::sync::atomic::{AtomicU32, Ordering};

use anyhow::Context;
use tauri::menu::{
    Menu, MenuBuilder, MenuEvent, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
};
use tauri::{AppHandle, Listener, Manager, Runtime};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::{compose, diag, settings};

const ZOOM_STEP: u32 = 10;
const ZOOM_MIN: u32 = 50;
const ZOOM_MAX: u32 = 150;
const FALLBACK_ZOOM: u32 = 100;
static ZOOM_PERCENT: AtomicU32 = AtomicU32::new(FALLBACK_ZOOM);
static DEFAULT_ZOOM: AtomicU32 = AtomicU32::new(FALLBACK_ZOOM);

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
                .accelerator("CmdOrCtrl+Shift+N")
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
        .item(
            &MenuItemBuilder::with_id("paste_plain", "Paste and Match Style")
                .accelerator("CmdOrCtrl+Shift+V")
                .build(app)?,
        )
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
        .separator()
        .item(
            &MenuItemBuilder::with_id("zoom_in", "Zoom In")
                .accelerator("CmdOrCtrl+Equal")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("zoom_out", "Zoom Out")
                .accelerator("CmdOrCtrl+Minus")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("zoom_reset", "Actual Size")
                .accelerator("CmdOrCtrl+0")
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

    let handle = app.clone();
    app.listen("default-zoom-changed", move |_| {
        apply_default_zoom(&handle);
    });
}

pub fn apply_default_zoom<R: Runtime>(app: &AppHandle<R>) {
    let percent = settings::get_u32(app, "defaultZoom", FALLBACK_ZOOM).clamp(ZOOM_MIN, ZOOM_MAX);
    DEFAULT_ZOOM.store(percent, Ordering::Relaxed);
    apply_zoom(app, percent);
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
        "paste_plain" => paste_plain(app),
        "zoom_in" => apply_zoom(
            app,
            ZOOM_PERCENT
                .load(Ordering::Relaxed)
                .saturating_add(ZOOM_STEP)
                .min(ZOOM_MAX),
        ),
        "zoom_out" => apply_zoom(
            app,
            ZOOM_PERCENT
                .load(Ordering::Relaxed)
                .saturating_sub(ZOOM_STEP)
                .max(ZOOM_MIN),
        ),
        "zoom_reset" => apply_zoom(app, DEFAULT_ZOOM.load(Ordering::Relaxed)),
        _ => {}
    }
}

fn apply_zoom<R: Runtime>(app: &AppHandle<R>, percent: u32) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let factor = f64::from(percent) / 100.0;
    if let Err(e) = window.set_zoom(factor) {
        diag::warn(&format!("[shortcuts] set_zoom {percent}%: {e}"));
        return;
    }
    ZOOM_PERCENT.store(percent, Ordering::Relaxed);
}

fn paste_plain<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let text = match app.clipboard().read_text() {
        Ok(t) if !t.is_empty() => t,
        Ok(_) => return,
        Err(e) => {
            diag::warn(&format!("[shortcuts] paste plain clipboard read: {e}"));
            return;
        }
    };
    let literal = match serde_json::to_string(&text) {
        Ok(s) => s,
        Err(e) => {
            diag::warn(&format!("[shortcuts] paste plain encode: {e}"));
            return;
        }
    };
    let js = format!(
        r#"(() => {{
            const text = {literal};
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;
            const range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode(text));
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }})();"#
    );
    diag::check(window.eval(js), "[shortcuts] paste plain");
}
