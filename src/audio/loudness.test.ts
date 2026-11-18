import { describe, expect, it } from 'vitest';
import { kWeighting, measureLoudness } from './loudness';
import { concat, sine } from './synth';

const stereo = (x: Float32Array) => [x, x.slice()];

/** Stereo 1 kHz sine sections, each [dBFS, seconds], as in EBU Tech 3341/3342. */
function sections(sampleRate: number, parts: [number, number][]) {
  return stereo(concat(...parts.map(([db, s]) => sine(1000, db, s, sampleRate))));
}

describe('kWeighting', () => {
  it('reproduces the BS.1770-4 coefficients at 48 kHz', () => {
    const { shelf, highpass } = kWeighting(48000);
    expect(shelf.b0).toBeCloseTo(1.53512485958697, 10);
    expect(shelf.b1).toBeCloseTo(-2.69169618940638, 10);
    expect(shelf.b2).toBeCloseTo(1.19839281085285, 10);
    expect(shelf.a1).toBeCloseTo(-1.69065929318241, 10);
    expect(shelf.a2).toBeCloseTo(0.73248077421585, 10);
    expect(highpass.a1).toBeCloseTo(-1.99004745483398, 10);
    expect(highpass.a2).toBeCloseTo(0.99007225036621, 10);
  });
});

describe('integrated loudness (EBU Tech 3341)', () => {
  it.each([48000, 44100])('case 1: 1 kHz stereo sine at -23 dBFS reads -23.0 LUFS at %i Hz', (sr) => {
    const { integrated } = measureLoudness(sections(sr, [[-23, 20]]), sr);
    expect(integrated).not.toBeNull();
    expect(Math.abs(integrated! - -23)).toBeLessThanOrEqual(0.1);
  });

  it('case 2: -33 dBFS reads -33.0 LUFS', () => {
    const { integrated } = measureLoudness(sections(48000, [[-33, 20]]), 48000);
    expect(Math.abs(integrated! - -33)).toBeLessThanOrEqual(0.1);
  });

  it('case 3: relative gate ignores the -36 dBFS ends', () => {
    const { integrated } = measureLoudness(
      sections(48000, [
        [-36, 10],
        [-23, 60],
        [-36, 10],
      ]),
      48000,
    );
    expect(Math.abs(integrated! - -23)).toBeLessThanOrEqual(0.1);
  });

  it('case 4: absolute and relative gates together', () => {
    const parts: [number, number][] = [
      [-72, 10],
      [-36, 10],
      [-23, 60],
      [-36, 10],
      [-72, 10],
    ];
    const { integrated } = measureLoudness(sections(48000, parts), 48000);
    expect(Math.abs(integrated! - -23)).toBeLessThanOrEqual(0.1);
  });

  it('case 5: -26 / -20 / -26 dBFS averages to -23.0 LUFS', () => {
    const { integrated } = measureLoudness(
      sections(48000, [
        [-26, 20],
        [-20, 20.1],
        [-26, 20],
      ]),
      48000,
    );
    expect(Math.abs(integrated! - -23)).toBeLessThanOrEqual(0.1);
  });

  it('measures a mono file as one channel', () => {
    const { integrated } = measureLoudness([sine(1000, -20, 10, 48000)], 48000);
    // One channel carries half the power of the stereo case: -20 - 3.01.
    expect(integrated!).toBeCloseTo(-23.01, 1);
  });

  it('returns null for digital silence', () => {
    const r = measureLoudness([new Float32Array(48000 * 5)], 48000);
    expect(r.integrated).toBeNull();
    expect(r.range).toBeNull();
  });
});

describe('loudness range (EBU Tech 3342)', () => {
  it.each([
    [-20, -30, 10],
    [-20, -15, 5],
    [-40, -20, 20],
  ])('%i dBFS then %i dBFS gives LRA %i LU', (a, b, expected) => {
    const { range } = measureLoudness(
      sections(48000, [
        [a, 20],
        [b, 20],
      ]),
      48000,
    );
    expect(Math.abs(range! - expected)).toBeLessThanOrEqual(1);
  });

  it('exposes momentary and short-term series at 10 Hz', () => {
    const r = measureLoudness(sections(48000, [[-23, 10]]), 48000);
    expect(r.rate).toBe(10);
    expect(r.momentary.length).toBe(100 - 3);
    expect(r.shortTerm.length).toBe(100 - 29);
    expect(r.momentary[50]).toBeCloseTo(-23, 1);
  });
});
