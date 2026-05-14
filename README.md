# Owlbox

A minimal macOS application that hosts Gmail's web client in a native window, built with [Tauri 2](https://tauri.app) and React. Similar in spirit to [Boxy Suite 2](https://www.boxysuite.com/) — Owlbox does not reimplement Gmail; it embeds the real Gmail UI inside a native WKWebView and adds the OS integrations a browser tab can't. Because Tauri uses the system WebView instead of bundling Chromium, the installed footprint is a few megabytes rather than the ~150 MB of an equivalent Electron build.

## Features

- Dock icon badge with unread count
- `mailto:` handler registration
- Native preferences pane (theme, dock badge, launch at login, crash reporting)
- Keyboard shortcuts (`Cmd+,` prefs, `Cmd+Ctrl+N` compose, `Cmd+R` reload, `Cmd+F` find)
- Window state persistence
- Launch at login

## Non-goals

Owlbox is intentionally narrow in scope. It does not modify Gmail's interface, introduce custom compose or reply surfaces, bridge additional mail or messaging services, manage contacts, or duplicate functionality already provided by Gmail's web client. All mail-related behavior — UI, search, keyboard shortcuts, account switching, and add-ons — is delegated to Google's official client without modification.

## Requirements

- macOS 15 (Sequoia) or newer
- [mise](https://mise.jdx.dev/) for toolchain management

## Setup

```bash
brew install mise
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc && exec zsh

mise install
pnpm install
```

## Develop

```bash
pnpm tauri dev
```

## Build a release

```bash
pnpm tauri build
```

Outputs:

- `src-tauri/target/release/bundle/macos/Owlbox.app`
- `src-tauri/target/release/bundle/dmg/Owlbox_<version>_<arch>.dmg`

To wipe all build artifacts and caches, run `./clean.sh`.

## Project layout

```
src-tauri/   Rust host — window setup, event handlers, dock badge, mailto
injected/    JS injected into the Gmail webview — title parsing, event emission
src/         React app for the preferences window only (main window is Gmail)
```

## Preferences

| Key | Type | Default |
|---|---|---|
| `theme` | `"light" \| "dark" \| "system"` | `"system"` |
| `showDockBadge` | bool | `true` |
| `launchAtStartup` | bool | `false` |
| `crashReporting` | bool | `false` |

Crash reporting requires a `SENTRY_DSN` baked in at build time; without it, the toggle is a no-op.
