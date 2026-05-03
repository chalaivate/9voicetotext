export const IPC = {
  recording: {
    start: 'recording:start',
    stop: 'recording:stop',
    audio: 'recording:audio',
    cancel: 'recording:cancel'
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
