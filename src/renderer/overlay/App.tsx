import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { AppState, HotkeyMode, StateUpdate } from '../../shared/types';
import { startRecording, type RecordingHandle } from './recorder/media-recorder';
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
}

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
  const handleRef = useRef<RecordingHandle | null>(null);
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
    silenceDurationMs: 10_000
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
        silenceDurationMs: s.audio.silenceDurationMs
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
        silenceDurationMs: s.audio.silenceDurationMs
      };
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  // Subscribe to main-process events.
  useEffect(() => {
    const offStart = window.voiceToText.recording.onStart(async () => {
      const myToken = ++startTokenRef.current;
      try {
        if (configRef.current.soundEnabled) startBeep();
        const handle = await startRecording({
          deviceId: configRef.current.deviceId,
          sampleRate: configRef.current.sampleRate
        });
        // Race check — if a stop arrived while we were awaiting getUserMedia,
        // startTokenRef will have been bumped. Release the just-opened stream
        // instead of stashing it (which would leak the mic indefinitely).
        if (myToken !== startTokenRef.current) {
          handle.cancel();
          return;
        }
        handleRef.current = handle;
        setAnalyser(handle.analyser);

        // Sprint 4d Phase 2 — Auto-stop VAD. Spin up a SilenceDetector that
        // polls the same analyser node. When silence persists for the
        // configured duration we ping main, which runs the same path as a
        // user-pressed stop. Detector is torn down in onStop/cleanup.
        if (configRef.current.hotkeyMode === 'auto-stop') {
          const cfg = configRef.current;
          const detector = new SilenceDetector({
            rmsSource: rmsFromAnalyser(handle.analyser),
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
      const handle = handleRef.current;
      handleRef.current = null;
      setAnalyser(null);
      if (!handle) return;
      try {
        const { data, mimeType } = await handle.stop();
        window.voiceToText.recording.sendAudio(data, mimeType);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('recorder stop failed', err);
        window.voiceToText.recording.cancel();
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

  const subText =
    state === 'success'
      ? text
      : state === 'error'
        ? message || 'Unknown error'
        : (autoStopHint ?? '');

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
          {subText && <div style={subtleRow}>{subText}</div>}
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
