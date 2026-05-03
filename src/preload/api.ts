import { ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc-channels';
import type { StateUpdate } from '../shared/types';

type Unsubscribe = () => void;

function subscribe<T>(channel: string, listener: (payload: T) => void): Unsubscribe {
  const wrapper = (_event: unknown, payload: T): void => listener(payload);
  ipcRenderer.on(channel, wrapper);
  return () => ipcRenderer.off(channel, wrapper);
}

export interface VoiceToTextApi {
  recording: {
    onStart(cb: () => void): Unsubscribe;
    onStop(cb: () => void): Unsubscribe;
    sendAudio(data: ArrayBuffer, mimeType: string): void;
    cancel(): void;
  };
  state: {
    onUpdate(cb: (update: StateUpdate) => void): Unsubscribe;
  };
}

export const api: VoiceToTextApi = {
  recording: {
    onStart: (cb) => subscribe<void>(IPC.recording.start, () => cb()),
    onStop: (cb) => subscribe<void>(IPC.recording.stop, () => cb()),
    sendAudio: (data, mimeType) => ipcRenderer.send(IPC.recording.audio, { data, mimeType }),
    cancel: () => ipcRenderer.send(IPC.recording.cancel)
  },
  state: {
    onUpdate: (cb) => subscribe<StateUpdate>(IPC.state.update, cb)
  }
};
