import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import NotificationsSetupDialog from "./NotificationsSetupDialog";
import UpdateChecker from "./UpdateChecker";

interface Props {
    notificationsEnabled: boolean;
    setNotificationsEnabled: (v: boolean) => void;
    showDockBadge: boolean;
    setShowDockBadge: (v: boolean) => void;
    launchAtStartup: boolean;
    setLaunchAtStartup: (v: boolean) => void;
}

export default function GeneralTab({
    notificationsEnabled,
    setNotificationsEnabled,
    showDockBadge,
    setShowDockBadge,
    launchAtStartup,
    setLaunchAtStartup,
}: Props) {
    const [showDialog, setShowDialog] = useState(false);

    useEffect(() => {
        if (!notificationsEnabled) return;
        void invoke<boolean>("notification_permission_granted").then(
            (granted) => {
                if (!granted) setNotificationsEnabled(false);
            },
        );
    }, [notificationsEnabled, setNotificationsEnabled]);

    return (
        <div className="flex h-full flex-col">
            {showDialog && (
                <NotificationsSetupDialog
                    onConfirm={() => {
                        setNotificationsEnabled(true);
                        setShowDialog(false);
                    }}
                    onCancel={() => {
                        setShowDialog(false);
                    }}
                />
            )}
            <div className="flex justify-center">
                <div className="grid grid-cols-[auto_auto] items-center gap-x-3 gap-y-4">
                    <input
                        id="pref-notifications"
                        type="checkbox"
                        checked={notificationsEnabled}
                        onChange={(e) => {
                            if (e.target.checked) {
                                setShowDialog(true);
                            } else {
                                setNotificationsEnabled(false);
                            }
                        }}
                        className="h-4 w-4 accent-blue-600"
                    />
                    <label htmlFor="pref-notifications">
                        Enable desktop notifications
                    </label>

                    <input
                        id="pref-dock-badge"
                        type="checkbox"
                        checked={showDockBadge}
                        onChange={(e) => setShowDockBadge(e.target.checked)}
                        className="h-4 w-4 accent-blue-600"
                    />
                    <label htmlFor="pref-dock-badge">
                        Show unread count in Dock icon
                    </label>

                    <input
                        id="pref-launch-startup"
                        type="checkbox"
                        checked={launchAtStartup}
                        onChange={(e) => setLaunchAtStartup(e.target.checked)}
                        className="h-4 w-4 accent-blue-600"
                    />
                    <label htmlFor="pref-launch-startup">
                        Launch Owlbox-Genesis at login
                    </label>
                </div>
            </div>
            <UpdateChecker />
        </div>
    );
}
