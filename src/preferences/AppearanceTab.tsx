import { type Theme } from "../usePreferences";

const ZOOM_OPTIONS = [70, 80, 90, 100, 110, 120, 130] as const;

interface Props {
    theme: Theme;
    setTheme: (v: Theme) => void;
    defaultZoom: number;
    setDefaultZoom: (v: number) => void;
}

export default function AppearanceTab({
    theme,
    setTheme,
    defaultZoom,
    setDefaultZoom,
}: Props) {
    return (
        <div className="flex h-full items-start justify-center">
            <div className="grid grid-cols-[auto_auto] items-center gap-x-3 gap-y-4">
                <label htmlFor="pref-theme" className="text-right">
                    System theme
                </label>
                <select
                    id="pref-theme"
                    value={theme}
                    onChange={(e) => setTheme(e.target.value as Theme)}
                    className="rounded border border-neutral-300 bg-white px-2 py-1 text-[13px] dark:border-neutral-700 dark:bg-neutral-800"
                >
                    <option value="system">System</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                </select>

                <label htmlFor="pref-zoom" className="text-right">
                    Default zoom
                </label>
                <select
                    id="pref-zoom"
                    value={defaultZoom}
                    onChange={(e) => setDefaultZoom(Number(e.target.value))}
                    className="rounded border border-neutral-300 bg-white px-2 py-1 text-[13px] dark:border-neutral-700 dark:bg-neutral-800"
                >
                    {ZOOM_OPTIONS.map((z) => (
                        <option key={z} value={z}>
                            {z}%
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
}
