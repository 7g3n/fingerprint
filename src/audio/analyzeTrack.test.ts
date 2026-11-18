import { describe, expect, it } from 'vitest';
import { analyzeTrack } from './analyzeTrack';
import { chordProgression, clickTrain, sine } from './synth';
import { featureTransferables } from './types';

const SR = 44100;

function demoTrack(seconds = 20) {
  const clicks = clickTrain(126, seconds, SR, { amplitude: 0.5 });
  const chords = chordProgression(
    [
      [57, 60, 64, 69],
      [53, 60, 65, 69],
    ],
    2,
    seconds,
    SR,
    0.08,
  );
  const left = new Float32Array(clicks.length);
  const right = new Float32Array(clicks.length);
  for (let i = 0; i < clicks.length; i++) {
    left[i] = clicks[i] + chords[i];
    right[i] = clicks[i] * 0.9 + chords[i];
  }
  return [left, right];
}

describe('analyzeTrack', () => {
  it('returns every feature with consistent shapes', () => {
    const features = analyzeTrack(demoTrack(), SR);
    expect(features.duration).toBeCloseTo(20, 6);
    expect(features.channelCount).toBe(2);
    expect(features.spectrogram.db.length).toBe(features.spectrogram.frames * features.spectrogram.bins);
    expect(features.bands.low.length).toBe(features.spectrogram.frames);
    expect(features.centroid.series.length).toBe(features.spectrogram.frames);
    expect(features.stereo.series.length).toBe(features.spectrogram.frames);
    expect(features.onsets.times.length).toBeGreaterThan(30);
    expect(features.onsets.density).toBeCloseTo(features.onsets.times.length / 20, 2);
    expect(Math.abs(features.tempo!.bpm - 126)).toBeLessThan(0.5);
    expect(features.loudness.integrated).toBeLessThan(0);
    expect(features.stereo.correlation).toBeGreaterThan(0.9);
    expect(featureTransferables(features).length).toBeGreaterThan(5);
  });

  it('is deterministic', () => {
    const channels = demoTrack(10);
    const a = analyzeTrack(channels, SR);
    const b = analyzeTrack(channels, SR);
    expect(b).toEqual(a);
  });

  it('reports sample peak in dBFS', () => {
    const x = sine(1000, -6, 2, SR);
    expect(analyzeTrack([x], SR).peak).toBeCloseTo(-6, 1);
    expect(analyzeTrack([new Float32Array(SR)], SR).peak).toBeNull();
  });

  it('reports progress from 0 to 1 in order', () => {
    const seen: number[] = [];
    analyzeTrack(demoTrack(4), SR, { onProgress: (p) => seen.push(p) });
    expect(seen.length).toBeGreaterThan(10);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(seen[seen.length - 1]).toBe(1);
  });

  it('treats a mono track as identical channels', () => {
    const x = demoTrack(6)[0];
    const features = analyzeTrack([x], SR);
    expect(features.channelCount).toBe(1);
    expect(features.stereo.width).toBe(0);
  });
});
