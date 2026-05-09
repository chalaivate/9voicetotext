# Spec Changes

Tracks deviations from `VoiceFlow-TechnicalSpec.docx`. Each entry documents
what the spec said, what we actually did, and why.

## 2026-05-09 — Sprint 4d Phase 2 — Auto-stop hotkey mode (VAD)

**Spec said:** Section 8.5 settings schema lists `hotkey.mode` as
`'push-to-talk' | 'toggle'` only. Audio settings have no silence-detection
fields.

**What we added:**

- New hotkey mode `'auto-stop'`. Press once → record → silence ≥ N seconds
  → automatic stop + send. Re-press during recording cancels (no audio
  sent). Implemented in `RecordingController.autoStopFromSilence()` +
  `pressed()` mode-aware branch.
- New schema fields under `audio`:
  - `silenceThresholdRms` (0–1, default 0.015) — RMS below which the mic
    is considered silent.
  - `silenceDurationMs` (1000–30000, default 10000) — how long that
    silence must persist before auto-stop fires.
- New IPC channel `recording:autoStop` — renderer → main when the
  `SilenceDetector` (in `src/renderer/overlay/recorder/silence-detector.ts`)
  observes silence for the full duration.
- Settings UI: Hotkeys page exposes the third mode; Audio page gets a
  "Auto-stop silence detection" card with sliders + a live RMS meter
  (Calibrate button) so users can pick a threshold above their ambient
  room noise.

**Why:** user wanted a single-press dictation mode that works without
holding the hotkey and without remembering to press twice — flows
naturally into thinking pauses.

**Consequences:** Existing `'toggle'` and `'push-to-talk'` modes continue
to work unchanged. Schema additions are additive with safe defaults, so
old settings files migrate without intervention.

---

## 2026-05-08 — Sprint 4d Phase 1 — Switch transcription model to `gpt-4o-transcribe`

**Spec said:** Section 9.1 names "OpenAI Whisper API (whisper-1)" as the
sole transcription endpoint. `TRANSCRIPTION.model = 'whisper-1'` was
hard-coded in `src/shared/constants.ts`.

**What we did:** added `transcription.model` enum to settings schema with
3 valid options, default `gpt-4o-transcribe`. Whisper client reads model
from settings dynamically each request. Settings → Transcription page
exposes a dropdown to switch.

| Model                             | Price      | Streaming | Quality        |
| --------------------------------- | ---------- | --------- | -------------- |
| `whisper-1` (legacy)              | $0.006/min | ❌        | Baseline       |
| **`gpt-4o-transcribe`** (default) | $0.006/min | ✅        | Best           |
| `gpt-4o-mini-transcribe`          | $0.003/min | ✅        | Near whisper-1 |

**Why:** production observation (2026-05-08) showed `whisper-1` hallucinates
prompt fragments very frequently when audio is short or quiet — outputs like
"ภาษาไทยศัพท์เทคนิค ภาษาไทยศัพท์เทคนิค ..." and Office MIME strings
("Microsoft Word 97-2003 Document MSWordDoc Word.Document.8") instead of
the actual speech. Sprint 4b's filter catches these but a better model
prevents them upstream.

`gpt-4o-transcribe` (released March 2025) is documented to hallucinate
significantly less, costs the same, and adds streaming support — a
prerequisite for Sprint 4d Phase 3 (incremental UI display).

**Compatibility:** all 3 endpoints accept the same FormData params
(`file`, `model`, `language`, `prompt`, `temperature`, `response_format`).
Response schema is the same JSON shape (`text`, `language`, `duration`,
`segments`). No code paths needed restructuring beyond the model parameter.

**Tests:** added 2 schema test cases (accepts all 3 enum values; rejects
unknown values). Whisper retry tests still pass with the new dynamic model
parameter.

**Migrations:** none required — the new field has a default, existing
settings.json files (without `model`) backfill cleanly.

---

## 2026-05-03 — Sprint 4b — Hotkeys, Audio, Vocabulary + push-to-talk + hallucination filter

**What landed:**

- **Hotkeys page** (`src/renderer/settings/pages/Hotkeys.tsx`): live capture
  via `HotkeyCapture` component. Press the `Change` button → record any
  modifier+key combo → IPC `hotkey:check` validates against the OS before
  saving (test-register / test-unregister dance lives in `HotkeyManager.check`).
  Mode selector toggles between toggle and push-to-talk.
- **Push-to-talk via `uiohook-napi`** (`src/main/hotkey/uiohook-bridge.ts`):
  ships ~prebuilt for darwin-{arm64,x64} + win32-{arm64,x64}, no
  electron-rebuild needed. `HotkeyManager.register(combo, mode)` starts a
  global keyup listener when push-to-talk is active. Falls back gracefully if
  the native binding fails to load (toggle mode keeps working).
  `RecordingController` grew `pressed()` / `released()` methods; PTT taps
  shorter than `RECORDING.minDurationMs = 200ms` are discarded as accidental.
- **Audio page** (`src/renderer/settings/pages/Audio.tsx`): microphone
  selector (`navigator.mediaDevices.enumerateDevices`), sample rate override
  (16/24/48 kHz, default 16k), live RMS level meter, and a 3s test-record
  with playback. `media-recorder.ts` now accepts a `RecorderConfig` so the
  overlay reads the user's device + sample rate from settings on each session.
- **Vocabulary page** (`src/renderer/settings/pages/Vocabulary.tsx`):
  `CODING_PROMPT` was split into 4 toggleable presets in
  `VOCABULARY_PRESETS` (coding / microsoft365 / brandNames / thai) +
  `composeWhisperPrompt(presets, custom)` helper. The page exposes preset
  toggles, a custom-term editor, the hallucination filter switch, and a
  live preview of the exact string sent to Whisper. New IPC channel
  `vocabulary:preview` returns the current composed prompt.
- **Hallucination filter** (`src/main/transcription/post-process.ts`):
  whole-text regex match against known Whisper boilerplate
  ("ขอบคุณที่รับชม", "Thanks for watching", "Subscribe และกดกระดิ่งแจ้งเตือน",
  lone "you", "...") that consistently shows up on silent recordings. When
  matched, the controller surfaces a friendly "likely silence — try again"
  error instead of pasting the hallucination. Toggle off via Settings →
  Vocabulary if you actually want to dictate "Thanks for watching".

**New IPC channels:**

- `hotkey:check` — validate a candidate combo before saving (returns
  `{ ok: true, accelerator } | { ok: false, message }`).
- `vocabulary:preview` — returns the composed Whisper prompt string.

**Tests:**

- `post-process.test.ts` — 8 cases covering Thai/English boilerplate +
  whole-text-only matching invariant
- `vocabulary-prompt.test.ts` — 6 cases covering preset composition,
  custom term ordering, empty fallback, token budget
- Extended `recording-controller.test.ts` with 5 new cases: hallucination
  filter on/off, push-to-talk press/release lifecycle, short-tap discard,
  release-while-idle no-op, busy-press debounce
- Extended `settings-schema.test.ts` for `vocabularyPresets` +
  `filterHallucinations` defaults and overrides

Total unit tests now ~52, all green.

**Spec deviations:**

- `RECORDING.minDurationMs` (200ms) is new — spec didn't define a min PTT
  hold time, but in practice press+release events arrive in 50–80ms when
  the user accidentally taps the hotkey, producing useless empty recordings.
- The hallucination filter is whole-text-match only; partial-sentence
  stripping is deliberately deferred to v2 to avoid clipping legitimate
  sentences that mention the boilerplate phrase (see post-process.ts header).

---

## 2026-05-03 — Dropped `node-key-sender` from dependencies

**Why:** Sprint 3 already replaced this with `osascript` / PowerShell /
`xdotool` (see "Replaced node-key-sender with built-in OS commands" below).
Sprint 4b confirmed via 30+ E2E paste sessions across TextEdit, VS Code,
Word, Chrome, Slack, Google Keep that the OS-built-in path is reliable.
Removed the dead dep to slim the install surface.

**Cleanup follow-up:** if anyone runs `npm i` against an old lockfile,
`node-key-sender` will be removed. No code changes needed since
`src/main/injection/keystroke.ts` only references it in a comment.

---

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

## 2026-05-03 — Sprint 4a — Settings store, keytar, settings window

**What landed:**

- `src/main/store/settings.ts` — `electron-store` v10 backed by zod schema
  covering every field in spec §8.5. Defaults are baked into the schema so a
  partial / corrupt JSON file backfills cleanly. Migrations stub in place
  (currently empty; bump `SCHEMA_VERSION` to add upgrades).
- `src/main/store/secrets.ts` — `keytar` wrapper, service `9voicetotext`,
  account `openai-api-key`. Includes `maskKey()` helper.
- `src/main/transcription/whisper-client.ts` — `ApiKeyGetter` now async; main
  passes a getter that reads keychain first, `.env.local` second.
- `src/main/windows/settings.ts` — frameless `hiddenInset` titlebar on Mac,
  `mica` on Win 11. Shows Dock icon while open, hides again on close.
- IPC: full settings/secrets surface (`get`/`set`/`reset`/`changed` +
  `setApiKey`/`hasApiKey`/`deleteApiKey`/`keyMask`/`testApiKey`).
- Tray: adds **Settings…** + (placeholder) **History…** items.
- Renderer: design tokens from §11.4 in
  `src/renderer/shared/tokens.ts`; primitives `Button`, `Input`, `Toggle`,
  `Select`, `Card`/`Field`, `Toast`/`ToastHost`; `useSettings` zustand bridge
  with 500 ms auto-save debounce + toast.
- Renderer: Settings React app with 6-tab sidebar; **General**,
  **Transcription** (API key + test connection), and **About** are wired;
  Hotkeys / Audio / Vocabulary show "Coming in Sprint 4b" placeholder.

**Spec deviations:**

- `transcription:testApiKey` IPC hits `GET /v1/models` (cheap, no audio
  upload) instead of "transcribing 1 s of silence" as the playbook
  suggested. The 401 vs 200 distinction is enough to validate the key, and
  it doesn't burn audio quota during dev.
- API key mask format is `sk-…1234` (3 prefix chars + ellipsis + 4 suffix
  chars) instead of `*****1234` per the playbook. Easier to confirm a key
  visually and still privacy-safe.

**Tests:** added `settings-schema` (6 cases) and `secrets` (8 cases). Total
unit tests now 37, all green.

**Why this scope:** spec §11.2 + playbook 4.1 demand the Settings shell + API
key UX as Sprint 4's foundation. Other settings pages (Hotkeys, Audio,
Vocabulary) follow in 4b; History + onboarding in 4c.

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
