import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
    Cog6ToothIcon,
    SwatchIcon,
    WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";

import { usePreferences, type Theme, type GmailTheme } from "./usePreferences";

type TabId = "general" | "appearance" | "advanced";

const ZOOM_OPTIONS = [70, 80, 90, 100, 110, 120, 130] as const;

const TABS: { id: TabId; label: string; Icon: typeof Cog6ToothIcon }[] = [
    { id: "general", label: "General", Icon: Cog6ToothIcon },
    { id: "appearance", label: "Appearance", Icon: SwatchIcon },
    { id: "advanced", label: "Advanced", Icon: WrenchScrewdriverIcon },
];

type UpdateState =
    | { status: "idle" }
    | { status: "checking" }
    | { status: "up-to-date" }
    | { status: "available"; version: string }
    | { status: "installing" }
    | { status: "error"; message: string };

function UpdateChecker() {
    const [state, setState] = useState<UpdateState>({ status: "idle" });
    const pendingUpdate = useRef<Update | null>(null);

    async function checkForUpdates() {
        setState({ status: "checking" });
        try {
            const update = await check();
            pendingUpdate.current = update;
            setState(
                update
                    ? { status: "available", version: update.version }
                    : { status: "up-to-date" },
            );
        } catch (e) {
            setState({ status: "error", message: String(e) });
        }
    }

    async function installUpdate() {
        if (!pendingUpdate.current) return;
        setState({ status: "installing" });
        try {
            await pendingUpdate.current.downloadAndInstall();
            await relaunch();
        } catch (e) {
            setState({ status: "error", message: String(e) });
        }
    }

    const busy = state.status === "checking" || state.status === "installing";
    const message =
        state.status === "up-to-date"
            ? "You're on the latest version."
            : state.status === "available"
              ? `Update available: v${state.version}`
              : state.status === "error"
                ? state.message
                : null;

    return (
        <div className="mt-auto flex flex-col items-center gap-1 pt-4">
            {message && (
                <p
                    className={`text-[11px] ${
                        state.status === "error"
                            ? "text-red-600 dark:text-red-400"
                            : "text-neutral-500 dark:text-neutral-400"
                    }`}
                >
                    {message}
                </p>
            )}
            <button
                type="button"
                onClick={() => {
                    if (state.status === "available") {
                        void installUpdate();
                    } else {
                        void checkForUpdates();
                    }
                }}
                disabled={busy}
                className="rounded border border-neutral-300 bg-white px-2 py-1 text-[13px] hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700"
            >
                {state.status === "checking" && "Checking…"}
                {state.status === "installing" && "Installing…"}
                {state.status === "available" && "Install update"}
                {(state.status === "idle" ||
                    state.status === "up-to-date" ||
                    state.status === "error") &&
                    "Check for updates"}
            </button>
        </div>
    );
}

export default function Preferences() {
    const [activeTab, setActiveTab] = useState<TabId>("general");
    const [crashReportingAvailable, setCrashReportingAvailable] =
        useState(true);

    const {
        loaded,
        theme,
        setTheme,
        gmailTheme,
        setGmailTheme,
        defaultZoom,
        setDefaultZoom,
        showDockBadge,
        setShowDockBadge,
        launchAtStartup,
        setLaunchAtStartup,
        crashReporting,
        setCrashReporting,
    } = usePreferences();

    useEffect(() => {
        invoke<boolean>("crash_reporting_available")
            .then(setCrashReportingAvailable)
            .catch(() => setCrashReportingAvailable(false));
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

    const activeLabel =
        TABS.find((t) => t.id === activeTab)?.label ?? "Preferences";

    useEffect(() => {
        document.title = activeLabel;
        void getCurrentWindow().setTitle(activeLabel);
    }, [activeLabel]);

    if (!loaded) return null;

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
                        <UpdateChecker />
                    </div>
                )}

                {activeTab === "appearance" && (
                    <div className="space-y-4">
                        <div>
                            <label className="flex items-center gap-2.5">
                                <span>System theme</span>
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
                                        setDefaultZoom(Number(e.target.value))
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
