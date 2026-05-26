(function () {
    try {
        if (!window.__owlbox_genesis__) return;
        const owl = window.__owlbox_genesis__;

        const UNREAD_RE = /\(([\d,]+)\)/;

        // Thread views (#inbox/<id>) have no count in the title — matching them
        // would clobber the badge with stale zeros.
        function isInboxListView() {
            const h = location.hash || "";
            if (h === "" || h === "#" || h === "#inbox") return true;
            if (h.startsWith("#inbox?")) return true;
            return /^#inbox\/p\d+(?:\?|$)/.test(h);
        }

        let lastCount = -1;
        let lastEmail = "";
        let warnedFormat = false;

        function readCount() {
            if (!isInboxListView()) return null;
            const title = document.title || "";
            const m = title.match(UNREAD_RE);
            if (m) {
                const n = parseInt(m[1].replace(/,/g, ""), 10);
                return Number.isNaN(n) ? 0 : n;
            }
            // No (N) match. If digits remain after stripping the account email,
            // Gmail probably changed the count format — flag once for diagnosis.
            if (!warnedFormat && /\d/.test(title.replace(owl.EMAIL_RE, ""))) {
                warnedFormat = true;
                owl.emit(
                    "title-format-unknown",
                    title.replace(owl.EMAIL_RE, "<email>"),
                );
            }
            return 0;
        }

        function readEmail() {
            const title = document.title || "";
            const m = title.match(owl.EMAIL_RE);
            return m ? m[0] : null;
        }

        function tick() {
            const count = readCount();
            if (count !== null && count !== lastCount) {
                lastCount = count;
                owl.emit("unread-count", count);
            }
            const email = readEmail();
            if (email && email !== lastEmail) {
                lastEmail = email;
                owl.emit("account-email", email);
            }
        }

        owl.onReady(() => {
            const titleEl = document.querySelector("title");
            if (titleEl) {
                new MutationObserver(tick).observe(titleEl, {
                    childList: true,
                    characterData: true,
                    subtree: true,
                });
            }
            window.addEventListener("hashchange", tick);
            tick();
        });
    } catch (e) {
        try {
            window.__TAURI_INTERNALS__?.invoke("plugin:event|emit", {
                event: "injected-script-error",
                payload: { script: "title-sync", error: String(e) },
            });
        } catch {}
    }
})();
