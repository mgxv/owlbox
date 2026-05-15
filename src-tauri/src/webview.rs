use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use anyhow::Context;
use tauri::webview::{NewWindowResponse, PageLoadEvent};
use tauri::{
    App, AppHandle, Listener, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    WindowEvent,
};

use crate::{diag, external};

const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";

// workspace.google.com is the marketing page mail.google.com redirects to for
// logged-out users; sign-in there silently fails inside the webview.
const INITIAL_URL: &str = "https://accounts.google.com/ServiceLogin?service=mail&continue=https%3A%2F%2Fmail.google.com%2Fmail%2Fu%2F0";

const INJECT_SHARED: &str = include_str!("../../injected/shared.js");
const INJECT_TITLE_SYNC: &str = include_str!("../../injected/title-sync.js");
const INJECT_HEARTBEAT: &str = include_str!("../../injected/heartbeat.js");

// Catches in-flight load failures and WebContent crashes during navigation
// (Finished never fires).
const LOAD_WATCHDOG: Duration = Duration::from_secs(20);

// Catches WebContent crashes after a successful load — the load watchdog
// can't help once Finished has fired.
const HEARTBEAT_GRACE: Duration = Duration::from_secs(5);
const HEARTBEAT_CHECK: Duration = Duration::from_secs(1);
const MAX_HEARTBEAT_TRIPS: usize = 3;

#[derive(Default, Clone)]
struct WebviewState {
    pending_load: Arc<Mutex<Option<Instant>>>,
    last_heartbeat: Arc<Mutex<Option<Instant>>>,
}

pub fn build(app: &mut App) -> anyhow::Result<WebviewWindow> {
    let url: tauri::Url = INITIAL_URL.parse().context("parse INITIAL_URL")?;
    let state = WebviewState::default();

    let popup_handle = app.handle().clone();
    let page_load_state = state.clone();
    let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
        .title("Owlbox")
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .resizable(true)
        .user_agent(USER_AGENT)
        .initialization_script(INJECT_SHARED)
        .initialization_script(INJECT_TITLE_SYNC)
        .initialization_script(INJECT_HEARTBEAT)
        .on_new_window(move |url, _features| handle_popup(&popup_handle, url))
        .on_page_load(move |webview, payload| {
            handle_page_load(payload.event(), webview, &page_load_state)
        });

    #[cfg(target_os = "macos")]
    {
        builder = builder.title_bar_style(tauri::TitleBarStyle::Transparent);
    }

    let window = builder.build().context("build main webview")?;

    restore_window_state(&window);
    install_close_handler(&window);
    install_script_error_listener(app);
    spawn_heartbeat_watchdog(app, &window, state);

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

fn handle_page_load(event: PageLoadEvent, webview: WebviewWindow, state: &WebviewState) {
    match event {
        PageLoadEvent::Started => arm_load_watchdog(state.pending_load.clone(), webview),
        PageLoadEvent::Finished => {
            *state.pending_load.lock().unwrap() = None;
            // Reset heartbeat so the new page has HEARTBEAT_GRACE to start emitting.
            *state.last_heartbeat.lock().unwrap() = Some(Instant::now());
        }
    }
}

fn arm_load_watchdog(pending: Arc<Mutex<Option<Instant>>>, webview: WebviewWindow) {
    let stamp = Instant::now();
    *pending.lock().unwrap() = Some(stamp);

    std::thread::spawn(move || {
        std::thread::sleep(LOAD_WATCHDOG);
        // A newer Started would have replaced the stamp.
        if !pending.lock().unwrap().is_some_and(|t| t == stamp) {
            return;
        }
        diag::warn(&format!(
            "[webview] load did not finish within {}s — re-navigating",
            LOAD_WATCHDOG.as_secs()
        ));
        // navigate() respawns WebContent; an eval'd reload can't.
        if let Ok(recovery) = INITIAL_URL.parse() {
            diag::check(webview.navigate(recovery), "[webview] watchdog navigate");
        }
    });
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

fn spawn_heartbeat_watchdog(app: &App, window: &WebviewWindow, state: WebviewState) {
    let trips = Arc::new(AtomicUsize::new(0));

    let listener_state = state.clone();
    let listener_trips = trips.clone();
    app.listen("webview-heartbeat", move |_| {
        *listener_state.last_heartbeat.lock().unwrap() = Some(Instant::now());
        listener_trips.store(0, Ordering::Relaxed);
    });

    let window = window.clone();
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(HEARTBEAT_CHECK);

            // Skip during a load — the load watchdog owns that case.
            if state.pending_load.lock().unwrap().is_some() {
                continue;
            }

            let should_trip = {
                let mut beat = state.last_heartbeat.lock().unwrap();
                match *beat {
                    Some(t) if t.elapsed() > HEARTBEAT_GRACE => {
                        *beat = None;
                        true
                    }
                    _ => false,
                }
            };
            if !should_trip {
                continue;
            }

            let count = trips.fetch_add(1, Ordering::Relaxed) + 1;
            if count > MAX_HEARTBEAT_TRIPS {
                diag::warn("[webview] heartbeat watchdog gave up after repeated failed recoveries");
                return;
            }
            diag::warn(&format!(
                "[webview] heartbeat lost ({count}/{MAX_HEARTBEAT_TRIPS}) — re-navigating"
            ));
            if let Ok(recovery) = INITIAL_URL.parse() {
                diag::check(
                    window.navigate(recovery),
                    "[webview] heartbeat-watchdog navigate",
                );
            }
        }
    });
}
