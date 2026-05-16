import { useEffect, useRef, useState } from "react";
import { Store } from "@tauri-apps/plugin-store";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
    Cog6ToothIcon,
    WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";

type TabId = "general" | "advanced";
type Theme = "light" | "dark" | "system";
type GmailTheme = "light" | "dark";

type Prefs = {
    theme: Theme;
    gmailTheme: GmailTheme;
    defaultZoom: number;
    showDockBadge: boolean;
    launchAtStartup: boolean;
    crashReporting: boolean;
};

const ZOOM_OPTIONS = [130, 120, 110, 100, 90, 80, 70] as const;

const TABS: { id: TabId; label: string; Icon: typeof Cog6ToothIcon }[] = [
    { id: "general", label: "General", Icon: Cog6ToothIcon },
    { id: "advanced", label: "Advanced", Icon: WrenchScrewdriverIcon },
];

export default function Preferences() {
    const [activeTab, setActiveTab] = useState<TabId>("general");
    const [theme, setTheme] = useState<Theme>("system");
    const [gmailTheme, setGmailTheme] = useState<GmailTheme>("light");
    const [defaultZoom, setDefaultZoom] = useState<number>(100);
    const [showDockBadge, setShowDockBadge] = useState(true);
    const [launchAtStartup, setLaunchAtStartup] = useState(false);
    const [crashReporting, setCrashReporting] = useState(false);
    const [crashReportingAvailable, setCrashReportingAvailable] =
        useState(true);
    const [store, setStore] = useState<Store | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [updateStatus, setUpdateStatus] = useState<
        | "idle"
        | "checking"
        | "up-to-date"
        | "available"
        | "installing"
        | "error"
    >("idle");
    const [updateMessage, setUpdateMessage] = useState("");
    const pendingUpdate = useRef<Update | null>(null);

    async function checkForUpdates() {
        setUpdateStatus("checking");
        setUpdateMessage("");
        try {
            const update = await check();
            pendingUpdate.current = update;
            if (update) {
                setUpdateStatus("available");
                setUpdateMessage(`Update available: v${update.version}`);
            } else {
                setUpdateStatus("up-to-date");
                setUpdateMessage("You're on the latest version.");
            }
        } catch (e) {
            setUpdateStatus("error");
            setUpdateMessage(String(e));
        }
    }

    async function installUpdate() {
        if (!pendingUpdate.current) return;
        setUpdateStatus("installing");
        setUpdateMessage("Downloading…");
        try {
            await pendingUpdate.current.downloadAndInstall();
            await relaunch();
        } catch (e) {
            setUpdateStatus("error");
            setUpdateMessage(String(e));
        }
    }

    useEffect(() => {
        invoke<boolean>("crash_reporting_available")
            .then(setCrashReportingAvailable)
            .catch(() => setCrashReportingAvailable(false));
    }, []);

    useEffect(() => {
        void (async () => {
            try {
                const s = await Store.load("preferences.json");
                setStore(s);
                if ((await s.get("enableNotifications")) !== undefined) {
                    await s.delete("enableNotifications");
                    await s.save();
                }
                setTheme((await s.get<Theme>("theme")) ?? "system");
                setGmailTheme(
                    (await s.get<GmailTheme>("gmailTheme")) ?? "light",
                );
                setDefaultZoom((await s.get<number>("defaultZoom")) ?? 100);
                setShowDockBadge(
                    (await s.get<boolean>("showDockBadge")) ?? true,
                );
                setLaunchAtStartup(
                    (await s.get<boolean>("launchAtStartup")) ?? false,
                );
                setCrashReporting(
                    (await s.get<boolean>("crashReporting")) ?? false,
                );
            } catch (e) {
                console.error("Failed to load preferences, using defaults:", e);
            } finally {
                setLoaded(true);
            }
        })();
    }, []);

    useEffect(() => {
        const html = document.documentElement;
        const apply = (isDark: boolean) => {
            html.classList.toggle("dark", isDark);
            html.style.colorScheme = isDark ? "dark" : "light";
        };

        if (theme === "light") {
            apply(false);
            return;
        }
        if (theme === "dark") {
            apply(true);
            return;
        }
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        apply(media.matches);
        const handler = (e: MediaQueryListEvent) => apply(e.matches);
        media.addEventListener("change", handler);
        return () => media.removeEventListener("change", handler);
    }, [theme]);

    // Snapshot of what's on disk so initial load doesn't re-save every key.
    const lastPersisted = useRef<Prefs | null>(null);
    useEffect(() => {
        if (!loaded || !store) return;
        const current: Prefs = {
            theme,
            gmailTheme,
            defaultZoom,
            showDockBadge,
            launchAtStartup,
            crashReporting,
        };
        const prev = lastPersisted.current;
        if (!prev) {
            lastPersisted.current = current;
            return;
        }

        const changes: Array<{
            key: keyof Prefs;
            value: unknown;
            event?: string;
        }> = [];
        if (prev.theme !== current.theme) {
            changes.push({
                key: "theme",
                value: current.theme,
                event: "theme-changed",
            });
        }
        if (prev.gmailTheme !== current.gmailTheme) {
            changes.push({
                key: "gmailTheme",
                value: current.gmailTheme,
                event: "gmail-theme-changed",
            });
        }
        if (prev.defaultZoom !== current.defaultZoom) {
            changes.push({
                key: "defaultZoom",
                value: current.defaultZoom,
                event: "default-zoom-changed",
            });
        }
        if (prev.showDockBadge !== current.showDockBadge) {
            changes.push({
                key: "showDockBadge",
                value: current.showDockBadge,
                event: "badge-pref-changed",
            });
        }
        if (prev.launchAtStartup !== current.launchAtStartup) {
            changes.push({
                key: "launchAtStartup",
                value: current.launchAtStartup,
                event: "launch-at-startup-changed",
            });
        }
        if (prev.crashReporting !== current.crashReporting) {
            changes.push({
                key: "crashReporting",
                value: current.crashReporting,
            });
        }
        if (changes.length === 0) return;

        // Advance synchronously so an interleaved render doesn't re-diff
        // the same change.
        lastPersisted.current = current;
        void (async () => {
            for (const { key, value } of changes) {
                await store.set(key, value);
            }
            await store.save();
            for (const { event } of changes) {
                if (event) await emit(event);
            }
        })();
    }, [
        theme,
        gmailTheme,
        defaultZoom,
        showDockBadge,
        launchAtStartup,
        crashReporting,
        loaded,
        store,
    ]);

    const activeLabel =
        TABS.find((t) => t.id === activeTab)?.label ?? "Preferences";

    useEffect(() => {
        document.title = activeLabel;
        void getCurrentWindow().setTitle(activeLabel);
    }, [activeLabel]);

    return (
        <div className="flex h-screen flex-col bg-neutral-100 font-[system-ui] text-[13px] text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
            <header className="border-b border-neutral-200/80 bg-neutral-100 dark:border-neutral-700/80 dark:bg-neutral-900">
                <nav className="flex justify-center gap-1 px-4 pt-3 pb-2">
                    {TABS.map(({ id, label, Icon }) => {
                        const active = activeTab === id;
                        return (
                            <button
                                key={id}
                                type="button"
                                className={`flex w-22 flex-col items-center gap-1 rounded-md px-2 py-1.5 text-neutral-700 dark:text-neutral-300 ${
                                    active
                                        ? "bg-neutral-200/60 dark:bg-neutral-700/60"
                                        : "hover:bg-neutral-200/40 dark:hover:bg-neutral-700/40"
                                }`}
                                onClick={() => setActiveTab(id)}
                            >
                                <Icon className="h-6 w-6" />
                                <span className="text-[11px] leading-none">
                                    {label}
                                </span>
                            </button>
                        );
                    })}
                </nav>
            </header>

            <section className="flex-1 overflow-auto px-6 py-5 space-y-4">
                {activeTab === "general" && (
                    <div className="flex h-full flex-col">
                        <div className="space-y-4">
                            <div>
                                <label className="flex items-center gap-2.5">
                                    <span>Theme</span>
                                    <select
                                        value={theme}
                                        onChange={(e) =>
                                            setTheme(e.target.value as Theme)
                                        }
                                        className="rounded border border-neutral-300 bg-white px-2 py-1 text-[13px] dark:border-neutral-700 dark:bg-neutral-800"
                                    >
                                        <option value="system">System</option>
                                        <option value="light">Light</option>
                                        <option value="dark">Dark</option>
                                    </select>
                                </label>
                            </div>

                            <div>
                                <label className="flex items-center gap-2.5">
                                    <span>Gmail theme</span>
                                    <select
                                        value={gmailTheme}
                                        onChange={(e) =>
                                            setGmailTheme(
                                                e.target.value as GmailTheme,
                                            )
                                        }
                                        className="rounded border border-neutral-300 bg-white px-2 py-1 text-[13px] dark:border-neutral-700 dark:bg-neutral-800"
                                    >
                                        <option value="light">Light</option>
                                        <option value="dark">Dark</option>
                                    </select>
                                </label>
                            </div>

                            <div>
                                <label className="flex items-center gap-2.5">
                                    <span>Default zoom</span>
                                    <select
                                        value={defaultZoom}
                                        onChange={(e) =>
                                            setDefaultZoom(
                                                Number(e.target.value),
                                            )
                                        }
                                        className="rounded border border-neutral-300 bg-white px-2 py-1 text-[13px] dark:border-neutral-700 dark:bg-neutral-800"
                                    >
                                        {ZOOM_OPTIONS.map((z) => (
                                            <option key={z} value={z}>
                                                {z}%
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>

                            <div>
                                <label className="flex items-center gap-2.5">
                                    <input
                                        type="checkbox"
                                        checked={showDockBadge}
                                        onChange={(e) =>
                                            setShowDockBadge(e.target.checked)
                                        }
                                        className="h-4 w-4 accent-blue-600"
                                    />
                                    <span>Show unread count in Dock icon</span>
                                </label>
                            </div>

                            <div>
                                <label className="flex items-center gap-2.5">
                                    <input
                                        type="checkbox"
                                        checked={launchAtStartup}
                                        onChange={(e) =>
                                            setLaunchAtStartup(e.target.checked)
                                        }
                                        className="h-4 w-4 accent-blue-600"
                                    />
                                    <span>Launch Owlbox at login</span>
                                </label>
                                <p className="ml-6.5 mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                                    Owlbox opens automatically when you log in
                                    to your Mac.
                                </p>
                            </div>
                        </div>
                        <div className="mt-auto flex flex-col items-center gap-1 pt-4">
                            {updateMessage && (
                                <p
                                    className={`text-[11px] ${
                                        updateStatus === "error"
                                            ? "text-red-600 dark:text-red-400"
                                            : "text-neutral-500 dark:text-neutral-400"
                                    }`}
                                >
                                    {updateMessage}
                                </p>
                            )}
                            <button
                                type="button"
                                onClick={() => {
                                    if (updateStatus === "available") {
                                        void installUpdate();
                                    } else {
                                        void checkForUpdates();
                                    }
                                }}
                                disabled={
                                    updateStatus === "checking" ||
                                    updateStatus === "installing"
                                }
                                className="rounded border border-neutral-300 bg-white px-2 py-1 text-[13px] hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                            >
                                {updateStatus === "checking" && "Checking…"}
                                {updateStatus === "installing" && "Installing…"}
                                {updateStatus === "available" &&
                                    "Install update"}
                                {(updateStatus === "idle" ||
                                    updateStatus === "up-to-date" ||
                                    updateStatus === "error") &&
                                    "Check for updates"}
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === "advanced" && (
                    <div className="flex h-full flex-col">
                        <div>
                            <label className="flex items-center gap-2.5">
                                <input
                                    type="checkbox"
                                    checked={
                                        crashReporting &&
                                        crashReportingAvailable
                                    }
                                    onChange={(e) =>
                                        setCrashReporting(e.target.checked)
                                    }
                                    disabled={!crashReportingAvailable}
                                    className="h-4 w-4 accent-blue-600 disabled:opacity-50"
                                />
                                <span
                                    className={
                                        !crashReportingAvailable
                                            ? "text-neutral-500"
                                            : ""
                                    }
                                >
                                    Share anonymous crash reports
                                </span>
                            </label>
                            <p className="ml-6.5 mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                                {!crashReportingAvailable
                                    ? "Not available in this build."
                                    : "Helps catch bugs. No email content is ever sent. Off by default."}
                            </p>
                        </div>
                        <div className="mt-auto flex justify-center pt-4">
                            <button
                                type="button"
                                onClick={() => void relaunch()}
                                className="rounded border border-neutral-300 bg-white px-2 py-1 text-[13px] hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                            >
                                Restart now
                            </button>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}
