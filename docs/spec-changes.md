# Spec Changes

Tracks deviations from `VoiceFlow-TechnicalSpec.docx`. Each entry documents
what the spec said, what we actually did, and why.

## 2026-05-03 — Second rename: 9VoicePrompt → 9VoiceToText

**Spec said:** product called "VoiceFlow" (we already renamed once).

**What we did:** renamed everywhere from `9VoicePrompt` to `9VoiceToText`:

- `package.json#name`: `9voicetotext`
- `productName` / `APP_NAME`: `9VoiceToText`
- `appId`: `com.9expert.voicetotext`
- README, HTML titles, tray tooltip
- Internal preload namespace: `window.voicePrompt` → `window.voiceToText`,
  `VoicePromptApi` → `VoiceToTextApi`
- Log paths: `~/Library/Logs/9voicetotext/`
- GitHub repo (planned): `9expert-training/9voicetotext`

**Why:** another app on the user's machine is already named `9voiceprompt`
and was claiming the same Electron `userData` directory + single-instance
lock, causing our app to quit immediately on launch. The new name fully
isolates this build.

**Working folder note:** the directory on disk is still
`/Users/chalaivate/Claude Chalaivate Projects/9VoicePrompt/` — that's just
the workspace path and doesn't affect the running app. Renaming the folder
later (and pointing git remote at the new repo) is a clean follow-up.

**Cleanup hint:** the old user-data dir from earlier dev runs can be
removed manually:

```bash
rm -rf ~/Library/Application\ Support/9voiceprompt
```

---

## 2026-05-03 — Initial rename: VoiceFlow → 9VoicePrompt

**Spec said:** product called "VoiceFlow", appId `com.9expert.voiceflow`,
repo `9expert-training/voiceflow`.

**What we did:** renamed everywhere to "9VoicePrompt":

- `package.json#name`: `9voiceprompt`
- `productName`: `9VoicePrompt`
- `appId`: `com.9expert.voiceprompt` (dropped the leading `9` to avoid the
  awkward `com.9expert.9voiceprompt`)
- Tray tooltip + window titles
- README, log paths (`~/Library/Logs/9VoicePrompt/`)

**Why:** user preference. The folder was `9VoicePrompt` and the spec name
was a working title.

**Consequences:** all the spec's `voiceflow` references map mentally to
`9voiceprompt` / `voiceprompt`. README, electron-builder.yml, GitHub
Actions workflow, and notarize.js will use the new name.

---

## 2026-05-03 — Added `uiohook-napi` dependency

**Spec said:** Section 6.1 lists `electron globalShortcut` as the hotkey
mechanism. Section 8.1 says push-to-talk needs key-up detection, which
`globalShortcut` doesn't support, and mentions `uiohook-napi` as fallback.

**What we did:** added `uiohook-napi ^1.5.4` to `dependencies` in Sprint 1
so it's available when push-to-talk lands. Sprint 1 only uses
`globalShortcut` (toggle-style firing); the uiohook fallback is wired up
in Sprint 2 alongside the recorder.

**Why:** required to honor FR-1.1 (push-to-talk) as specified.

---

## 2026-05-03 — Added `winston` dependency

**Spec said:** Section 7 mentions `src/main/utils/logger.ts` "Winston-based
logger". Section 6.1's table doesn't list winston explicitly.

**What we did:** added `winston ^3.13.0` to `dependencies`.

**Why:** spec calls for it by name in Section 7.

---

## 2026-05-03 — Sprint 3 — Replaced `node-key-sender` with built-in OS commands

**Spec said:** §6.1 lists `node-key-sender ^1.0.11` for cross-platform key
simulation, with note "ทำงานได้ทั้ง macOS+Windows ไม่ต้อง compile native module".

**What we did:** kept the dep installed (still in package.json) but DON'T use
it. The `KeystrokeRunner` shells out to:

- macOS: `osascript -e 'tell application "System Events" to keystroke "v" using command down'`
- Windows: `powershell -NoProfile -Command 'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^v")'`
- Linux: `xdotool key ctrl+v`

**Why:** `node-key-sender` actually requires a user-installed helper —
`cliclick` on macOS, `xdotool` on Linux, `win-keytool` on Windows — which
contradicts the "no native module / no extra installs" goal. The spec's
choice was based on a misunderstanding of the package. `osascript` and
PowerShell are guaranteed-present built-ins on their respective OSs.

**Trade-offs:**

- Pro: zero install friction, no Java/cliclick/xdotool dependency
- Pro: `osascript` is reliable and used by every Mac automation app
- Con: macOS still requires Accessibility permission to send keystrokes
  to OTHER apps. We surface this as the same first-run UX in Sprint 4.
- Con: Slightly more code than calling `keysender.sendKeys()`

**Cleanup task for future:** drop `node-key-sender` from `dependencies`
once we're confident the OS-built-in path is solid (probably Sprint 4 or 5).

---

## 2026-05-03 — Sprint 3 — Sound feedback uses Web Audio (no MP3 assets)

**Spec said:** §FR-2.3 + §7 list `resources/sounds/start.mp3` etc.

**What we did:** generated beeps procedurally via Web Audio in the renderer
(`src/renderer/overlay/sounds/beeps.ts`). 440 Hz start, 660 Hz stop, two-tone
descending error sound. No bundled audio assets.

**Why:** spec defines exact frequencies, so synthesis is the correct primitive
— bundling MP3s of sine waves would be wasteful. Also avoids variable file-load
behavior across packaging targets.

**How to override:** if a designer later wants custom sounds, replace the
`tone()` calls with `<audio>` elements pointing at MP3s in `resources/sounds/`.

---

## 2026-05-03 — Sprint 3 — Overlay hides during paste (focus hand-off)

**Spec said:** §5.2 state machine shows `processing → injecting → idle`. UI
behavior during `injecting` isn't specified.

**What we did:** when transitioning to `injecting`, hide the overlay window
BEFORE firing the paste keystroke, then re-show with the `success` state for
1 second before auto-hiding. While the overlay is still set `focusable: false`,
hiding it removes any visual obstruction during paste and avoids any
window-manager edge case where a layered always-on-top window could intercept
the keystroke.

**Why:** robustness — guarantees the target app receives the paste cleanly.
Cost is a ~200ms gap where the overlay is invisible during paste; user
perception is "blue → text appears at cursor → green confirmation → fade".

---

## 2026-05-03 — Sprint 2 ships TOGGLE-ONLY (push-to-talk deferred to Sprint 3)

**Spec said:** FR-1.1 lists both push-to-talk and toggle modes. The playbook's
Sprint 2 DoD describes "Hold hotkey → speak → release" (push-to-talk).

**What we did:** Sprint 2 implements toggle mode only — first hotkey press
starts recording, second press stops + transcribes. The `HotkeyManager`
already drives this, and the new `RecordingController.togglePressed()` is
the entry point.

**Why:** Push-to-talk requires `uiohook-napi` for key-up events (Section 8.1
explicitly says `globalShortcut` doesn't fire key-up). Wiring it up cleanly
needs:

1. The native module rebuilt against our Electron version
2. macOS Accessibility permission (otherwise no key events)
3. A first-run onboarding screen that asks for it

All three land in Sprint 3 (injection needs the same Accessibility
permission) and Sprint 4 (settings + onboarding flow). Bringing toggle
online first lets us validate the full audio → Whisper → display pipeline
without the native-module variable.

**How to apply:** when Sprint 3 enables push-to-talk, the controller's
`togglePressed()` becomes the keyup-driven path; add a separate
`startedKey()` / `releasedKey()` API that's bound to uiohook events.

---

## 2026-05-03 — Custom vocabulary ships hard-coded for Sprint 2

**Spec said:** Section 9.3 + FR-2.4 expose custom vocabulary in Settings UI
(Phase 2). The playbook's Sprint 2 says "hard-code a coding-context prompt
for Whisper" with a sample string.

**What we did:** added `CODING_PROMPT` in `src/shared/constants.ts` and wired
it as the default `prompt` parameter in the Whisper client. User-editable
vocabulary is Sprint 4 alongside the rest of Settings UI.

---

## 2026-05-03 — Sprint 5 will ship UNSIGNED installers

**Spec said:** Section 13.1 enables `notarize: true` and code signing for
both macOS DMG and Windows NSIS.

**What we plan:** ship v1.0 unsigned. Add `docs/INSTALL-WORKAROUND.md`
documenting `xattr -d com.apple.quarantine` and SmartScreen "More info →
Run anyway" steps. Make signing+notarization a v1.1 follow-up once the
Apple Developer Program account is acquired.

**Why:** user does not have an Apple Developer Program account or a
Windows code-signing certificate at the time of building.

**Consequences:** users will see Gatekeeper / SmartScreen warnings on
first install. Auto-update via electron-updater still works, but each
update will trigger the same warnings until signing lands.
