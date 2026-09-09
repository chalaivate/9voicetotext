import { useEffect, useRef } from 'react';

interface Props {
  analyser: AnalyserNode | null;
  /** Pixel width of the canvas. */
  width?: number;
  /** Pixel height of the canvas. */
  height?: number;
  /** Number of bars to draw. */
  bars?: number;
}

/**
 * Live frequency-bar visualiser driven by an AnalyserNode pulled from the
 * recorder's parallel WebAudio graph (see media-recorder.ts).
 *
 * Bars are mirrored around the vertical centre and coloured with a
 * lime → brand-blue gradient so the overlay reads "alive" even at low
 * input levels (a small idle floor keeps the bars from collapsing to 0).
 */
export function Waveform({ analyser, width = 84, height = 34, bars = 14 }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothRef = useRef<Float32Array>(new Float32Array(bars));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const bins = new Uint8Array(analyser.frequencyBinCount);
    // Voice energy sits in the low bins; sample the first ~40% of the
    // spectrum so the bars react to speech rather than hiss.
    const usable = Math.max(bars, Math.floor(bins.length * 0.4));
    const per = usable / bars;
    const gap = 2;
    const barW = (width - gap * (bars - 1)) / bars;
    const smooth = smoothRef.current;

    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, '#D4F73F');
    gradient.addColorStop(1, '#48B0FF');

    const draw = (): void => {
      analyser.getByteFrequencyData(bins);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = gradient;
      for (let i = 0; i < bars; i++) {
        let sum = 0;
        const from = Math.floor(i * per);
        const to = Math.floor((i + 1) * per);
        for (let j = from; j < to; j++) sum += bins[j] ?? 0;
        const avg = sum / Math.max(1, to - from) / 255; // 0..1
        // Exponential smoothing keeps motion fluid at 60fps.
        smooth[i] = smooth[i]! * 0.6 + avg * 0.4;
        const h = Math.max(3, smooth[i]! * (height - 2));
        const x = i * (barW + gap);
        const y = (height - h) / 2;
        roundRect(ctx, x, y, barW, h, barW / 2);
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
      style={{
        width,
        height,
        display: 'block',
        opacity: analyser ? 1 : 0,
        transition: 'opacity 120ms ease'
      }}
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
  ctx.fill();
}
