import type { VoiceToTextApi } from '../preload/api';

declare global {
  interface Window {
    voiceToText: VoiceToTextApi;
  }
}

export {};
