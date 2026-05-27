# Owlbox-Genesis

> **⚠️ Archived — no longer maintained.** The final release is `v0.4.2`. Auto-updates are disabled; no further releases will be published. Feel free to fork.

A minimal macOS app that wraps Gmail in a native window, built with [Tauri 2](https://tauri.app) and React. Owlbox-Genesis doesn't reimplement Gmail — it embeds the real Gmail UI inside a native WKWebView and layers on the OS integrations a browser tab can't provide. Because Tauri uses the system WebView instead of bundling Chromium, the installed footprint is a few megabytes rather than the ~150 MB of an equivalent Electron build.

## Features

- Dock icon badge with unread count
- Native macOS notifications for new emails
- `mailto:` deep-link handler (Owlbox-Genesis can be set as the system default mail client)
- Compose window (`Cmd+Shift+N`)
- External links open in the default browser
- Native preferences pane with General, Appearance, and Advanced tabs
- Keyboard shortcuts for common actions (see [Shortcuts](#shortcuts))
- Window state persistence across restarts
- Launch at login
- Auto-updates — checks on startup, installs silently, takes effect on next launch; or check manually via Preferences → General
- Opt-in crash reporting via Sentry (off by default; no email content is ever sent)

## Requirements

- macOS 15 (Sequoia) or newer

## Install

Download the `.dmg` for your Mac from the [latest release](https://github.com/mgxv/owlbox-genesis/releases/latest):

- **Apple Silicon (M1 and later)** — `Owlbox-Genesis_*_aarch64.dmg`
- **Intel** — `Owlbox-Genesis_*_x64.dmg`

Drag **Owlbox-Genesis** into `/Applications`.

On first launch macOS will block the app because it isn't notarized with an Apple Developer account:

1. Double-click **Owlbox-Genesis** — macOS shows an alert saying it cannot be opened. Click **Done**.
2. Open **System Settings → Privacy & Security** and scroll to the Security section.
3. Click **Open Anyway** next to the Owlbox-Genesis message.
4. Click **Open Anyway** in the confirmation dialog.
5. Enter your password or confirm with Touch ID if prompted.

Alternatively, strip the quarantine flag directly from Terminal:

```bash
xattr -dr com.apple.quarantine /Applications/Owlbox-Genesis.app
```

## Notifications

macOS will prompt for notification permission on first launch — click **Allow**.

Gmail's own desktop notification setting must also be turned on. In Gmail, open **Settings (gear icon) → See all settings → General → Desktop Notifications** and select **"New mail notifications on"**, then save. Without this Gmail won't fire notifications regardless of macOS permission.

## Shortcuts

| Shortcut      | Action                |
| ------------- | --------------------- |
| `Cmd+,`       | Preferences           |
| `Cmd+Shift+N` | Compose new message   |
| `Cmd+R`       | Reload                |
| `Cmd+F`       | Find / focus search   |
| `Cmd+Shift+V` | Paste and match style |
| `Cmd+=`       | Zoom in               |
| `Cmd+-`       | Zoom out              |
| `Cmd+0`       | Reset to default zoom |

Standard macOS edit and window commands (`Cmd+C`/`V`/`X`/`Z`/`A`, `Cmd+M`, `Cmd+W`, `Cmd+Q`, etc.) are also wired up.

## Preferences

| Key               | Type                                                  | Default    |
| ----------------- | ----------------------------------------------------- | ---------- |
| `theme`           | `"light" \| "dark" \| "system"`                       | `"system"` |
| `defaultZoom`     | `70 \| 80 \| 90 \| 100 \| 110 \| 120 \| 130` (number) | `100`      |
| `showDockBadge`   | bool                                                  | `true`     |
| `launchAtStartup` | bool                                                  | `false`    |
| `crashReporting`  | bool                                                  | `false`    |

`Cmd+=` / `Cmd+-` step zoom in 10% increments and clamp to 50–150%. `Cmd+0` resets to `defaultZoom`.

**Reset app** (Advanced tab) clears all WebView data — cookies, session, localStorage, and cache — and resets all preferences to defaults. The next launch will prompt for Gmail sign-in.

Crash reporting requires a `SENTRY_DSN` baked in at build time; without it, the toggle is a no-op.

## Non-goals

Owlbox-Genesis is intentionally narrow in scope. It does not introduce custom compose or reply surfaces, bridge additional mail or messaging services, manage contacts, or duplicate functionality already provided by Gmail's web client. All mail-related behavior — UI, search, keyboard shortcuts, account switching, and add-ons — is delegated to Google's official client.

---

## Development

### Setup

Requires [mise](https://mise.jdx.dev/) for toolchain management.

```bash
brew install mise
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc && exec zsh

mise install
pnpm install
```

### Run

```bash
pnpm tauri dev
```

Some features require a real macOS app bundle to work — notifications, for example, won't be granted permission by macOS when running as a raw binary. For those cases, build a debug bundle:

```bash
pnpm tauri build --debug
```

Dismiss the DMG window that opens, then launch the app directly:

```bash
open src-tauri/target/debug/bundle/macos/Owlbox-Genesis.app
```

<details>
<summary>

### Verify

</summary>

CI runs every check below on each PR. Run them locally first to catch issues before pushing.

Frontend (from repo root):

```bash
pnpm lint
pnpm format
pnpm format:check
pnpm exec tsc --noEmit
pnpm test
pnpm build
```

`pnpm format` auto-applies Prettier.

Rust (from `src-tauri/`):

```bash
cargo fmt --all -- --check
cargo clippy --all-targets --all-features --locked -- -D warnings
cargo test --locked
cargo audit
```

`cargo fmt --all` auto-applies rustfmt.

Other:

```bash
bash .github/scripts/check-audit-expirations.sh
```

A full bundle build (`pnpm tauri build`) takes 5–15 minutes and isn't strictly required before pushing, but it's the fastest way to catch release-only issues like LTO link failures.

</details>

<details>
<summary>

### Release

</summary>

Releases are produced by `.github/workflows/release.yml` when a `v*.*.*` tag is pushed. The workflow builds separate native binaries for Apple Silicon (`aarch64-apple-darwin`) and Intel (`x86_64-apple-darwin`), signs the updater artifacts with the Tauri signing keys (`TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` repo secrets), and creates a **draft** GitHub Release containing:

- `Owlbox-Genesis_*_aarch64.dmg` and `Owlbox-Genesis_*_x64.dmg`
- `Owlbox-Genesis_aarch64.app.tar.gz` and `Owlbox-Genesis_x64.app.tar.gz`
- `latest.json` — the updater manifest with per-arch signatures and download URLs

To cut a release:

```bash
# Make sure version is in sync across package.json, src-tauri/Cargo.toml, and src-tauri/tauri.conf.json
git tag v0.1.0
git push origin v0.1.0
```

After the workflow finishes (~20–30 min), review the draft at <https://github.com/mgxv/owlbox-genesis/releases> and click **Publish release**. The auto-updater endpoint only resolves to published (non-draft) releases — leaving it as a draft means installed apps won't see the update.

For a local bundle build (unsigned, no upload):

```bash
pnpm tauri build
```

Outputs:

- `src-tauri/target/release/bundle/macos/Owlbox-Genesis.app`
- `src-tauri/target/release/bundle/dmg/Owlbox-Genesis_<version>_<arch>.dmg`

To wipe all build artifacts and caches, run `./clean.sh`.

</details>
