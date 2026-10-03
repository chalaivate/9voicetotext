export const IPC = {
  recording: {
    start: 'recording:start',
    stop: 'recording:stop',
    audio: 'recording:audio',
    cancel: 'recording:cancel',
    /** Sprint 4d Phase 2 — renderer-detected silence triggers auto-stop. */
    autoStop: 'recording:autoStop',
    /** Sprint 4d Phase 4 — one chunk of audio in streaming mode. */
    chunk: 'recording:chunk',
    /**
     * Sprint 4d Phase 4+ — renderer detected the entire recording was
     * effectively silent (mic muted / no audio crossed the floor RMS).
     * Skip Whisper entirely and surface a friendly error.
     */
    silentAudio: 'recording:silentAudio'
  },
  state: {
    update: 'state:update'
  },
  settings: {
    get: 'settings:get',
    set: 'settings:set',
    reset: 'settings:reset',
    changed: 'settings:changed'
  },
  secrets: {
    setApiKey: 'secrets:setApiKey',
    hasApiKey: 'secrets:hasApiKey',
    deleteApiKey: 'secrets:deleteApiKey',
    testApiKey: 'secrets:testApiKey',
    keyMask: 'secrets:keyMask'
  },
  hotkey: {
    /** Test whether an accelerator string can be registered. */
    check: 'hotkey:check'
  },
  vocabulary: {
    /** Compose preview of the prompt that will be sent to Whisper. */
    preview: 'vocabulary:preview'
  },
  app: {
    /** Version / runtime info for the About page (renderer is sandboxed). */
    info: 'app:info'
  },
  windows: {
    openSettings: 'windows:openSettings',
    openHistory: 'windows:openHistory',
    closeSelf: 'windows:closeSelf'
  },
  history: {
    /** invoke → HistoryEntry[] (newest first). */
    list: 'history:list',
    /** invoke(id) → true. */
    remove: 'history:remove',
    /** invoke → true. */
    clear: 'history:clear',
    /** invoke(id) → true; main writes the entry text to the OS clipboard. */
    copy: 'history:copy',
    /** main → renderer broadcast with the full list after any change. */
    changed: 'history:changed'
  }
} as const;
