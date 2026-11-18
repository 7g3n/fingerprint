import { createCanvas } from '@napi-rs/canvas';
import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeTrack } from '../audio/analyzeTrack';
import { breaksTrack, DEMO_SAMPLE_RATE } from '../audio/demoTracks';
import type { TrackFeatures } from '../audio/types';
import { deriveArtParams, renderArt, type ArtParams, type Ctx2D } from './index';
import { applyGlitches } from './styles/ring/render';

const SEED_A = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const SEED_B = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';

let features: TrackFeatures;
beforeAll(() => {
  const track = breaksTrack(40);
  features = analyzeTrack([track.left, track.right], DEMO_SAMPLE_RATE);
});

function renderHash(params: ArtParams, size: number): string {
  const canvas = createCanvas(size, size);
  renderArt(canvas.getContext('2d') as unknown as Ctx2D, params, size);
  return createHash('sha256').update(canvas.data()).digest('hex');
}

/** Copy of the features with the spectrogram nudged, as a lossy re-encode would. */
function perturbed(f: TrackFeatures, amountDb: number): TrackFeatures {
  const db = f.spectrogram.db.slice();
  for (let i = 0; i < db.length; i++) db[i] += amountDb * Math.sin(i * 12.9898) * Math.cos(i * 0.731);
  return { ...f, spectrogram: { ...f.spectrogram, db } };
}

describe('deriveArtParams', () => {
  it('gives identical params for identical input', () => {
    const a = deriveArtParams(features, SEED_A);
    const b = deriveArtParams(features, SEED_A);
    expect(b).toEqual(a);
  });

  it('takes the structure from the sound and only details from the seed', () => {
    const a = deriveArtParams(features, SEED_A);
    const b = deriveArtParams(features, SEED_B);
    // Analysis-driven: identical.
    expect(b.grid).toEqual(a.grid);
    expect(b.palette).toEqual(a.palette);
    expect(b.ticks).toEqual(a.ticks);
    expect(b.core).toEqual(a.core);
    expect(b.slits.map((s) => s.step)).toEqual(a.slits.map((s) => s.step));
    expect(b.shifts.map((s) => s.step)).toEqual(a.shifts.map((s) => s.step));
    expect(b.particles.length).toBe(a.particles.length);
    // Seeded details: different.
    expect(b.particles).not.toEqual(a.particles);
  });

  it('barely changes when the spectrum shifts by a fraction of a dB (e.g. WAV vs MP3)', () => {
    const a = deriveArtParams(features, SEED_A);
    const b = deriveArtParams(perturbed(features, 0.5), SEED_A);
    let same = 0;
    let close = 0;
    for (let i = 0; i < a.grid.length; i++) {
      if (a.grid[i] === b.grid[i]) same++;
      if (Math.abs(a.grid[i] - b.grid[i]) <= 1) close++;
    }
    expect(same / a.grid.length).toBeGreaterThan(0.85);
    expect(close / a.grid.length).toBeGreaterThan(0.995);
    expect(b.palette).toEqual(a.palette);
  });

  it('leaves quiet passages empty', () => {
    const params = deriveArtParams(features, SEED_A);
    const emptySteps = Array.from({ length: params.steps }, (_, a) =>
      params.grid.subarray(a * params.rings, (a + 1) * params.rings).every((v) => v === 0),
    ).filter(Boolean).length;
    // The breaks track has hard stops: some whole steps must be blank.
    expect(emptySteps).toBeGreaterThan(0);
  });

  it('keeps grid values within the level range', () => {
    const p = deriveArtParams(features, SEED_A);
    expect(p.grid.length).toBe(p.steps * p.rings);
    expect(Math.max(...p.grid)).toBeLessThanOrEqual(p.levels);
    expect(p.zoneOfRing.length).toBe(p.rings);
  });
});

describe('Ring glitches', () => {
  it('slits blank every ring for their width', () => {
    const p = deriveArtParams(features, SEED_A);
    const withSlit: ArtParams = { ...p, slits: [{ step: 10, width: 2, hairline: false }], shifts: [] };
    const { display } = applyGlitches(withSlit);
    for (const a of [10, 11]) expect(display.subarray(a * p.rings, (a + 1) * p.rings).every((v) => v === 0)).toBe(true);
  });

  it('shifts move a block and mark it as moshed', () => {
    const p = deriveArtParams(features, SEED_A);
    const grid = new Uint8Array(p.grid.length);
    grid[20 * p.rings + 5] = 3;
    const shifted: ArtParams = { ...p, grid, slits: [], shifts: [{ step: 20, length: 1, ringStart: 0, ringEnd: 10, offset: 4 }] };
    const { display, moshed } = applyGlitches(shifted);
    expect(display[20 * p.rings + 5]).toBe(0);
    expect(display[24 * p.rings + 5]).toBe(3);
    expect(moshed[24 * p.rings + 5]).toBe(1);
  });
});

describe('renderArt', () => {
  it('draws the same pixels every time', () => {
    const params = deriveArtParams(features, SEED_A);
    expect(renderHash(params, 400)).toBe(renderHash(deriveArtParams(features, SEED_A), 400));
  });

  it('draws more than the background', () => {
    const params = deriveArtParams(features, SEED_A);
    const blank = createCanvas(400, 400);
    const ctx = blank.getContext('2d');
    ctx.fillStyle = params.palette.background;
    ctx.fillRect(0, 0, 400, 400);
    const blankHash = createHash('sha256').update(blank.data()).digest('hex');
    expect(renderHash(params, 400)).not.toBe(blankHash);
  });
});
