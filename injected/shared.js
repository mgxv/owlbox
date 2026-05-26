(function () {
    try {
        if (window.__owlbox_genesis__) return;

        // IPC is main-frame only; emit() no-ops in cross-origin iframes.
        const internals = window.__TAURI_INTERNALS__;

        window.__owlbox_genesis__ = {
            EMAIL_RE: /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i,

            onReady(fn) {
                if (document.readyState === "loading") {
                    document.addEventListener("DOMContentLoaded", fn, {
                        once: true,
                    });
                } else {
                    fn();
                }
            },

            emit(name, payload) {
                if (!internals) return;
                internals.invoke("plugin:event|emit", {
                    event: name,
                    payload: payload,
                });
            },
        };
    } catch (e) {
        try {
            window.__TAURI_INTERNALS__?.invoke("plugin:event|emit", {
                event: "injected-script-error",
                payload: { script: "shared", error: String(e) },
            });
        } catch {}
    }
})();
