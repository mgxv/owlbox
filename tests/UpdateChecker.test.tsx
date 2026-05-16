import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Must be hoisted above the dynamic import so vi.mock runs before module resolution.
vi.mock("@tauri-apps/plugin-updater", () => ({
    check: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-process", () => ({
    relaunch: vi.fn(),
}));

// Lazy import so mocks are in place first.
const { check } = await import("@tauri-apps/plugin-updater");
const { relaunch } = await import("@tauri-apps/plugin-process");

import { useRef, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";

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
            pendingUpdate.current = update ?? null;
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
        <div>
            {message && <p data-testid="message">{message}</p>}
            <button
                onClick={() => {
                    if (state.status === "available") void installUpdate();
                    else void checkForUpdates();
                }}
                disabled={busy}
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

beforeEach(() => {
    vi.resetAllMocks();
});

describe("UpdateChecker", () => {
    it("shows 'Check for updates' initially", () => {
        render(<UpdateChecker />);
        expect(
            screen.getByRole("button", { name: "Check for updates" }),
        ).toBeInTheDocument();
        expect(screen.queryByTestId("message")).toBeNull();
    });

    it("disables the button while checking", async () => {
        vi.mocked(check).mockReturnValue(new Promise(() => {})); // never resolves
        render(<UpdateChecker />);
        const user = userEvent.setup();
        await user.click(screen.getByRole("button"));
        expect(screen.getByRole("button")).toBeDisabled();
        expect(screen.getByRole("button")).toHaveTextContent("Checking…");
    });

    it("shows up-to-date message when no update is available", async () => {
        vi.mocked(check).mockResolvedValue(null);
        render(<UpdateChecker />);
        await userEvent.click(screen.getByRole("button"));
        await waitFor(() =>
            expect(screen.getByTestId("message")).toHaveTextContent(
                "You're on the latest version.",
            ),
        );
        expect(
            screen.getByRole("button", { name: "Check for updates" }),
        ).not.toBeDisabled();
    });

    it("shows version and 'Install update' when an update is available", async () => {
        vi.mocked(check).mockResolvedValue({
            version: "1.2.3",
            downloadAndInstall: vi.fn().mockResolvedValue(undefined),
        } as unknown as Update);
        render(<UpdateChecker />);
        await userEvent.click(screen.getByRole("button"));
        await waitFor(() =>
            expect(screen.getByTestId("message")).toHaveTextContent(
                "Update available: v1.2.3",
            ),
        );
        expect(
            screen.getByRole("button", { name: "Install update" }),
        ).toBeInTheDocument();
    });

    it("shows error message when check throws", async () => {
        vi.mocked(check).mockRejectedValue(new Error("network timeout"));
        render(<UpdateChecker />);
        await userEvent.click(screen.getByRole("button"));
        await waitFor(() =>
            expect(screen.getByTestId("message")).toHaveTextContent(
                "network timeout",
            ),
        );
        expect(
            screen.getByRole("button", { name: "Check for updates" }),
        ).not.toBeDisabled();
    });

    it("disables the button while installing", async () => {
        const downloadAndInstall = vi
            .fn()
            .mockReturnValue(new Promise(() => {})); // never resolves
        vi.mocked(check).mockResolvedValue({
            version: "1.2.3",
            downloadAndInstall,
        } as unknown as Update);
        render(<UpdateChecker />);
        const user = userEvent.setup();
        await user.click(screen.getByRole("button"));
        await waitFor(() =>
            expect(
                screen.getByRole("button", { name: "Install update" }),
            ).toBeInTheDocument(),
        );
        await user.click(
            screen.getByRole("button", { name: "Install update" }),
        );
        expect(screen.getByRole("button")).toBeDisabled();
        expect(screen.getByRole("button")).toHaveTextContent("Installing…");
    });

    it("shows error when install throws", async () => {
        const downloadAndInstall = vi
            .fn()
            .mockRejectedValue(new Error("disk full"));
        vi.mocked(check).mockResolvedValue({
            version: "1.0.0",
            downloadAndInstall,
        } as unknown as Update);
        render(<UpdateChecker />);
        const user = userEvent.setup();
        await user.click(screen.getByRole("button"));
        await waitFor(() =>
            expect(
                screen.getByRole("button", { name: "Install update" }),
            ).toBeInTheDocument(),
        );
        await user.click(
            screen.getByRole("button", { name: "Install update" }),
        );
        await waitFor(() =>
            expect(screen.getByTestId("message")).toHaveTextContent(
                "disk full",
            ),
        );
        expect(
            screen.getByRole("button", { name: "Check for updates" }),
        ).not.toBeDisabled();
    });
});
