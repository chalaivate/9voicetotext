# Sprint 4 Plan — Settings + History + Onboarding

**Status:** Draft for review.
**Goal:** Make 9VoiceToText feature-complete (Phase 1 + Phase 2 of the spec).
**Reference:** Playbook Prompt 4.1, spec §8.5/§8.6/§11.2/§4.4.

---

## What gets built

**Six epics** from the playbook, broken into three commit-sized sub-sprints.

### Sprint 4a — Foundation (~3–4 days)

The minimum that makes the rest unblocked. Lands a security-meaningful change
(API key out of `.env.local` and into the OS keychain) plus enough settings
plumbing for later sub-sprints to plug into.

- Settings `BrowserWindow` manager (`hiddenInset` on Mac, `mica` on Win 11) per §11.2
- Tray menu adds **Settings…** + **History…** items (History is placeholder for now)
- `electron-store` settings store with the full §8.5 schema, version field, migrations stub
- `zustand` settings store in renderer + IPC bridge (auto-save 500 ms debounce + toast)
- Settings sidebar nav (200 px) + content area
- 2 working pages: **General** (theme, launch on startup, history limit) + **About** (version, links, "Re-run onboarding")
- `keytar` wrapper + IPC handlers (`get`/`set`/`delete`/`test connection`)
- Whisper client migrates: keytar first → `.env.local` fallback (dev convenience)
- API key UI: masked input, reveal toggle, "Test connection" button (calls Whisper with 1 s of silence)
- Tests: settings store schema, keytar mock round-trip, IPC handler validation
- Commit checkpoint

### Sprint 4b — Settings depth (~3–4 days)

Every setting from §8.5 wired to UI. Push-to-talk lands here because hotkey
settings live here.

- 4 more pages: **Hotkeys**, **Audio**, **Transcription**, **Vocabulary**
- `HotkeyCapture` component — listens for `keydown`, validates ≥ 1 modifier + 1 key, detects conflict
- Push-to-talk via `uiohook-napi` (hooked behind hotkey-mode setting)
- Audio device enumeration via `navigator.mediaDevices.enumerateDevices`
- Vocabulary editor — preset dropdown (Coding / Business / Medical / Custom) + free-text editor
- Live setting application:
  - Hotkey change → unregister + re-register immediately
  - Vocab change → applied on next Whisper call (no restart)
  - Output mode change → injector reads from store
- Tests: HotkeyCapture parsing, vocab token-count guard, push-to-talk state machine
- Commit checkpoint

### Sprint 4c — History + Onboarding (~2–3 days)

Polish that makes the app feel complete.

- History store: `electron-store` + `safeStorage` (AES-256 via OS) per §4.3
- Add to history at the moment Whisper returns success, before injection — so a paste failure still leaves the text browsable
- History `BrowserWindow` + React page: list view + substring search + re-paste action + export JSON/CSV + clear-all (with confirmation)
- First-run onboarding `BrowserWindow`: welcome → mic permission → accessibility permission (macOS) → API key → hotkey capture → quick demo → done
- Trigger onboarding when settings file is missing OR from About page
- Tests: history dedupe + ring buffer at limit, export format snapshot, onboarding step machine
- Commit checkpoint
- Tag `sprint-4-complete` after manual QA

---

## Architecture decisions

| Decision             | Choice                                                             | Rationale                                                   |
| -------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| Window strategy      | Separate `BrowserWindow`s for settings + history + onboarding      | Each opens rarely; isolated state; matches §7 folder layout |
| Renderer state       | `zustand` (already in deps)                                        | Lightweight, no Redux ceremony, good DevTools               |
| Settings persistence | `electron-store` v10                                               | Spec choice; built-in migrations                            |
| Settings ↔ renderer  | `settings:get` / `settings:set` IPC + `settings:changed` broadcast | Two-way reactive; main is source of truth                   |
| Auto-save            | 500 ms debounce per §11.2                                          | Matches spec; no Save button                                |
| API key storage      | `keytar` first, `.env.local` fallback in dev                       | Production secure; dev ergonomic                            |
| History encryption   | `safeStorage.encryptString` per record                             | OS-managed key; resilient to file copy attacks              |
| Onboarding window    | Dedicated frameless window with custom step machine                | One-shot UX; isolates wizard state                          |
| Push-to-talk         | `uiohook-napi` in 4b (with mic permission already granted in 3)    | Requires same Accessibility permission already requested    |

---

## File-level plan

### New main-process modules

```
src/main/
  store/
    settings.ts          # electron-store wrapper + zod-validated schema + migrations
    history.ts           # encrypted ring-buffer of last 50 transcriptions
    secrets.ts           # keytar wrapper (set/get/delete/test)
  windows/
    settings.ts          # window manager (open/focus/close)
    history.ts           # window manager
    onboarding.ts        # window manager + first-run detection
  ipc/
    handlers.ts          # extend with settings/history/secrets channels
  utils/
    devices.ts           # enumerateDevices wrapper for renderer
```

### New renderer apps

```
src/renderer/
  shared/
    components/          # Button, Input, Toggle, Select, Card, Toast
    tokens.ts            # design tokens from §11.4
    use-settings.ts      # zustand bridge to main
  settings/
    index.html
    main.tsx
    App.tsx              # sidebar + outlet router
    pages/
      General.tsx
      Hotkeys.tsx
      Audio.tsx
      Transcription.tsx
      Vocabulary.tsx
      About.tsx
    components/
      HotkeyCapture.tsx
      ApiKeyInput.tsx
      VocabularyEditor.tsx
  history/
    index.html
    main.tsx
    App.tsx              # search + list + actions
    components/
      HistoryRow.tsx
      ExportDialog.tsx
  onboarding/
    index.html
    main.tsx
    App.tsx              # step machine
    steps/
      Welcome.tsx
      MicPermission.tsx
      AccessibilityPermission.tsx
      ApiKey.tsx
      HotkeySetup.tsx
      Demo.tsx
```

### Dep adds

- `zod ^3.23.0` — settings schema validation
- (everything else already installed)

---

## Open questions before implementation

1. **Push-to-talk timing** — include in 4b (recommended) or defer to Sprint 5? Hotkey settings page exists either way; difference is only whether the toggle does anything.
2. **`.env.local` after migration** — keep as dev fallback (recommended) or remove entirely once keytar is the primary path?
3. **History dedupe** — if a user transcribes the same sentence twice in 5 minutes, store both or keep just the latest? (recommended: store both, with timestamps — easier to grep "what did I dictate yesterday")
4. **Onboarding skip** — allow skip (with warning that some features won't work) or force-complete? (recommended: allow skip on dev/macOS-permissions screens since users can grant later; force on API key screen)
5. **Settings file location** — default `app.getPath('userData')` (recommended) or expose to user? (recommended: default, document path in About page)

---

## Verification gate (Sprint 4 done = all of these green)

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Manual QA:

- Open Settings from tray, set API key, "Test connection" returns OK
- Quit app, restart — API key still works, no `.env.local` needed
- Change hotkey via HotkeyCapture, restart not required, new combo fires
- Add 3 vocabulary terms, transcribe with one of them — Whisper recognizes it
- Open History, see last few transcriptions, search filters in real time, re-paste works
- Delete user-data dir, launch fresh — onboarding shows, completes, settings persist

---

## What this plan does NOT cover

- **Phase 3 features** (post-processing GPT-4o-mini, usage stats, local Whisper) — Sprint 6+
- **Auto-update** — that's Sprint 5 packaging
- **Code signing** — Sprint 5 packaging
- **Push-to-talk fine-tuning** (e.g., key-up dead zones, hold threshold) — likely a v1.1 polish
- **Settings import/export** — backlog (low priority for v1)
- **Hallucination filter** — design + ship in Sprint 4b alongside vocabulary work, OR Sprint 5 polish if time-tight (re-evaluate after 4a done)

---

## Recommendation

Start with **Sprint 4a** as scoped here. After 4a's commit, re-read this plan
and confirm 4b/4c scope still matches your priorities — sub-sprint scope is
easier to adjust between commits than mid-stream.
