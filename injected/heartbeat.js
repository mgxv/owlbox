(function () {
    try {
        if (!window.__owlbox__) return;
        const INTERVAL_MS = 1000;
        setInterval(() => {
            window.__owlbox__.emit("webview-heartbeat", Date.now());
        }, INTERVAL_MS);
    } catch (e) {
        try {
            window.__TAURI_INTERNALS__?.invoke("plugin:event|emit", {
                event: "injected-script-error",
                payload: { script: "heartbeat", error: String(e) },
            });
        } catch {}
    }
})();
