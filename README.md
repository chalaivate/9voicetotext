# 9VoiceToText

Cross-platform voice-to-text desktop app. Speak naturally. Type instantly. Anywhere.

Built on Electron + TypeScript + React + Tailwind, powered by OpenAI Whisper.
Hold a global hotkey, speak Thai/English/mixed, release — the transcribed text
is pasted at your cursor in any app (VS Code, Claude Code, Word, Slack, etc.).

> **Status:** Sprint 3 (Injection + UX Polish) complete. The current build is
> daily-driver-ready — hotkey → record → Whisper → text appears at your cursor
> in any focused app. Verified working in TextEdit, Microsoft Word, Chrome,
> Google Keep, and the Claude Code terminal.
> Sprint 4 (Settings UI + History + Onboarding + keytar) is up next.
> Full roadmap: see `docs/spec-changes.md` and the technical spec.

## Requirements

- **Node.js 20 LTS** (or newer)
- **npm 10+**
- **macOS 12+** or **Windows 10 64-bit (build 19041+)**
- An OpenAI API key (for Sprint 2 onward)

## Setup

```bash
git clone https://github.com/9expert-training/9voicetotext.git
cd 9voicetotext
npm install
cp .env.example .env.local   # paste your OpenAI key
```

## Development

```bash
npm run dev          # start the app with HMR
npm run typecheck    # tsc --noEmit on main + renderer
npm run lint         # eslint
npm run format       # prettier --write
npm test             # vitest run
```

When `npm run dev` is running:

- A tray/menu-bar icon appears (microphone glyph).
- Press **Ctrl+Cmd+Space** (macOS) or **Ctrl+Alt+Space** (Windows) — start beep,
  recording overlay appears top-right with a live waveform.
- Speak.
- Press the hotkey again — stop beep, overlay turns blue (processing).
- Within ~2s the transcribed text is pasted at your cursor in whatever app
  has focus. Overlay flashes green for 1s and auto-hides.
- On error (no API key, network, paste blocked) the overlay turns orange with
  a Thai/English explanation and auto-hides after 5s.
- Right-click the tray → **Quit 9VoiceToText** to exit.

**macOS first-run:** the first paste will trigger a permission prompt:
_"9voicetotext wants access to control 'System Events'."_ Click **OK**, then
go to **System Settings → Privacy & Security → Accessibility** and enable
the **Electron** entry. Without this permission, the paste keystroke fails
silently and you'll see an orange overlay asking you to paste manually
(the text is still on the clipboard).

**macOS hotkey conflict:** `Ctrl+Cmd+Space` is bound by default to the system
Character Picker. If the hotkey appears to do nothing, disable it at
**System Settings → Keyboard → Keyboard Shortcuts → Input Sources**.

## Build

```bash
npm run build         # build all three processes
npm run build:mac     # produce a DMG (unsigned in Sprint 5; signing later)
npm run build:win     # produce an NSIS installer
```

## Project layout (per spec Section 7)

```
src/
  main/        Electron main process — hotkey, tray, recording controller, Whisper
  preload/     contextBridge — typed API surface for renderers
  renderer/    React UIs — overlay, settings, history (Sprints 2–4)
  shared/      Types, constants, IPC channel names
resources/     Tray icons, app icons, sounds
build/         electron-builder entitlements, notarize script (Sprint 5)
tests/         vitest unit + integration, Playwright e2e
docs/          Spec changelog and per-feature notes
```

## Troubleshooting

**Hotkey doesn't work** — another app may already own that combo. Check the
terminal output; look for `hotkey registration failed`. Sprint 4 will add a UI
to remap it; for now edit `DEFAULT_HOTKEY` in `src/shared/constants.ts`.

**Mic permission** — first hotkey press will prompt for microphone access on
macOS. Sprint 4 ships a guided onboarding flow.

**Logs** — written to `~/Library/Logs/9voicetotext/app.log` (macOS) or
`%APPDATA%\9voicetotext\logs\app.log` (Windows), 10 MB rotating, 3 files kept.

## License

MIT © 9Expert Training.
