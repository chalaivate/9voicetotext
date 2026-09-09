import { useEffect, useRef } from 'react';

interface Props {
  analyser: AnalyserNode | null;
  /** CSS pixel width of the canvas. */
  width?: number;
  /** CSS pixel height of the canvas. */
  height?: number;
  /** Number of bars. */
  bars?: number;
}

const LIME = [212, 247, 63] as const; // #D4F73F
const BLUE = [72, 176, 255] as const; // #48B0FF

/**
 * Live "equaliser" visualiser driven by an AnalyserNode from the recorder's
 * WebAudio graph (see media-recorder.ts / chunked-recorder.ts). Bars are
 * log-spaced frequency bands mirrored around the centre line, coloured from
 * brand blue (low) to lime (high) so speech reads as a lively lime pulse.
 */
export function Waveform({ analyser, width = 72, height = 40, bars = 9 }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.scale(dpr, dpr);

    const bins = new Uint8Array(analyser.frequencyBinCount);
    // Speech energy lives below ~4 kHz; only look at the lower third of the
    // spectrum and split it into log-spaced bands so low + high frequencies
    // both get a bar.
    const usable = Math.max(bars, Math.floor(bins.length / 3));
    const edges: number[] = [];
    for (let i = 0; i <= bars; i++) {
      edges.push(Math.floor(Math.pow(usable, i / bars)));
    }
    const levels = new Float32Array(bars);
    // Auto-gain: track the recent peak so a soft talker still fills the
    // bars, while a loud one doesn't pin them all to max.
    let peak = 0.2;
    const gap = 3;
    const barW = (width - gap * (bars - 1)) / bars;
    const minH = 3;

    const draw = (): void => {
      analyser.getByteFrequencyData(bins);
      ctx.clearRect(0, 0, width, height);
      const raws = new Float32Array(bars);
      let frameMax = 0;
      for (let b = 0; b < bars; b++) {
        const from = edges[b]!;
        const to = Math.max(from + 1, edges[b + 1]!);
        let sum = 0;
        for (let i = from; i < to && i < bins.length; i++) sum += bins[i]!;
        const raw = sum / (to - from) / 255;
        raws[b] = raw;
        if (raw > frameMax) frameMax = raw;
      }
      peak = Math.max(frameMax, peak * 0.985, 0.08);
      for (let b = 0; b < bars; b++) {
        const raw = Math.min(1, raws[b]! / peak);
        // Fast attack, slow release → bars feel responsive but not jittery.
        const prev = levels[b]!;
        const next = raw > prev ? prev + (raw - prev) * 0.55 : prev + (raw - prev) * 0.18;
        levels[b] = next;

        const h = Math.max(minH, next * (height - 2));
        const x = b * (barW + gap);
        const y = (height - h) / 2;
        const t = next; // 0..1 → blue → lime
        const r = Math.round(BLUE[0] + (LIME[0] - BLUE[0]) * t);
        const g = Math.round(BLUE[1] + (LIME[1] - BLUE[1]) * t);
        const bl = Math.round(BLUE[2] + (LIME[2] - BLUE[2]) * t);
        ctx.fillStyle = `rgba(${r}, ${g}, ${bl}, ${0.55 + 0.45 * t})`;
        roundRect(ctx, x, y, barW, h, barW / 2);
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [analyser, width, height, bars]);

  return (
    <canvas
      ref={canvasRef}
      className={`ov-wave${analyser ? ' ov-wave--on' : ''}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}
