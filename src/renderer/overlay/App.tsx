import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { AppState, HotkeyMode, StateUpdate } from '../../shared/types';
import { startRecording, type RecordingHandle } from './recorder/media-recorder';
import { startChunkedRecording, type ChunkedRecorderHandle } from './recorder/chunked-recorder';
import { SilenceDetector, rmsFromAnalyser } from './recorder/silence-detector';
import { StatusBadge } from './components/StatusBadge';
import { Waveform } from './components/Waveform';
import { errorBeep, startBeep, stopBeep } from './sounds/beeps';

interface AudioConfig {
  deviceId: string;
  sampleRate: 16000 | 24000 | 48000;
  showWaveform: boolean;
  soundEnabled: boolean;
  /** Sprint 4d Phase 2 — auto-stop VAD config. Read each recording. */
  hotkeyMode: HotkeyMode;
  silenceThresholdRms: number;
  silenceDurationMs: number;
  /** Sprint 4d Phase 4 — chunked streaming. */
  streaming: boolean;
  streamingChunkMs: number;
}

/**
 * Sprint 4d Phase 4+ — minimum peak RMS for a recording to be considered
 * non-silent. With autoGainControl disabled (see media-recorder.ts) the
 * separation is crisp: a muted / digitally-silent mic reads ~0.0000-0.0005,
 * a quiet open room ~0.001-0.002, and even soft whisper-level speech sits
 * at ~0.01+. 0.003 lands above the open-room floor but ~3× below soft
 * speech, so it blocks muted/no-speech recordings (which would otherwise
 * make Whisper hallucinate from the vocabulary prompt) without clipping a
 * real soft talker. Hardcoded for now; promote to a setting if needed.
 */
const SILENT_AUDIO_RMS_THRESHOLD = 0.003;

const labels: Record<AppState, string> = {
  idle: 'Ready',
  recording: 'กำลังบันทึก…',
  processing: 'กำลังแปลง…',
  injecting: 'กำลังวาง…',
  success: 'เสร็จแล้ว',
  error: 'เกิดข้อผิดพลาด'
};

const backgrounds: Record<AppState, string> = {
  idle: 'rgba(13, 27, 42, 0.85)',
  recording: 'rgba(255, 59, 48, 0.92)',
  processing: 'rgba(36, 134, 255, 0.92)',
  injecting: 'rgba(36, 134, 255, 0.92)',
  success: 'rgba(52, 199, 89, 0.92)',
  error: 'rgba(255, 149, 0, 0.95)'
};

export default function App(): JSX.Element {
  const [state, setState] = useState<AppState>('idle');
  const [text, setText] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  /** Sprint 4d Phase 2 — countdown shown while VAD is waiting for silence. */
  const [silenceRemainingMs, setSilenceRemainingMs] = useState<number | null>(null);
  /** Sprint 4d Phase 4 — running text from streaming mode, shown live during recording. */
  const [interimText, setInterimText] = useState<string>('');
  const handleRef = useRef<RecordingHandle | null>(null);
  /** Sprint 4d Phase 4 — chunked recorder used when settings.transcription.streaming === true. */
  const chunkedRef = useRef<ChunkedRecorderHandle | null>(null);
  const detectorRef = useRef<SilenceDetector | null>(null);
  const lastStateRef = useRef<AppState>('idle');
  /**
   * Generation token for race-safe start/stop. Bumped on every stop. Each
   * onStart captures the current value; if startRecording's getUserMedia
   * resolves AFTER a stop arrived (PTT tap below minDurationMs is the
   * common case), the token will mismatch and we release the just-opened
   * stream instead of leaking the mic.
   */
  const startTokenRef = useRef<number>(0);
  const configRef = useRef<AudioConfig>({
    deviceId: '',
    sampleRate: 16000,
    showWaveform: true,
    soundEnabled: true,
    hotkeyMode: 'toggle',
    silenceThresholdRms: 0.015,
    silenceDurationMs: 10_000,
    streaming: false,
    streamingChunkMs: 5_000
  });

  // Read settings on mount + watch for changes so device/sample rate updates
  // take effect on the next recording without restarting the app.
  useEffect(() => {
    let cancelled = false;
    void window.voiceToText.settings.get().then((s) => {
      if (cancelled) return;
      configRef.current = {
        deviceId: s.audio.inputDeviceId,
        sampleRate: s.audio.sampleRate,
        showWaveform: s.ui.showWaveform,
        soundEnabled: s.ui.soundEnabled,
        hotkeyMode: s.hotkey.mode,
        silenceThresholdRms: s.audio.silenceThresholdRms,
        silenceDurationMs: s.audio.silenceDurationMs,
        streaming: s.transcription.streaming,
        streamingChunkMs: s.transcription.streamingChunkMs
      };
    });
    const off = window.voiceToText.settings.onChange((s) => {
      configRef.current = {
        deviceId: s.audio.inputDeviceId,
        sampleRate: s.audio.sampleRate,
        showWaveform: s.ui.showWaveform,
        soundEnabled: s.ui.soundEnabled,
        hotkeyMode: s.hotkey.mode,
        silenceThresholdRms: s.audio.silenceThresholdRms,
        silenceDurationMs: s.audio.silenceDurationMs,
        streaming: s.transcription.streaming,
        streamingChunkMs: s.transcription.streamingChunkMs
      };
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  // Subscribe to main-process events.
  useEffect(() => {
    const attachSilenceDetector = (analyser: AnalyserNode): void => {
      if (configRef.current.hotkeyMode !== 'auto-stop') return;
      const cfg = configRef.current;
      const detector = new SilenceDetector({
        rmsSource: rmsFromAnalyser(analyser),
        thresholdRms: cfg.silenceThresholdRms,
        silenceDurationMs: cfg.silenceDurationMs,
        onSilenceTimeout: () => {
          setSilenceRemainingMs(null);
          window.voiceToText.recording.autoStop();
        },
        onUpdate: ({ silentForMs, isSilent }) => {
          if (!isSilent) {
            setSilenceRemainingMs(null);
            return;
          }
          setSilenceRemainingMs(Math.max(0, cfg.silenceDurationMs - silentForMs));
        }
      });
      detectorRef.current = detector;
      detector.start();
    };

    const offStart = window.voiceToText.recording.onStart(async () => {
      const myToken = ++startTokenRef.current;
      const cfg = configRef.current;
      try {
        if (cfg.soundEnabled) startBeep();

        // Sprint 4d Phase 4 — branch on streaming mode. Both branches end
        // up registering the same analyser for the waveform UI + the
        // SilenceDetector (auto-stop mode).
        if (cfg.streaming) {
          const chunked = await startChunkedRecording(
            {
              deviceId: cfg.deviceId,
              sampleRate: cfg.sampleRate,
              chunkDurationMs: cfg.streamingChunkMs
            },
            {
              onChunk: ({ data, mimeType, index, isFinal, durationMs }) => {
                window.voiceToText.recording.sendChunk({
                  data,
                  mimeType,
                  index,
                  isFinal,
                  durationMs
                });
              },
              onError: (err) => {
                // eslint-disable-next-line no-console
                console.error('chunked recorder error', err);
              }
            }
          );
          if (myToken !== startTokenRef.current) {
            chunked.cancel();
            return;
          }
          chunkedRef.current = chunked;
          setAnalyser(chunked.analyser);
          attachSilenceDetector(chunked.analyser);
        } else {
          const handle = await startRecording({
            deviceId: cfg.deviceId,
            sampleRate: cfg.sampleRate
          });
          // Race check — if a stop arrived while we were awaiting
          // getUserMedia, startTokenRef will have been bumped. Release
          // the just-opened stream instead of stashing it (which would
          // leak the mic indefinitely).
          if (myToken !== startTokenRef.current) {
            handle.cancel();
            return;
          }
          handleRef.current = handle;
          setAnalyser(handle.analyser);
          attachSilenceDetector(handle.analyser);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('mic access failed', err);
        window.voiceToText.recording.cancel();
      }
    });

    const offStop = window.voiceToText.recording.onStop(async () => {
      // Bump token so any in-flight onStart's await knows to bail out.
      startTokenRef.current++;
      if (configRef.current.soundEnabled) stopBeep();
      // Tear down the silence detector first so a final tick can't fire
      // a duplicate autoStop while we're already stopping.
      detectorRef.current?.dispose();
      detectorRef.current = null;
      setSilenceRemainingMs(null);

      const chunked = chunkedRef.current;
      chunkedRef.current = null;
      const handle = handleRef.current;
      handleRef.current = null;
      setAnalyser(null);

      // Race-guard: if neither handle is set, onStart's `await
      // getUserMedia` hadn't resolved yet when stop fired. The pending
      // start will cancel itself via the startToken bump above, but
      // main is still parked in 'recording' — tell it to cancel so the
      // state machine unsticks. Without this the user gets a frozen
      // overlay and "PTT press ignored — pipeline busy" on retries.
      if (!chunked && !handle) {
        window.voiceToText.recording.cancel();
        return;
      }

      // Streaming branch — flush the trailing chunk via stop(); the
      // chunked recorder's onChunk callback emits it with isFinal=true
      // which the controller treats as the "end of recording" trigger.
      if (chunked) {
        const chunkedMaxRms = chunked.getMaxRms();
        // Sprint 4d Phase 4+ — short-circuit silent recordings before
        // any chunk gets to Whisper. Even one loud peak above the floor
        // means real audio was captured somewhere in the session.
        if (chunkedMaxRms < SILENT_AUDIO_RMS_THRESHOLD) {
          chunked.cancel();
          window.voiceToText.recording.silentAudio(chunkedMaxRms);
          return;
        }
        try {
          await chunked.stop();
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('chunked stop failed', err);
          window.voiceToText.recording.cancel();
        }
        return;
      }

      // Non-streaming branch.
      if (handle) {
        const handleMaxRms = handle.getMaxRms();
        // Sprint 4d Phase 4+ — same silent-audio short-circuit for the
        // non-streaming path. Whisper hallucinates from the vocabulary
        // prompt when given silent audio; better to fail fast with a
        // friendly "check your mic" error than waste the API call AND
        // potentially paste a hallucinated sentence.
        if (handleMaxRms < SILENT_AUDIO_RMS_THRESHOLD) {
          handle.cancel();
          window.voiceToText.recording.silentAudio(handleMaxRms);
          return;
        }
        try {
          const { data, mimeType } = await handle.stop();
          window.voiceToText.recording.sendAudio(data, mimeType);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('recorder stop failed', err);
          window.voiceToText.recording.cancel();
        }
      }
    });

    const offState = window.voiceToText.state.onUpdate((update: StateUpdate) => {
      // Play error sound on first transition into error state.
      if (
        update.state === 'error' &&
        lastStateRef.current !== 'error' &&
        configRef.current.soundEnabled
      ) {
        errorBeep();
      }
      lastStateRef.current = update.state;
      setState(update.state);
      setText(update.text ?? '');
      setMessage(update.message ?? '');
      // Sprint 4d Phase 4 — apply interim updates while recording, clear
      // them once we leave the recording state so the success/error UI
      // isn't polluted by stale streaming text.
      if (update.state === 'recording') {
        setInterimText(update.interimText ?? '');
      } else if (
        update.state === 'idle' ||
        update.state === 'success' ||
        update.state === 'error'
      ) {
        setInterimText('');
      }
    });

    return () => {
      offStart();
      offStop();
      offState();
    };
  }, []);

  // Recording timer.
  useEffect(() => {
    if (state !== 'recording') {
      setElapsedSec(0);
      return;
    }
    const start = performance.now();
    const id = window.setInterval(() => {
      setElapsedSec(Math.floor((performance.now() - start) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [state]);

  const containerStyle: CSSProperties = {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    color: '#F8FAFD',
    background: backgrounds[state],
    borderRadius: 14,
    padding: '12px 16px',
    margin: 8,
    height: 'calc(100% - 16px)',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    fontSize: 13,
    lineHeight: 1.3,
    boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
    backdropFilter: 'blur(12px)'
  };

  const titleRow: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontWeight: 600
  };

  const subtleRow: CSSProperties = {
    fontSize: 11,
    opacity: 0.85,
    marginTop: 2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  };

  // Sprint 4d Phase 4 — interim text. Italic + slightly faded to signal
  // "in progress". Multi-line OK but capped at 2 lines so the overlay
  // height stays predictable; we show the tail end of the text (latest
  // chunks) by slicing in JS rather than fighting CSS bidi.
  const interimRow: CSSProperties = {
    fontSize: 11,
    opacity: 0.75,
    fontStyle: 'italic',
    marginTop: 2,
    maxHeight: 32,
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    whiteSpace: 'normal',
    wordBreak: 'break-word'
  };

  const stateText =
    state === 'recording' ? `${labels[state]} ${formatTime(elapsedSec)}` : labels[state];

  // Sprint 4d Phase 2 — show "auto-stop in Xs" countdown when silence has
  // been detected, only in auto-stop mode and during recording.
  const autoStopHint =
    state === 'recording' &&
    configRef.current.hotkeyMode === 'auto-stop' &&
    silenceRemainingMs !== null
      ? `auto-stop ใน ${Math.ceil(silenceRemainingMs / 1000)}s`
      : null;

  // Sprint 4d Phase 4 — interim streaming text takes priority over the
  // auto-stop countdown when both could show. The countdown is implied
  // by the silence anyway (no new text arriving).
  const subText =
    state === 'success'
      ? text
      : state === 'error'
        ? message || 'Unknown error'
        : state === 'recording' && interimText
          ? interimText
          : (autoStopHint ?? '');

  const isInterim = state === 'recording' && !!interimText;

  return (
    <>
      <style>{`
        @keyframes pulse {
          0%   { box-shadow: 0 0 0 0   rgba(255, 255, 255, 0.45); }
          70%  { box-shadow: 0 0 0 10px rgba(255, 255, 255, 0); }
          100% { box-shadow: 0 0 0 0   rgba(255, 255, 255, 0); }
        }
        body, html, #root { margin: 0; padding: 0; height: 100%; background: transparent; overflow: hidden; }
      `}</style>
      <div style={containerStyle}>
        <StatusBadge state={state} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={titleRow}>{stateText}</div>
          {subText && (
            <div style={isInterim ? interimRow : subtleRow}>
              {isInterim ? tailOfText(subText, 180) : subText}
            </div>
          )}
        </div>
        {state === 'recording' && analyser && configRef.current.showWaveform && (
          <Waveform analyser={analyser} width={96} height={36} />
        )}
      </div>
    </>
  );
}

function formatTime(sec: number): string {
  const mm = Math.floor(sec / 60)
    .toString()
    .padStart(1, '0');
  const ss = (sec % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * Sprint 4d Phase 4 — show the last N characters of interim text so the
 * user sees the most recently transcribed words (the "live" part) rather
 * than the start of a long session. Prefix with ellipsis when truncated.
 */
function tailOfText(text: string, max: number): string {
  if (text.length <= max) return text;
  return `…${text.slice(-max)}`;
}
