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
    set: 'settings:set'
  },
  history: {
    list: 'history:list',
    add: 'history:add',
    clear: 'history:clear'
  }
} as const;
