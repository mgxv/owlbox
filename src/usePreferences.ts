import { useEffect, useRef, useState } from "react";
import { Store } from "@tauri-apps/plugin-store";
import { emit } from "@tauri-apps/api/event";

export type Theme = "light" | "dark" | "system";
export type GmailTheme = "light" | "dark";

export type Prefs = {
    theme: Theme;
    gmailTheme: GmailTheme;
    defaultZoom: number;
    showDockBadge: boolean;
    launchAtStartup: boolean;
    crashReporting: boolean;
};

type UsePreferences = Prefs & {
    loaded: boolean;
    setTheme: (v: Theme) => void;
    setGmailTheme: (v: GmailTheme) => void;
    setDefaultZoom: (v: number) => void;
    setShowDockBadge: (v: boolean) => void;
    setLaunchAtStartup: (v: boolean) => void;
    setCrashReporting: (v: boolean) => void;
};

export function usePreferences(): UsePreferences {
    const [theme, setTheme] = useState<Theme>("system");
    const [gmailTheme, setGmailTheme] = useState<GmailTheme>("light");
    const [defaultZoom, setDefaultZoom] = useState<number>(100);
    const [showDockBadge, setShowDockBadge] = useState(true);
    const [launchAtStartup, setLaunchAtStartup] = useState(false);
    const [crashReporting, setCrashReporting] = useState(false);
    const [store, setStore] = useState<Store | null>(null);
    const [loaded, setLoaded] = useState(false);
    const lastPersisted = useRef<Prefs | null>(null);

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
        if (prev.theme !== current.theme)
            changes.push({
                key: "theme",
                value: current.theme,
                event: "theme-changed",
            });
        if (prev.gmailTheme !== current.gmailTheme)
            changes.push({
                key: "gmailTheme",
                value: current.gmailTheme,
                event: "gmail-theme-changed",
            });
        if (prev.defaultZoom !== current.defaultZoom)
            changes.push({
                key: "defaultZoom",
                value: current.defaultZoom,
                event: "default-zoom-changed",
            });
        if (prev.showDockBadge !== current.showDockBadge)
            changes.push({
                key: "showDockBadge",
                value: current.showDockBadge,
                event: "badge-pref-changed",
            });
        if (prev.launchAtStartup !== current.launchAtStartup)
            changes.push({
                key: "launchAtStartup",
                value: current.launchAtStartup,
                event: "launch-at-startup-changed",
            });
        if (prev.crashReporting !== current.crashReporting)
            changes.push({
                key: "crashReporting",
                value: current.crashReporting,
            });
        if (changes.length === 0) return;

        lastPersisted.current = current;
        void (async () => {
            for (const { key, value } of changes) await store.set(key, value);
            await store.save();
            for (const { event } of changes) if (event) await emit(event);
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

    return {
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
    };
}
