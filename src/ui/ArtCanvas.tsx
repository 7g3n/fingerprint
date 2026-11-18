import { useEffect, useRef } from 'react';
import { renderArt, type ArtParams } from '../art';
import styles from './ArtCanvas.module.css';

/** On-screen preview: renders at the element's CSS size × devicePixelRatio. */
export function ArtCanvas({ params, label }: { params: ArtParams; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const css = canvas.getBoundingClientRect().width;
      const px = Math.max(1, Math.round(css * Math.min(3, window.devicePixelRatio || 1)));
      if (canvas.width !== px) {
        canvas.width = px;
        canvas.height = px;
      }
      const ctx = canvas.getContext('2d');
      if (ctx) renderArt(ctx, params, px);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [params]);

  return <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label={label} />;
}
