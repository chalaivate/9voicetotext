import { describe, expect, it, vi } from 'vitest';
import { SilenceDetector } from '@renderer/overlay/recorder/silence-detector';

interface Harness {
  detector: SilenceDetector;
  setRms: (v: number) => void;
  advance: (ms: number) => void;
  /** Force one tick at the current virtual time. */
  tick: () => void;
  onSilence: ReturnType<typeof vi.fn>;
  onUpdate: ReturnType<typeof vi.fn>;
}

interface MakeOpts {
  thresholdRms?: number;
  silenceDurationMs?: number;
  startupGraceMs?: number;
  pollMs?: number;
}

function makeHarness(opts: MakeOpts = {}): Harness {
  let now = 0;
  let rms = 0;
  let intervalFn: (() => void) | null = null;
  const onSilence = vi.fn();
  const onUpdate = vi.fn();

  const detector = new SilenceDetector({
    rmsSource: () => rms,
    thresholdRms: opts.thresholdRms ?? 0.02,
    silenceDurationMs: opts.silenceDurationMs ?? 1000,
    startupGraceMs: opts.startupGraceMs ?? 0,
    pollMs: opts.pollMs ?? 100,
    now: () => now,
    setIntervalFn: (fn) => {
      intervalFn = fn;
      return () => {
        if (intervalFn === fn) intervalFn = null;
      };
    },
    onSilenceTimeout: onSilence,
    onUpdate
  });

  const advance = (ms: number): void => {
    const pollMs = opts.pollMs ?? 100;
    const ticks = Math.floor(ms / pollMs);
    for (let i = 0; i < ticks; i++) {
      now += pollMs;
      intervalFn?.();
    }
    // Apply any leftover ms without firing a tick.
    now += ms - ticks * pollMs;
  };

  return {
    detector,
    setRms: (v) => {
      rms = v;
    },
    advance,
    tick: () => intervalFn?.(),
    onSilence,
    onUpdate
  };
}

describe('SilenceDetector', () => {
  it('fires onSilenceTimeout after silence persists for full duration', () => {
    const h = makeHarness({ silenceDurationMs: 1000, thresholdRms: 0.02 });
    h.detector.start();
    h.setRms(0.005); // below threshold
    h.advance(1100);
    expect(h.onSilence).toHaveBeenCalledOnce();
  });

  it('does NOT fire while RMS is above threshold', () => {
    const h = makeHarness({ silenceDurationMs: 500 });
    h.detector.start();
    h.setRms(0.05); // loud
    h.advance(2000);
    expect(h.onSilence).not.toHaveBeenCalled();
  });

  it('a single loud spike resets the silence timer', () => {
    const h = makeHarness({ silenceDurationMs: 1000, thresholdRms: 0.02 });
    h.detector.start();
    h.setRms(0.005);
    h.advance(800); // 800ms of silence accumulated
    h.setRms(0.1); // loud spike
    h.tick();
    h.setRms(0.005); // back to silent
    h.advance(800); // only 800ms of new silence — should NOT fire
    expect(h.onSilence).not.toHaveBeenCalled();
    h.advance(300); // total new silence = 1100ms — fires
    expect(h.onSilence).toHaveBeenCalledOnce();
  });

  it('honors startupGraceMs — silence in the first N ms does not count', () => {
    const h = makeHarness({
      silenceDurationMs: 500,
      startupGraceMs: 1000,
      thresholdRms: 0.02
    });
    h.detector.start();
    h.setRms(0.005); // silent from the beginning
    h.advance(900); // still in grace
    expect(h.onSilence).not.toHaveBeenCalled();
    h.advance(700); // now past grace + 600ms of accumulated silence
    expect(h.onSilence).toHaveBeenCalledOnce();
  });

  it('fires only once even if ticks keep running after timeout', () => {
    const h = makeHarness({ silenceDurationMs: 500 });
    h.detector.start();
    h.setRms(0);
    h.advance(2000);
    expect(h.onSilence).toHaveBeenCalledOnce();
  });

  it('stop() cancels pending detection', () => {
    const h = makeHarness({ silenceDurationMs: 1000 });
    h.detector.start();
    h.setRms(0);
    h.advance(500);
    h.detector.stop();
    h.advance(2000);
    expect(h.onSilence).not.toHaveBeenCalled();
  });

  it('start() is idempotent — second call is a no-op', () => {
    const h = makeHarness({ silenceDurationMs: 500 });
    h.detector.start();
    h.detector.start(); // should not double-schedule
    h.setRms(0);
    h.advance(700);
    expect(h.onSilence).toHaveBeenCalledOnce();
  });

  it('onUpdate receives silentForMs progress while silent', () => {
    const h = makeHarness({ silenceDurationMs: 1000, pollMs: 100 });
    h.detector.start();
    h.setRms(0.005);
    h.advance(300);
    const last = h.onUpdate.mock.calls.at(-1)?.[0];
    expect(last?.isSilent).toBe(true);
    expect(last?.silentForMs).toBeGreaterThan(0);
  });

  it('onUpdate reports isSilent=false when above threshold', () => {
    const h = makeHarness({ silenceDurationMs: 1000 });
    h.detector.start();
    h.setRms(0.1);
    h.advance(200);
    const last = h.onUpdate.mock.calls.at(-1)?.[0];
    expect(last?.isSilent).toBe(false);
    expect(last?.silentForMs).toBe(0);
  });
});
