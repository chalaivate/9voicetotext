/**
 * Procedurally-generated beeps via Web Audio. No bundled MP3 files needed —
 * the spec asks for a 440 Hz start beep, 660 Hz stop beep, and an "error"
 * sound, all 100 ms (§FR-2.3). Default volume 30 %.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    )();
  }
  // Some browsers/Electron builds suspend the AudioContext until a user
  // gesture. Try to resume — if it can't, the beep just won't play.
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  return ctx;
}

interface BeepOptions {
  frequency: number;
  durationMs: number;
  volume: number; // 0..1
  type?: OscillatorType;
}

function tone(opts: BeepOptions): void {
  try {
    const audio = getCtx();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.value = opts.frequency;

    // Short attack/release so it doesn't click.
    const now = audio.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(opts.volume, now + 0.01);
    gain.gain.linearRampToValueAtTime(0, now + opts.durationMs / 1000);

    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(now);
    osc.stop(now + opts.durationMs / 1000 + 0.05);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('beep failed', err);
  }
}

export function startBeep(volume = 0.3): void {
  tone({ frequency: 440, durationMs: 100, volume });
}

export function stopBeep(volume = 0.3): void {
  tone({ frequency: 660, durationMs: 100, volume });
}

export function errorBeep(volume = 0.3): void {
  // Two-tone descending = "uh-oh"
  tone({ frequency: 320, durationMs: 120, volume, type: 'triangle' });
  setTimeout(() => tone({ frequency: 220, durationMs: 160, volume, type: 'triangle' }), 140);
}
