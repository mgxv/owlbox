import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// vi.hoisted runs before vi.mock, so these refs are available inside the factory.
const mockStore = vi.hoisted(() => ({
    get: vi.fn<(key: string) => Promise<unknown>>(),
    set: vi.fn<(key: string, value: unknown) => Promise<void>>(),
    delete: vi.fn<(key: string) => Promise<void>>(),
    save: vi.fn<() => Promise<void>>(),
}));

const mockLoad = vi.hoisted(() =>
    vi.fn<() => Promise<unknown>>(() => Promise.resolve(mockStore)),
);

vi.mock("@tauri-apps/plugin-store", () => ({
    Store: { load: mockLoad },
}));

vi.mock("@tauri-apps/api/event", () => ({
    emit: vi.fn<() => Promise<void>>(),
}));

const { emit } = await import("@tauri-apps/api/event");
const { usePreferences } = await import("../src/usePreferences");

beforeEach(() => {
    vi.resetAllMocks();
    mockLoad.mockResolvedValue(mockStore);
    mockStore.get.mockResolvedValue(undefined);
    mockStore.set.mockResolvedValue(undefined);
    mockStore.save.mockResolvedValue(undefined);
    vi.mocked(emit).mockResolvedValue(undefined);
});

describe("usePreferences: initial load", () => {
    it("applies defaults when store has no values", async () => {
        const { result } = renderHook(() => usePreferences());
        await waitFor(() => expect(result.current.loaded).toBe(true));
        expect(result.current.theme).toBe("system");
        expect(result.current.gmailTheme).toBe("light");
        expect(result.current.defaultZoom).toBe(100);
        expect(result.current.showDockBadge).toBe(true);
        expect(result.current.launchAtStartup).toBe(false);
        expect(result.current.crashReporting).toBe(false);
    });

    it("restores persisted values from store", async () => {
        const saved: Record<string, unknown> = {
            theme: "dark",
            gmailTheme: "dark",
            defaultZoom: 110,
            showDockBadge: false,
            launchAtStartup: true,
            crashReporting: true,
        };
        mockStore.get.mockImplementation((key) => Promise.resolve(saved[key]));

        const { result } = renderHook(() => usePreferences());
        await waitFor(() => expect(result.current.loaded).toBe(true));

        expect(result.current.theme).toBe("dark");
        expect(result.current.gmailTheme).toBe("dark");
        expect(result.current.defaultZoom).toBe(110);
        expect(result.current.showDockBadge).toBe(false);
        expect(result.current.launchAtStartup).toBe(true);
        expect(result.current.crashReporting).toBe(true);
    });

    it("sets loaded=true even when store throws", async () => {
        mockLoad.mockRejectedValue(new Error("store unavailable"));
        const { result } = renderHook(() => usePreferences());
        await waitFor(() => expect(result.current.loaded).toBe(true));
    });
});

describe("usePreferences: change detection", () => {
    it("persists and emits when theme changes", async () => {
        const { result } = renderHook(() => usePreferences());
        await waitFor(() => expect(result.current.loaded).toBe(true));

        act(() => result.current.setTheme("dark"));

        await waitFor(() =>
            expect(mockStore.set).toHaveBeenCalledWith("theme", "dark"),
        );
        expect(mockStore.save).toHaveBeenCalled();
        expect(emit).toHaveBeenCalledWith("theme-changed");
    });

    it("persists and emits when gmailTheme changes", async () => {
        const { result } = renderHook(() => usePreferences());
        await waitFor(() => expect(result.current.loaded).toBe(true));

        act(() => result.current.setGmailTheme("dark"));

        await waitFor(() =>
            expect(mockStore.set).toHaveBeenCalledWith("gmailTheme", "dark"),
        );
        expect(emit).toHaveBeenCalledWith("gmail-theme-changed");
    });

    it("persists crashReporting without emitting an event", async () => {
        const { result } = renderHook(() => usePreferences());
        await waitFor(() => expect(result.current.loaded).toBe(true));

        act(() => result.current.setCrashReporting(true));

        await waitFor(() =>
            expect(mockStore.set).toHaveBeenCalledWith("crashReporting", true),
        );
        expect(emit).not.toHaveBeenCalled();
    });

    it("does not persist when a value is set to its current value", async () => {
        const { result } = renderHook(() => usePreferences());
        await waitFor(() => expect(result.current.loaded).toBe(true));
        mockStore.set.mockClear();

        // defaultZoom default is 100; setting it to 100 again is a no-op.
        act(() => result.current.setDefaultZoom(100));
        await new Promise((r) => setTimeout(r, 10));

        expect(mockStore.set).not.toHaveBeenCalled();
    });

    it("batches multiple simultaneous changes into one save", async () => {
        const { result } = renderHook(() => usePreferences());
        await waitFor(() => expect(result.current.loaded).toBe(true));

        act(() => {
            result.current.setTheme("light");
            result.current.setShowDockBadge(false);
        });

        await waitFor(() => expect(mockStore.save).toHaveBeenCalled());
        expect(mockStore.save).toHaveBeenCalledTimes(1);
    });
});
