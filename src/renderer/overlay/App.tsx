import { useEffect, useRef, useState } from 'react';
import type { AppState, HotkeyMode, StateUpdate } from '../../shared/types';
import { startRecording, type RecordingHandle } from './recorder/media-recorder';
import { startChunkedRecording, type ChunkedRecorderHandle } from './recorder/chunked-recorder';
import { SilenceDetector, rmsFromAnalyser } from './recorder/silence-detector';
import { StatusOrb } from './components/StatusOrb';
import { Waveform } from './components/Waveform';
import { overlayStyles } from './styles';
import { errorBeep, startBeep, stopBeep } from './sounds/beeps';

interface AudioConfig {
  deviceId: string;
  sampleRate: 16000 | 24000 | 48000;
  showWaveform: boolean;
  soundEnabled: boolean;
  /** 0..1 — mirrors settings.ui.soundVolume (0..100). */
  soundVolume: number;
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

/** Thai headline per state — the big line the user reads at a glance. */
const labels: Record<AppState, string> = {
  idle: 'พร้อมใช้งาน',
  recording: 'กำลังฟัง',
  processing: 'กำลังถอดเสียง',
  injecting: 'กำลังวางข้อความ',
  success: 'เสร็จเรียบร้อย',
  error: 'เกิดข้อผิดพลาด'
};

/** English micro-caption shown in the state chip next to the headline. */
const captions: Record<AppState, string> = {
  idle: 'READY',
  recording: 'LISTENING',
  processing: 'TRANSCRIBING',
  injecting: 'PASTING',
  success: 'DONE',
  error: 'ERROR'
};

/** Secondary hint per state (used when there is no richer text to show). */
const hints: Record<AppState, string> = {
  idle: 'กด hotkey เพื่อเริ่มพูด',
  recording: 'พูดได้เลย · กด hotkey อีกครั้งเพื่อหยุด',
  processing: 'AI กำลังแปลงเสียงเป็นข้อความ…',
  injecting: 'กำลังส่งข้อความไปยังเคอร์เซอร์…',
  success: '',
  error: ''
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
  /** Mode badge (LIVE / AUTO / PTT) mirrored from settings so it can render. */
  const [modeBadge, setModeBadge] = useState<string>('');
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
    soundVolume: 0.3,
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
      setModeBadge(badgeFor(s.hotkey.mode, s.transcription.streaming));
      configRef.current = {
        deviceId: s.audio.inputDeviceId,
        sampleRate: s.audio.sampleRate,
        showWaveform: s.ui.showWaveform,
        soundEnabled: s.ui.soundEnabled,
        soundVolume: s.ui.soundVolume / 100,
        hotkeyMode: s.hotkey.mode,
        silenceThresholdRms: s.audio.silenceThresholdRms,
        silenceDurationMs: s.audio.silenceDurationMs,
        streaming: s.transcription.streaming,
        streamingChunkMs: s.transcription.streamingChunkMs
      };
    });
    const off = window.voiceToText.settings.onChange((s) => {
      setModeBadge(badgeFor(s.hotkey.mode, s.transcription.streaming));
      configRef.current = {
        deviceId: s.audio.inputDeviceId,
        sampleRate: s.audio.sampleRate,
        showWaveform: s.ui.showWaveform,
        soundEnabled: s.ui.soundEnabled,
        soundVolume: s.ui.soundVolume / 100,
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
        if (cfg.soundEnabled) startBeep(cfg.soundVolume);

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
      if (configRef.current.soundEnabled) stopBeep(configRef.current.soundVolume);
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
        errorBeep(configRef.current.soundVolume);
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

  const stateText = labels[state];

  // Sprint 4d Phase 2 — show "auto-stop in Xs" countdown when silence has
  // been detected, only in auto-stop mode and during recording.
  const autoStopHint =
    state === 'recording' &&
    configRef.current.hotkeyMode === 'auto-stop' &&
    silenceRemainingMs !== null
      ? `เงียบอยู่ · หยุดอัตโนมัติใน ${Math.ceil(silenceRemainingMs / 1000)}s`
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
          : (autoStopHint ?? hints[state]);

  const isInterim = state === 'recording' && !!interimText;
  const showWave = state === 'recording' && !!analyser && configRef.current.showWaveform;
  const busy = state === 'processing' || state === 'injecting';

  return (
    <>
      <style>{overlayStyles}</style>
      <div className={`ovl ovl--${state}`} role="status" aria-live="polite">
        <div className="ovl__sheen" />
        <StatusOrb state={state} />

        <div className="ovl__body">
          <div className="ovl__title-row">
            <span className="ovl__title">{stateText}</span>
            {state === 'recording' && <span className="ovl__timer">{formatTime(elapsedSec)}</span>}
            <span className="ovl__chip">{captions[state]}</span>
            {modeBadge && state === 'recording' && (
              <span className="ovl__chip ovl__chip--mode">{modeBadge}</span>
            )}
          </div>
          {subText && (
            <div
              className={
                isInterim
                  ? 'ovl__sub ovl__sub--interim'
                  : state === 'success'
                    ? 'ovl__sub ovl__sub--result'
                    : 'ovl__sub'
              }
              title={subText}
            >
              {isInterim ? tailOfText(subText, 180) : subText}
            </div>
          )}
        </div>

        {showWave && (
          <div className="ovl__wave">
            <Waveform analyser={analyser} width={84} height={34} />
          </div>
        )}
        {busy && (
          <div className="ovl__dots" aria-hidden>
            <span />
            <span />
            <span />
          </div>
        )}

        <div className={`ovl__bar${busy ? ' ovl__bar--busy' : ''}`} />
        <div className="ovl__brand">9VoiceToText</div>
      </div>
    </>
  );
}

function badgeFor(mode: HotkeyMode, streaming: boolean): string {
  if (streaming) return 'LIVE';
  if (mode === 'auto-stop') return 'AUTO';
  if (mode === 'push-to-talk') return 'PTT';
  return '';
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
