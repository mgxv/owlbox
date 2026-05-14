import { useEffect, useRef, useState } from "react";
import { Store } from "@tauri-apps/plugin-store";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
    Cog6ToothIcon,
    WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";

type TabId = "general" | "advanced";
type Theme = "light" | "dark" | "system";

type Prefs = {
    theme: Theme;
    showDockBadge: boolean;
    launchAtStartup: boolean;
    crashReporting: boolean;
};

const TABS: { id: TabId; label: string; Icon: typeof Cog6ToothIcon }[] = [
    { id: "general", label: "General", Icon: Cog6ToothIcon },
    { id: "advanced", label: "Advanced", Icon: WrenchScrewdriverIcon },
];

export default function Preferences() {
    const [activeTab, setActiveTab] = useState<TabId>("general");
    const [theme, setTheme] = useState<Theme>("system");
    const [showDockBadge, setShowDockBadge] = useState(true);
    const [launchAtStartup, setLaunchAtStartup] = useState(false);
    const [crashReporting, setCrashReporting] = useState(false);
    const [store, setStore] = useState<Store | null>(null);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const s = await Store.load("preferences.json");
                setStore(s);
                if ((await s.get("enableNotifications")) !== undefined) {
                    await s.delete("enableNotifications");
                    await s.save();
                }
                setTheme((await s.get<Theme>("theme")) ?? "system");
                setShowDockBadge((await s.get<boolean>("showDockBadge")) ?? true);
                setLaunchAtStartup((await s.get<boolean>("launchAtStartup")) ?? false);
                setCrashReporting((await s.get<boolean>("crashReporting")) ?? false);
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
        const current: Prefs = { theme, showDockBadge, launchAtStartup, crashReporting };
        const prev = lastPersisted.current;
        if (!prev) {
            lastPersisted.current = current;
            return;
        }

        const changes: Array<{ key: keyof Prefs; value: unknown; event?: string }> = [];
        if (prev.theme !== current.theme) {
            changes.push({ key: "theme", value: current.theme, event: "theme-changed" });
        }
        if (prev.showDockBadge !== current.showDockBadge) {
            changes.push({ key: "showDockBadge", value: current.showDockBadge, event: "badge-pref-changed" });
        }
        if (prev.launchAtStartup !== current.launchAtStartup) {
            changes.push({ key: "launchAtStartup", value: current.launchAtStartup, event: "launch-at-startup-changed" });
        }
        if (prev.crashReporting !== current.crashReporting) {
            changes.push({ key: "crashReporting", value: current.crashReporting });
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
    }, [theme, showDockBadge, launchAtStartup, crashReporting, loaded, store]);

    const activeLabel = TABS.find((t) => t.id === activeTab)?.label ?? "Preferences";

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
                                className={`flex w-22 flex-col items-center gap-1 rounded-md px-2 py-1.5 text-neutral-700 dark:text-neutral-300 ${active
                                    ? "bg-neutral-200/60 dark:bg-neutral-700/60"
                                    : "hover:bg-neutral-200/40 dark:hover:bg-neutral-700/40"
                                    }`}
                                onClick={() => setActiveTab(id)}
                            >
                                <Icon className="h-6 w-6" />
                                <span className="text-[11px] leading-none">{label}</span>
                            </button>
                        );
                    })}
                </nav>
            </header>

            <section className="flex-1 overflow-auto px-6 py-5 space-y-4">
                {activeTab === "general" && (
                    <>
                        <div>
                            <label className="flex items-center gap-2.5">
                                <span>Theme</span>
                                <select
                                    value={theme}
                                    onChange={(e) => setTheme(e.target.value as Theme)}
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
                                <input
                                    type="checkbox"
                                    checked={showDockBadge}
                                    onChange={(e) => setShowDockBadge(e.target.checked)}
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
                                    onChange={(e) => setLaunchAtStartup(e.target.checked)}
                                    className="h-4 w-4 accent-blue-600"
                                />
                                <span>Launch Owlbox at login</span>
                            </label>
                            <p className="ml-6.5 mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                                Owlbox opens automatically when you log in to your Mac.
                            </p>
                        </div>
                    </>
                )}

                {activeTab === "advanced" && (
                    <div>
                        <label className="flex items-center gap-2.5">
                            <input
                                type="checkbox"
                                checked={crashReporting}
                                onChange={(e) => setCrashReporting(e.target.checked)}
                                className="h-4 w-4 accent-blue-600"
                            />
                            <span>Share anonymous crash reports</span>
                        </label>
                        <p className="ml-6.5 mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                            Helps catch bugs. No email content is ever sent. Off by default.
                        </p>
                    </div>
                )}
            </section>
        </div>
    );
}
