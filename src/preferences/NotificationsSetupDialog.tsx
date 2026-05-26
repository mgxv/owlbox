import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Cog6ToothIcon } from "@heroicons/react/24/outline";

interface Props {
    onConfirm: () => void;
    onCancel: () => void;
}

export default function NotificationsSetupDialog({
    onConfirm,
    onCancel,
}: Props) {
    const [confirmed, setConfirmed] = useState(false);
    const [permissionDenied, setPermissionDenied] = useState(false);
    const [busy, setBusy] = useState(false);

    async function handleOk() {
        setBusy(true);
        setPermissionDenied(false);
        const granted = await invoke<boolean>(
            "notification_permission_granted",
        );
        if (!granted) {
            setPermissionDenied(true);
            setBusy(false);
            return;
        }
        onConfirm();
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-2xl dark:bg-neutral-800">
                <h2 className="mb-3 text-[15px] font-semibold">
                    Enable desktop notifications
                </h2>
                <p className="mb-4 text-[13px] text-neutral-600 dark:text-neutral-400">
                    Owlbox-Genesis uses Gmail&apos;s built-in notification
                    system. To receive notifications for new emails, you must
                    first enable them in Gmail&apos;s settings:
                </p>
                <ol className="mb-5 list-inside list-decimal space-y-1.5 text-[13px] text-neutral-700 dark:text-neutral-300">
                    <li>
                        Open Gmail and click the{" "}
                        <Cog6ToothIcon className="mb-0.5 inline h-4 w-4 align-middle" />{" "}
                        <strong>→ See all settings</strong>
                    </li>
                    <li>
                        Go to the <strong>General</strong> tab
                    </li>
                    <li>
                        Scroll to <strong>Desktop Notifications</strong>
                    </li>
                    <li>
                        Select{" "}
                        <strong>&ldquo;New mail notifications on&rdquo;</strong>
                    </li>
                    <li>
                        Click <strong>Save Changes</strong>
                    </li>
                </ol>
                <label className="mb-4 flex cursor-pointer items-center gap-2 text-[13px]">
                    <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(e) => {
                            setConfirmed(e.target.checked);
                            setPermissionDenied(false);
                        }}
                        className="h-4 w-4 accent-blue-600"
                    />
                    I&apos;ve enabled Desktop Notifications in Gmail
                </label>
                {permissionDenied && (
                    <p className="mb-4 text-[12px] text-red-600 dark:text-red-400">
                        Owlbox-Genesis doesn&apos;t have permission to show
                        notifications. Please enable it in{" "}
                        <strong>
                            System Settings → Notifications → Owlbox-Genesis
                        </strong>
                        .
                    </p>
                )}
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded border border-neutral-300 bg-white px-3 py-1 text-[13px] hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleOk()}
                        disabled={!confirmed || busy}
                        className="rounded border border-blue-500 bg-blue-600 px-3 py-1 text-[13px] text-white hover:bg-blue-700 disabled:opacity-40"
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
}
