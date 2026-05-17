(function () {
    try {
        if (!window.__owlbox__) return;

        function OwlboxNotification(title, options) {
            options = options || {};
            if (window.__owlbox__) {
                window.__owlbox__.emit("notification", {
                    title: String(title),
                    body: options.body != null ? String(options.body) : "",
                });
            }
            this.close = function () {};
            this.addEventListener = function () {};
            this.removeEventListener = function () {};
            this.onclick = null;
            this.onshow = null;
            this.onclose = null;
            this.onerror = null;
        }

        OwlboxNotification.permission = "granted";
        OwlboxNotification.requestPermission = function () {
            return Promise.resolve("granted");
        };

        window.Notification = OwlboxNotification;

        // Must be true so Gmail fires window.Notification — but overriding at
        // document start breaks Dark Reader (sees a hidden page on init).
        // DOMContentLoaded gives DR time to initialize with the real state.
        document.addEventListener("DOMContentLoaded", () => {
            Object.defineProperty(document, "visibilityState", {
                get: () => "hidden",
                configurable: true,
            });
            Object.defineProperty(document, "hidden", {
                get: () => true,
                configurable: true,
            });
        });
    } catch (e) {
        try {
            window.__TAURI_INTERNALS__?.invoke("plugin:event|emit", {
                event: "injected-script-error",
                payload: { script: "notifications", error: String(e) },
            });
        } catch {}
    }
})();
