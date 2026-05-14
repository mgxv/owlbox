import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SHARED = readFileSync(join(here, "../injected/shared.js"), "utf-8");
const TITLE_SYNC = readFileSync(join(here, "../injected/title-sync.js"), "utf-8");

// `runScripts: 'outside-only'` is required for win.eval to bind `window`
// inside the IIFEs; without it the injected scripts silently no-op.
async function setup({ title = "", path = "/mail/u/0/", hash = "" } = {}) {
    const dom = new JSDOM(
        `<!doctype html><html><head><title>${title}</title></head><body></body></html>`,
        {
            url: `https://mail.google.com${path}${hash}`,
            runScripts: "outside-only",
        },
    );
    const win = dom.window;
    const emitted = [];
    win.__TAURI_INTERNALS__ = {
        invoke(cmd, args) {
            if (cmd === "plugin:event|emit") {
                emitted.push({ event: args.event, payload: args.payload });
            }
            return Promise.resolve();
        },
    };
    win.eval(SHARED);
    win.eval(TITLE_SYNC);

    // jsdom starts in readyState=loading, so onReady defers tick() until DCL.
    if (win.document.readyState === "loading") {
        await new Promise((resolve) => {
            win.document.addEventListener("DOMContentLoaded", resolve, { once: true });
        });
    }
    await new Promise((r) => setTimeout(r, 0));
    return { win, emitted };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("title-sync: initial tick on load", () => {
    it("emits unread-count for inbox list view with no parens (count=0)", async () => {
        const { emitted } = await setup({
            title: "Inbox - alice@example.com - Gmail",
            hash: "#inbox",
        });
        expect(emitted).toContainEqual({ event: "unread-count", payload: 0 });
    });

    it("emits parsed unread count when title has (N)", async () => {
        const { emitted } = await setup({
            title: "Inbox (5) - alice@example.com - Gmail",
            hash: "#inbox",
        });
        expect(emitted).toContainEqual({ event: "unread-count", payload: 5 });
    });

    it("parses thousand-separated counts", async () => {
        const { emitted } = await setup({
            title: "Inbox (1,234) - alice@example.com - Gmail",
            hash: "#inbox",
        });
        expect(emitted).toContainEqual({ event: "unread-count", payload: 1234 });
    });

    it("emits account-email extracted from title", async () => {
        const { emitted } = await setup({
            title: "Inbox (3) - test.user+tag@example.co.uk - Gmail",
            hash: "#inbox",
        });
        expect(emitted).toContainEqual({
            event: "account-email",
            payload: "test.user+tag@example.co.uk",
        });
    });
});

describe("title-sync: isInboxListView gating", () => {
    it("does NOT emit unread-count on a thread view (#inbox/<id>)", async () => {
        const { emitted } = await setup({
            title: "Re: Project plan (3) - alice@example.com - Gmail",
            hash: "#inbox/FMfcgzQVxSjpnGZHrXqDXdjlqfWlNzPg",
        });
        const unread = emitted.filter((e) => e.event === "unread-count");
        expect(unread).toEqual([]);
    });

    it("DOES emit unread-count on paginated inbox (#inbox/p2)", async () => {
        const { emitted } = await setup({
            title: "Inbox (12) - alice@example.com - Gmail",
            hash: "#inbox/p2",
        });
        expect(emitted).toContainEqual({ event: "unread-count", payload: 12 });
    });

    it("DOES emit unread-count when hash is empty", async () => {
        const { emitted } = await setup({
            title: "Inbox (7) - alice@example.com - Gmail",
            hash: "",
        });
        expect(emitted).toContainEqual({ event: "unread-count", payload: 7 });
    });

    it("does NOT emit unread-count for non-inbox labels (#sent)", async () => {
        const { emitted } = await setup({
            title: "Sent Mail - alice@example.com - Gmail",
            hash: "#sent",
        });
        const unread = emitted.filter((e) => e.event === "unread-count");
        expect(unread).toEqual([]);
    });

    it("still emits account-email on non-inbox views", async () => {
        const { emitted } = await setup({
            title: "Sent Mail - alice@example.com - Gmail",
            hash: "#sent",
        });
        expect(emitted).toContainEqual({
            event: "account-email",
            payload: "alice@example.com",
        });
    });
});

describe("title-sync: reacts to title mutations", () => {
    it("emits a new unread-count when the title changes", async () => {
        const { win, emitted } = await setup({
            title: "Inbox - a@b.com - Gmail",
            hash: "#inbox",
        });
        emitted.length = 0;

        win.document.title = "Inbox (9) - a@b.com - Gmail";
        await flush();

        expect(emitted).toContainEqual({ event: "unread-count", payload: 9 });
    });

    it("deduplicates: same count twice only emits once", async () => {
        const { win, emitted } = await setup({
            title: "Inbox (4) - a@b.com - Gmail",
            hash: "#inbox",
        });
        emitted.length = 0;

        win.document.title = "Inbox (4) - a@b.com - Gmail";
        await flush();

        const unread = emitted.filter((e) => e.event === "unread-count");
        expect(unread).toEqual([]);
    });

    it("emits new account-email when the active account changes", async () => {
        const { win, emitted } = await setup({
            title: "Inbox - a@b.com - Gmail",
            hash: "#inbox",
        });
        emitted.length = 0;

        win.document.title = "Inbox - c@d.com - Gmail";
        await flush();

        expect(emitted).toContainEqual({
            event: "account-email",
            payload: "c@d.com",
        });
    });
});

describe("title-sync: reacts to hashchange", () => {
    it("suppresses stale count when title lags hash into a thread", async () => {
        // Real Gmail behavior: the "(4)" can linger in the title for a tick
        // after navigating into #inbox/<id>. isInboxListView must gate it.
        const { win, emitted } = await setup({
            title: "Inbox (4) - a@b.com - Gmail",
            hash: "#inbox",
        });
        emitted.length = 0;

        win.location.hash = "#inbox/FMfcgzQabc123";
        win.dispatchEvent(new win.Event("hashchange"));
        await flush();

        const unread = emitted.filter((e) => e.event === "unread-count");
        expect(unread).toEqual([]);
    });
});

describe("title-sync: defensive parsing", () => {
    it("treats no-paren title as count=0 on inbox view", async () => {
        const { emitted } = await setup({
            title: "Inbox - a@b.com - Gmail",
            hash: "#inbox",
        });
        expect(emitted).toContainEqual({ event: "unread-count", payload: 0 });
    });

    it("does not emit account-email when title lacks an address", async () => {
        const { emitted } = await setup({
            title: "Loading…",
            hash: "#inbox",
        });
        const email = emitted.filter((e) => e.event === "account-email");
        expect(email).toEqual([]);
    });
});

describe("title-sync: title-format-unknown diagnostic", () => {
    it("does not fire for normal (N) titles", async () => {
        const { emitted } = await setup({
            title: "Inbox (5) - a@b.com - Gmail",
            hash: "#inbox",
        });
        expect(emitted.some((e) => e.event === "title-format-unknown")).toBe(false);
    });

    it("does not fire for parens-less inbox titles with no extra digits", async () => {
        const { emitted } = await setup({
            title: "Inbox - a@b.com - Gmail",
            hash: "#inbox",
        });
        expect(emitted.some((e) => e.event === "title-format-unknown")).toBe(false);
    });

    it("fires when title has digits but no (N) match on inbox view", async () => {
        const { emitted } = await setup({
            title: "Inbox [7] - a@b.com - Gmail",
            hash: "#inbox",
        });
        expect(emitted).toContainEqual({
            event: "title-format-unknown",
            payload: "Inbox [7] - <email> - Gmail",
        });
    });

    it("scrubs the account email from the diagnostic payload", async () => {
        const { emitted } = await setup({
            title: "Bandeja de entrada [3] - alice@example.com - Gmail",
            hash: "#inbox",
        });
        const diag = emitted.find((e) => e.event === "title-format-unknown");
        expect(diag).toBeDefined();
        expect(diag.payload).not.toContain("alice@example.com");
        expect(diag.payload).toContain("<email>");
    });

    it("fires at most once per session even on repeated title changes", async () => {
        const { win, emitted } = await setup({
            title: "Inbox [7] - a@b.com - Gmail",
            hash: "#inbox",
        });
        win.document.title = "Inbox [8] - a@b.com - Gmail";
        await flush();
        win.document.title = "Inbox [9] - a@b.com - Gmail";
        await flush();

        const diag = emitted.filter((e) => e.event === "title-format-unknown");
        expect(diag).toHaveLength(1);
    });

    it("does not fire on a thread view even with unparseable digits", async () => {
        const { emitted } = await setup({
            title: "Some Thread [7] - a@b.com - Gmail",
            hash: "#inbox/FMfcgz123",
        });
        expect(emitted.some((e) => e.event === "title-format-unknown")).toBe(false);
    });
});
