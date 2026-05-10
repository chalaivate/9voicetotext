# Install Workaround — 9VoiceToText v1.0

9VoiceToText v1.0 ships **unsigned** because the project does not yet have
an Apple Developer account or a Windows code-signing certificate. macOS
Gatekeeper and Windows SmartScreen will warn you on first launch. This
document walks through the click-through. Once you trust the app once, the
warnings stop on subsequent launches and updates.

> **Why unsigned?** Code signing certs cost money + admin overhead and
> aren't strictly required for a private/team tool. We plan to sign in
> v1.1 once the certs are in place. Track the issue at
> `docs/spec-changes.md` (entry "Sprint 5 will ship UNSIGNED installers").

---

## 🍎 macOS — bypass Gatekeeper

You will see one of two errors on first launch:

> "9VoiceToText" cannot be opened because the developer cannot be verified.
> "9VoiceToText is damaged and can't be opened. You should move it to the Trash."

Both mean the same thing: the app isn't signed and notarized by Apple.

### Method 1 — Right-click → Open (easiest)

1. Open Finder → **Applications**.
2. **Right-click** `9VoiceToText.app` → **Open**.
3. macOS shows the warning again, but now with an extra **Open** button. Click it.
4. App launches. Done — future launches don't show the warning.

> If you only see "Move to Trash / Cancel" with no "Open" button, use Method 2.

### Method 2 — Strip the quarantine attribute (always works)

Open **Terminal** and run:

```bash
xattr -d com.apple.quarantine /Applications/9VoiceToText.app
```

Then double-click the app in Finder. It opens cleanly.

### Method 3 — System Settings override

1. Try to open the app once (it gets blocked).
2. Open **System Settings → Privacy & Security**.
3. Scroll down to the security message: _"9VoiceToText was blocked from use because it is not from an identified developer."_
4. Click **Open Anyway**.
5. Relaunch the app — it opens.

---

## 🪟 Windows — bypass SmartScreen

You will see this dialog the first time you run the installer or portable .exe:

> Windows protected your PC
> Microsoft Defender SmartScreen prevented an unrecognized app from starting.
> Running this app might put your PC at risk.

### How to proceed

1. Click **More info** (small text, easy to miss).
2. Click **Run anyway** (button appears after clicking More info).
3. UAC may prompt for admin if you used the installer — click **Yes**.
4. App installs / runs normally. Subsequent launches don't show the warning.

> The installer and portable build are functionally identical. The portable
> version doesn't write to the registry — useful for USB stick / non-admin use.

---

## 🔐 Permission grants you'll need after install

Both platforms need a couple of permissions for paste + hotkey to work.

### macOS

System Settings → **Privacy & Security**:

| Permission           | Why                                                           |
| -------------------- | ------------------------------------------------------------- |
| **Microphone**       | record audio for transcription                                |
| **Accessibility**    | simulate Cmd+V keystroke to paste at cursor                   |
| **Input Monitoring** | (optional) needed for push-to-talk key-up detection (uiohook) |

The app will prompt for Microphone the first time you press the hotkey.
Accessibility / Input Monitoring you may need to add manually:

1. System Settings → **Privacy & Security → Accessibility** → click `+` →
   navigate to `/Applications/9VoiceToText.app` → toggle ON.
2. Same for **Input Monitoring** if you use push-to-talk mode.

### Windows

No upfront permissions. Windows will ask you to allow microphone access
the first time you record. Click **Yes**.

---

## 🆘 Still stuck?

Open an issue at <https://github.com/9expert-training/9voicetotext/issues>
with:

- macOS / Windows version
- Exact error message (screenshot helps)
- Whether it's the installer or portable build
- Hotkey mode + which app you tried to paste into
