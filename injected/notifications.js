(function () {
    try {
        if (!window.__owlbox_genesis__) return;

        function OwlboxGenesisNotification(title, options) {
            options = options || {};
            if (window.__owlbox_genesis__) {
                window.__owlbox_genesis__.emit("notification", {
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

        OwlboxGenesisNotification.permission = "granted";
        OwlboxGenesisNotification.requestPermission = function () {
            return Promise.resolve("granted");
        };

        window.Notification = OwlboxGenesisNotification;

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
