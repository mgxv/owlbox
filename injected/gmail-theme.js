(function () {
    try {
        if (!window.__owlbox__) return;
        if (!window.DarkReader) return;

        const owl = window.__owlbox__;
        const STORAGE_KEY = "owlbox_gmail_theme";

        function apply(mode) {
            try {
                sessionStorage.setItem(STORAGE_KEY, mode);
            } catch {}
            try {
                if (mode === "dark") {
                    window.DarkReader.enable(
                        {
                            brightness: 100,
                            contrast: 100,
                            sepia: 0,
                            scrollbarColor: "",
                        },
                        {
                            ignoreImageAnalysis: ["*"],
                            disableStyleSheetsProxy: true,
                        },
                    );
                } else {
                    window.DarkReader.disable();
                }
            } catch (e) {
                owl.emit("injected-script-error", {
                    script: "gmail-theme",
                    error: String(e),
                });
            }
        }

        window.OwlboxGmailTheme = { set: apply };

        let stored = null;
        try {
            stored = sessionStorage.getItem(STORAGE_KEY);
        } catch {}
        const initial =
            stored || window.__OWLBOX_GMAIL_THEME_INITIAL__ || "light";
        apply(initial);
    } catch (e) {
        try {
            window.__TAURI_INTERNALS__?.invoke("plugin:event|emit", {
                event: "injected-script-error",
                payload: { script: "gmail-theme", error: String(e) },
            });
        } catch {}
    }
})();
