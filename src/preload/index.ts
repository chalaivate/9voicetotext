import { contextBridge } from 'electron';
import { api, type VoiceToTextApi } from './api';

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('voiceToText', api);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('contextBridge.exposeInMainWorld failed', err);
  }
} else {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).voiceToText = api;
}

declare global {
  interface Window {
    voiceToText: VoiceToTextApi;
  }
}
