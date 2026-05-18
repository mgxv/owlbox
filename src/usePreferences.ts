import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import { emit } from "@tauri-apps/api/event";
import {
    PREFS_STORE,
    KEY_THEME,
    KEY_DEFAULT_ZOOM,
    KEY_SHOW_DOCK_BADGE,
    KEY_LAUNCH_AT_STARTUP,
    KEY_CRASH_REPORTING,
    KEY_NOTIFICATIONS_ENABLED,
    EVENT_THEME_CHANGED,
    EVENT_DEFAULT_ZOOM_CHANGED,
    EVENT_BADGE_PREF_CHANGED,
    EVENT_LAUNCH_AT_STARTUP_CHANGED,
} from "./constants";

export type Theme = "light" | "dark" | "system";

export type Prefs = {
    theme: Theme;
    defaultZoom: number;
    showDockBadge: boolean;
    launchAtStartup: boolean;
    crashReporting: boolean;
    notificationsEnabled: boolean;
};

type UsePreferences = Prefs & {
    loaded: boolean;
    setTheme: (v: Theme) => void;
    setDefaultZoom: (v: number) => void;
    setShowDockBadge: (v: boolean) => void;
    setLaunchAtStartup: (v: boolean) => void;
    setCrashReporting: (v: boolean) => void;
    setNotificationsEnabled: (v: boolean) => void;
};

export function usePreferences(): UsePreferences {
    const [theme, setTheme] = useState<Theme>("system");
    const [defaultZoom, setDefaultZoom] = useState<number>(100);
    const [showDockBadge, setShowDockBadge] = useState(true);
    const [launchAtStartup, setLaunchAtStartup] = useState(false);
    const [crashReporting, setCrashReporting] = useState(false);
    const [notificationsEnabled, setNotificationsEnabled] = useState(false);
    const [store, setStore] = useState<Store | null>(null);
    const [loaded, setLoaded] = useState(false);
    const lastPersisted = useRef<Prefs | null>(null);
    const setLaunchAtStartupRef = useRef(setLaunchAtStartup);

    useEffect(() => {
        void (async () => {
            try {
                const s = await Store.load(PREFS_STORE);
                setStore(s);
                if ((await s.get("enableNotifications")) !== undefined) {
                    await s.delete("enableNotifications");
                    await s.save();
                }
                setTheme((await s.get<Theme>(KEY_THEME)) ?? "system");
                setDefaultZoom((await s.get<number>(KEY_DEFAULT_ZOOM)) ?? 100);
                setShowDockBadge(
                    (await s.get<boolean>(KEY_SHOW_DOCK_BADGE)) ?? true,
                );
                const storedLaunchAtStartup =
                    (await s.get<boolean>(KEY_LAUNCH_AT_STARTUP)) ?? false;
                const actualLaunchAtStartup = await invoke<boolean>(
                    "launch_at_login_enabled",
                ).catch(() => storedLaunchAtStartup);
                if (actualLaunchAtStartup !== storedLaunchAtStartup) {
                    await s.set(KEY_LAUNCH_AT_STARTUP, actualLaunchAtStartup);
                    await s.save();
                }
                setLaunchAtStartupRef.current(actualLaunchAtStartup);
                setCrashReporting(
                    (await s.get<boolean>(KEY_CRASH_REPORTING)) ?? false,
                );
                setNotificationsEnabled(
                    (await s.get<boolean>(KEY_NOTIFICATIONS_ENABLED)) ?? false,
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
            defaultZoom,
            showDockBadge,
            launchAtStartup,
            crashReporting,
            notificationsEnabled,
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
                key: KEY_THEME,
                value: current.theme,
                event: EVENT_THEME_CHANGED,
            });
        if (prev.defaultZoom !== current.defaultZoom)
            changes.push({
                key: KEY_DEFAULT_ZOOM,
                value: current.defaultZoom,
                event: EVENT_DEFAULT_ZOOM_CHANGED,
            });
        if (prev.showDockBadge !== current.showDockBadge)
            changes.push({
                key: KEY_SHOW_DOCK_BADGE,
                value: current.showDockBadge,
                event: EVENT_BADGE_PREF_CHANGED,
            });
        if (prev.launchAtStartup !== current.launchAtStartup)
            changes.push({
                key: KEY_LAUNCH_AT_STARTUP,
                value: current.launchAtStartup,
                event: EVENT_LAUNCH_AT_STARTUP_CHANGED,
            });
        if (prev.crashReporting !== current.crashReporting)
            changes.push({
                key: KEY_CRASH_REPORTING,
                value: current.crashReporting,
            });
        if (prev.notificationsEnabled !== current.notificationsEnabled)
            changes.push({
                key: KEY_NOTIFICATIONS_ENABLED,
                value: current.notificationsEnabled,
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
        defaultZoom,
        showDockBadge,
        launchAtStartup,
        crashReporting,
        notificationsEnabled,
        loaded,
        store,
    ]);

    return {
        loaded,
        theme,
        setTheme,
        defaultZoom,
        setDefaultZoom,
        showDockBadge,
        setShowDockBadge,
        launchAtStartup,
        setLaunchAtStartup,
        crashReporting,
        setCrashReporting,
        notificationsEnabled,
        setNotificationsEnabled,
    };
}
