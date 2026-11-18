import { describe, expect, it } from 'vitest';
import { computeSpectralFeatures } from './spectral';
import { sine } from './synth';

const SR = 44100;

describe('computeSpectralFeatures', () => {
  it('runs at 30 frames per second with log-spaced bins', () => {
    const x = sine(1000, -6, 4, SR);
    const { spectrogram } = computeSpectralFeatures(x, x, SR);
    expect(spectrogram.frameRate).toBe(30);
    expect(spectrogram.frames).toBe(Math.floor((x.length - 1) / (SR / 30)) + 1);
    const c = spectrogram.centers;
    for (let j = 2; j < c.length; j++) expect(c[j] / c[j - 1]).toBeCloseTo(c[1] / c[0], 5);
  });

  it('puts a 1 kHz sine in the bin nearest 1 kHz', () => {
    const x = sine(1000, -6, 3, SR);
    const { spectrogram } = computeSpectralFeatures(x, x, SR);
    const f = Math.floor(spectrogram.frames / 2);
    const row = Array.from(spectrogram.db.subarray(f * spectrogram.bins, (f + 1) * spectrogram.bins));
    const peak = row.indexOf(Math.max(...row));
    const distance = (hz: number) => Math.abs(Math.log(hz / 1000));
    const centers = Array.from(spectrogram.centers);
    const nearest = centers.indexOf(centers.reduce((a, b) => (distance(b) < distance(a) ? b : a)));
    expect(Math.abs(peak - nearest)).toBeLessThanOrEqual(1);
  });

  it.each([
    [100, 'low'],
    [1000, 'mid'],
    [8000, 'high'],
  ] as const)('routes a %i Hz sine to the %s band and centroid', (hz, band) => {
    const x = sine(hz, -6, 2, SR);
    const { bands, centroid } = computeSpectralFeatures(x, x, SR);
    const f = 30;
    const levels = { low: bands.low[f], mid: bands.mid[f], high: bands.high[f] };
    const loudest = (Object.keys(levels) as (keyof typeof levels)[]).sort((a, b) => levels[b] - levels[a])[0];
    expect(loudest).toBe(band);
    expect(centroid.series[f] / hz).toBeCloseTo(1, 1);
    expect(centroid.mean / hz).toBeCloseTo(1, 1);
  });

  it('marks silent frames with a zero centroid', () => {
    const x = new Float32Array(SR);
    const { centroid } = computeSpectralFeatures(x, x, SR);
    expect(Array.from(centroid.series).every((v) => v === 0)).toBe(true);
    expect(centroid.mean).toBe(0);
  });
});
