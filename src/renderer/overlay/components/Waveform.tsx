import { useEffect, useRef } from 'react';

interface Props {
  analyser: AnalyserNode | null;
  /** Pixel width of the canvas. */
  width?: number;
  /** Pixel height of the canvas. */
  height?: number;
  color?: string;
}

/**
 * Live time-domain waveform driven by an AnalyserNode pulled from the
 * recorder's parallel WebAudio graph (see media-recorder.ts).
 */
export function Waveform({
  analyser,
  width = 120,
  height = 40,
  color = 'rgba(255, 255, 255, 0.92)'
}: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const data = new Uint8Array(analyser.fftSize);

    const draw = (): void => {
      analyser.getByteTimeDomainData(data);
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = color;
      ctx.beginPath();
      const sliceWidth = width / data.length;
      let x = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i]! - 128) / 128; // -1 .. 1
        const y = height / 2 + v * (height / 2 - 2);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.stroke();
      rafRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [analyser, width, height, color]);

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
