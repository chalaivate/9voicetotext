import { useEffect, useRef } from 'react';

interface Props {
  analyser: AnalyserNode | null;
  /** When false the wave idles with a gentle breathing motion. */
  active?: boolean;
  width?: number;
  height?: number;
}

/**
 * "Siri-style" layered sine wave. The curve shape is synthesised (three
 * phase-shifted sinusoids under a raised-cosine envelope) so it is always
 * smooth; the microphone only drives the amplitude, via the analyser's
 * time-domain RMS. Translucent glow + core stroke in a lime → blue → white
 * gradient. Falls back to a slow breathing idle when there is no signal.
 */
export function Waveform({
  analyser,
  active = true,
  width = 150,
  height = 30
}: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const levelRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const samples = analyser ? new Uint8Array(analyser.fftSize) : null;
    const layers = [
      { freq: 1.9, speed: 0.11, amp: 1.0, alpha: 0.95, lineWidth: 2 },
      { freq: 2.7, speed: -0.08, amp: 0.65, alpha: 0.55, lineWidth: 1.5 },
      { freq: 1.3, speed: 0.06, amp: 0.45, alpha: 0.35, lineWidth: 1.2 }
    ];
    const phases = [0, 1.7, 3.1];
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, 'rgba(212, 247, 63, 0.0)');
    gradient.addColorStop(0.25, '#D4F73F');
    gradient.addColorStop(0.5, '#FFFFFF');
    gradient.addColorStop(0.75, '#48B0FF');
    gradient.addColorStop(1, 'rgba(72, 176, 255, 0.0)');

    const mid = height / 2;
    const steps = 64;
    let t = 0;

    const readLevel = (): number => {
      if (!active || !analyser || !samples) return 0;
      analyser.getByteTimeDomainData(samples);
      let sumSq = 0;
      for (let i = 0; i < samples.length; i++) {
        const v = (samples[i]! - 128) / 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / samples.length);
      // Speech RMS sits around 0.02-0.2 with AGC off; map to 0..1 with a
      // soft knee so quiet talkers still get visible motion.
      return Math.min(1, Math.pow(rms * 6, 0.8));
    };

    const draw = (): void => {
      t += 1;
      const target = readLevel();
      // Fast attack, slow release — reads as responsive without jitter.
      const k = target > levelRef.current ? 0.35 : 0.12;
      levelRef.current += (target - levelRef.current) * k;
      const idle = 0.08 + 0.04 * Math.sin(t / 22);
      const level = Math.max(idle, levelRef.current);

      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      layers.forEach((layer, li) => {
        phases[li] = (phases[li] ?? 0) + layer.speed;
        const amp = (mid - 1.5) * level * layer.amp;
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          const x = (i / steps) * width;
          const u = i / steps;
          // raised-cosine envelope: silent at both ends, full in the middle
          const env = 0.5 - 0.5 * Math.cos(2 * Math.PI * u);
          const y = mid + amp * env * Math.sin(2 * Math.PI * layer.freq * u + (phases[li] ?? 0));
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        // glow pass
        ctx.globalAlpha = layer.alpha * 0.5;
        ctx.strokeStyle = gradient;
        ctx.lineWidth = layer.lineWidth + 4;
        ctx.filter = 'blur(3px)';
        ctx.stroke();
        // core pass
        ctx.filter = 'none';
        ctx.globalAlpha = layer.alpha;
        ctx.lineWidth = layer.lineWidth;
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [analyser, active, width, height]);

  return <canvas ref={canvasRef} style={{ width, height, display: 'block' }} aria-hidden />;
}
