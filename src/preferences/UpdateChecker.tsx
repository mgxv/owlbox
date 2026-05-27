import { useRef, useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

type UpdateState =
    | { status: "idle" }
    | { status: "checking" }
    | { status: "up-to-date" }
    | { status: "available"; version: string }
    | { status: "installing" }
    | { status: "ready"; version: string }
    | { status: "error"; message: string };

export default function UpdateChecker() {
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
        const version = pendingUpdate.current.version;
        setState({ status: "installing" });
        try {
            await pendingUpdate.current.downloadAndInstall();
            setState({ status: "ready", version });
        } catch (e) {
            setState({ status: "error", message: String(e) });
        }
    }

    const busy = state.status === "checking" || state.status === "installing";
    const message =
        state.status === "ready"
            ? `v${state.version} installed — restart to apply`
            : state.status === "up-to-date"
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
                    } else if (state.status === "ready") {
                        void relaunch().catch((e) =>
                            setState({ status: "error", message: String(e) }),
                        );
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
                {state.status === "ready" && "Restart now"}
                {(state.status === "idle" ||
                    state.status === "up-to-date" ||
                    state.status === "error") &&
                    "Check for updates"}
            </button>
        </div>
    );
}
