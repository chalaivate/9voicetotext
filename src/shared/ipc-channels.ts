export const IPC = {
  recording: {
    start: 'recording:start',
    stop: 'recording:stop',
    audio: 'recording:audio',
    cancel: 'recording:cancel',
    /** Sprint 4d Phase 2 — renderer-detected silence triggers auto-stop. */
    autoStop: 'recording:autoStop'
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
  windows: {
    openSettings: 'windows:openSettings',
    openHistory: 'windows:openHistory',
    closeSelf: 'windows:closeSelf'
  },
  history: {
    list: 'history:list',
    add: 'history:add',
    clear: 'history:clear'
  }
} as const;
