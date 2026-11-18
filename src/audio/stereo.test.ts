import { describe, expect, it } from 'vitest';
import { measureStereo } from './spectral';
import { concat, whiteNoise } from './synth';

describe('measureStereo', () => {
  it('reads identical channels as mono', () => {
    const x = whiteNoise(1, 44100, 0.5);
    expect(measureStereo(x, x.slice())).toEqual({ correlation: 1, width: 0 });
  });

  it('reads inverted channels as fully out of phase', () => {
    const x = whiteNoise(1, 44100, 0.5);
    const r = measureStereo(
      x,
      x.map((v) => -v),
    );
    expect(r.correlation).toBeCloseTo(-1, 6);
    expect(r.width).toBeCloseTo(1, 6);
  });

  it('reads independent noise as uncorrelated', () => {
    const r = measureStereo(whiteNoise(2, 44100, 0.5, 1), whiteNoise(2, 44100, 0.5, 2));
    expect(Math.abs(r.correlation)).toBeLessThan(0.02);
    expect(r.width).toBeCloseTo(0.5, 1);
  });

  it('uses the whole track, not just the first second', () => {
    // phase-viz looked at the first 44 100 samples only, so a mono intro hid a wide track.
    const sr = 44100;
    const intro = whiteNoise(1, sr, 0.5, 3);
    const left = concat(intro, whiteNoise(9, sr, 0.5, 4));
    const right = concat(intro, whiteNoise(9, sr, 0.5, 5));
    const r = measureStereo(left, right);
    expect(r.width).toBeGreaterThan(0.4);
    expect(r.correlation).toBeLessThan(0.2);
  });

  it('handles silence', () => {
    expect(measureStereo(new Float32Array(10), new Float32Array(10))).toEqual({ correlation: 1, width: 0 });
  });
});
