import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Card, Field } from '../../shared/components/Card';
import { Select } from '../../shared/components/Select';
import { Button } from '../../shared/components/Button';
import { useSettings } from '../../shared/use-settings';
import { tokens } from '../../shared/tokens';
import { toast } from '../../shared/components/Toast';

interface AudioDevice {
  deviceId: string;
  label: string;
}

export function AudioPage(): JSX.Element {
  const settings = useSettings((s) => s.settings);
  const patch = useSettings((s) => s.patch);
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');

  useEffect(() => {
    void loadDevices();
    const refresh = (): void => void loadDevices();
    navigator.mediaDevices?.addEventListener('devicechange', refresh);
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', refresh);
    };
  }, []);

  async function loadDevices(): Promise<void> {
    try {
      // Without an active getUserMedia grant, enumerateDevices returns empty
      // labels. We attempt a probe so labels are populated.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        setPermission('granted');
      } catch {
        setPermission('denied');
      }
      const all = await navigator.mediaDevices.enumerateDevices();
      const audio = all
        .filter((d) => d.kind === 'audioinput')
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${d.deviceId.slice(0, 6)}`
        }));
      setDevices(audio);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('enumerateDevices failed', err);
    }
  }

  if (!settings) return <div />;

  const deviceOptions = [
    { value: '', label: 'System default' },
    ...devices.map((d) => ({ value: d.deviceId, label: d.label }))
  ];

  return (
    <>
      <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 24px' }}>Audio</h1>

      <Card title="Microphone" description="Select which input to record from.">
        {permission === 'denied' && (
          <div style={warning}>
            Microphone permission was not granted yet. Click <strong>Test recording</strong> below
            and approve the prompt to populate device names.
          </div>
        )}
        <Field label="Input device" hint="Defaults to your system microphone.">
          <Select
            value={settings.audio.inputDeviceId}
            onValueChange={(v) => void patch({ audio: { inputDeviceId: v } })}
            options={deviceOptions}
          />
        </Field>
        <Field
          label="Sample rate"
          hint="16 kHz works best for Whisper. Higher rates use more bandwidth."
        >
          <Select
            value={String(settings.audio.sampleRate)}
            onValueChange={(v) =>
              void patch({ audio: { sampleRate: Number(v) as 16000 | 24000 | 48000 } })
            }
            options={[
              { value: '16000', label: '16 kHz (recommended)' },
              { value: '24000', label: '24 kHz' },
              { value: '48000', label: '48 kHz' }
            ]}
          />
        </Field>
      </Card>

      <Card
        title="Test recording"
        description="Record 3 seconds and play it back to verify levels."
      >
        <TestRecorder
          deviceId={settings.audio.inputDeviceId}
          sampleRate={settings.audio.sampleRate}
        />
      </Card>

      <Card
        title="Auto-stop silence detection"
        description="Tune how the app decides the room is quiet enough to end recording. Used only when Hotkeys mode = Auto-stop."
      >
        <Field
          label="Silence threshold (RMS)"
          hint="Lower = more sensitive (stops sooner in moderate noise). Click Calibrate to see your room's level."
        >
          <SliderField
            min={0}
            max={0.1}
            step={0.001}
            value={settings.audio.silenceThresholdRms}
            format={(v) => v.toFixed(3)}
            onChange={(v) => void patch({ audio: { silenceThresholdRms: v } })}
          />
        </Field>
        <Field
          label="Auto-stop delay"
          hint="How long the room must stay quiet before the app sends the audio."
        >
          <SliderField
            min={1000}
            max={30000}
            step={500}
            value={settings.audio.silenceDurationMs}
            format={(v) => `${(v / 1000).toFixed(1)} s`}
            onChange={(v) => void patch({ audio: { silenceDurationMs: v } })}
          />
        </Field>
        <CalibrateMeter
          deviceId={settings.audio.inputDeviceId}
          sampleRate={settings.audio.sampleRate}
          threshold={settings.audio.silenceThresholdRms}
        />
      </Card>
    </>
  );
}

interface SliderFieldProps {
  min: number;
  max: number;
  step: number;
  value: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}

function SliderField({ min, max, step, value, format, onChange }: SliderFieldProps): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: tokens.color.brandBlue }}
      />
      <span
        style={{
          fontFamily: tokens.font.mono,
          fontSize: 12,
          color: tokens.color.text,
          minWidth: 56,
          textAlign: 'right'
        }}
      >
        {format(value)}
      </span>
    </div>
  );
}

interface CalibrateMeterProps {
  deviceId: string;
  sampleRate: 16000 | 24000 | 48000;
  threshold: number;
}

/**
 * Live RMS meter with the current threshold marked. Lets the user pick a
 * value that's above their ambient noise but below their speaking level.
 * Mic stream is opened only while active; stopped automatically on unmount.
 */
function CalibrateMeter({ deviceId, sampleRate, threshold }: CalibrateMeterProps): JSX.Element {
  const [active, setActive] = useState(false);
  const [rms, setRms] = useState(0);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  async function start(): Promise<void> {
    try {
      const audioConstraints: MediaTrackConstraints = {
        sampleRate,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      };
      if (deviceId) audioConstraints.deviceId = { exact: deviceId };
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);

      let stopped = false;
      const tick = (): void => {
        if (stopped) return;
        analyser.getByteTimeDomainData(data);
        let sumSq = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i]! - 128) / 128;
          sumSq += v * v;
        }
        setRms(Math.sqrt(sumSq / data.length));
        requestAnimationFrame(tick);
      };
      tick();

      cleanupRef.current = () => {
        stopped = true;
        stream.getTracks().forEach((t) => t.stop());
        try {
          source.disconnect();
          analyser.disconnect();
        } catch {
          // ignore
        }
        void audioCtx.close();
        setRms(0);
      };
      setActive(true);
    } catch (err) {
      toast(`Mic open failed: ${(err as Error).message}`, 'error', 4000);
    }
  }

  function stop(): void {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setActive(false);
  }

  // Scale: clamp 0..0.1 RMS to bar width — matches the slider range so the
  // marker position is intuitive against the threshold value.
  const SCALE_MAX = 0.1;
  const rmsPct = Math.min(100, (rms / SCALE_MAX) * 100);
  const thresholdPct = Math.min(100, (threshold / SCALE_MAX) * 100);
  const aboveThreshold = rms >= threshold;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 12 }}>
      <div style={{ position: 'relative', width: '100%', height: 12 }}>
        <div style={meterTrack}>
          <div
            style={{
              width: `${active ? rmsPct : 0}%`,
              height: '100%',
              background: aboveThreshold ? tokens.color.success : tokens.color.textDim,
              borderRadius: 4,
              transition: 'width 60ms linear'
            }}
          />
        </div>
        {/* Threshold marker */}
        <div
          style={{
            position: 'absolute',
            left: `${thresholdPct}%`,
            top: -2,
            bottom: -2,
            width: 2,
            background: tokens.color.warning,
            transform: 'translateX(-1px)'
          }}
          title={`Threshold ${threshold.toFixed(3)}`}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Button variant="ghost" size="sm" onClick={active ? stop : start}>
          {active ? 'Stop calibrate' : 'Calibrate (live meter)'}
        </Button>
        <span style={{ fontSize: 11, color: tokens.color.textDim, fontFamily: tokens.font.mono }}>
          {active ? `RMS ${rms.toFixed(3)} ${aboveThreshold ? '· loud' : '· silent'}` : ''}
        </span>
      </div>
    </div>
  );
}

interface TestRecorderProps {
  deviceId: string;
  sampleRate: 16000 | 24000 | 48000;
}

type TestStatus = 'idle' | 'recording' | 'playing' | 'done';

function TestRecorder({ deviceId, sampleRate }: TestRecorderProps): JSX.Element {
  const [status, setStatus] = useState<TestStatus>('idle');
  const [level, setLevel] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  async function start(): Promise<void> {
    setStatus('recording');
    setLevel(0);
    try {
      const audioConstraints: MediaTrackConstraints = {
        sampleRate,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      };
      if (deviceId) audioConstraints.deviceId = { exact: deviceId };
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);

      let raf = 0;
      const tick = (): void => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (let i = 0; i < data.length; i++) {
          const v = Math.abs((data[i]! - 128) / 128);
          if (v > peak) peak = v;
        }
        setLevel(peak);
        raf = requestAnimationFrame(tick);
      };
      tick();

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
        audioBitsPerSecond: 32_000
      });
      const chunks: BlobPart[] = [];
      recorder.addEventListener('dataavailable', (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      });
      recorder.start(250);

      const stopAfter = setTimeout(() => recorder.stop(), 3000);

      const cleanup = (): void => {
        cancelAnimationFrame(raf);
        clearTimeout(stopAfter);
        stream.getTracks().forEach((t) => t.stop());
        try {
          source.disconnect();
          analyser.disconnect();
        } catch {
          // already disconnected — ignore
        }
        void audioCtx.close();
      };
      cleanupRef.current = cleanup;

      recorder.addEventListener(
        'stop',
        () => {
          cleanup();
          cleanupRef.current = null;
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.addEventListener('ended', () => {
            URL.revokeObjectURL(url);
            setStatus('done');
          });
          audioRef.current = audio;
          setStatus('playing');
          void audio.play();
        },
        { once: true }
      );
    } catch (err) {
      setStatus('idle');
      toast(`Recording failed: ${(err as Error).message}`, 'error', 4000);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
      <LevelMeter level={level} active={status === 'recording'} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button
          variant="primary"
          size="sm"
          onClick={start}
          disabled={status === 'recording' || status === 'playing'}
        >
          {status === 'recording'
            ? 'Recording 3s…'
            : status === 'playing'
              ? 'Playing back…'
              : 'Test recording'}
        </Button>
        <span style={{ fontSize: 11, color: tokens.color.textDim }}>
          {status === 'done' ? 'Done — try again to re-record.' : ''}
        </span>
      </div>
    </div>
  );
}

function LevelMeter({ level, active }: { level: number; active: boolean }): JSX.Element {
  const pct = Math.min(100, Math.round(level * 140));
  const color =
    level > 0.7 ? tokens.color.error : level > 0.4 ? tokens.color.warning : tokens.color.success;
  return (
    <div style={meterTrack}>
      <div
        style={{
          width: `${active ? pct : 0}%`,
          height: '100%',
          background: color,
          borderRadius: 4,
          transition: 'width 60ms linear'
        }}
      />
    </div>
  );
}

const meterTrack: CSSProperties = {
  width: '100%',
  height: 8,
  background: tokens.color.bg,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: 4,
  overflow: 'hidden'
};

const warning: CSSProperties = {
  fontSize: 12,
  color: tokens.color.warning,
  background: 'rgba(255,149,0,0.08)',
  border: `1px solid ${tokens.color.warning}`,
  borderRadius: tokens.radius.md,
  padding: '8px 12px',
  marginBottom: 12,
  lineHeight: 1.5
};
