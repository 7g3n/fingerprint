import type { TrackFeatures } from '../../../audio/types';
import { createRng } from '../../prng';
import { ringPalette } from './palette';
import type { Particle, RingParams, Shift, Slit } from './params';

const RINGS = 64;
const LEVELS = 6;
const INNER = 0.16;
const OUTER = 0.425;
/** dB shown between "just visible" and "full". */
const RANGE_DB = 42;
/** Normalised intensity below which a cell stays empty. */
const VISIBLE_FROM = 0.2;
/** Steps whose momentary loudness is this far below integrated are left blank. */
const QUIET_LU = 20;
const QUIET_ABSOLUTE_LUFS = -60;
const LOW_ZONE_MAX_HZ = 250;
const MID_ZONE_MAX_HZ = 4000;
const CORE_VERTICES = 32;

/**
 * Turns analysis features into Ring parameters. Pure: the same features and
 * seed always give the same params.
 *
 * Everything structural — the grid, the gaps, where the glitches fall and
 * what kind they are, the colours — comes from the analysis. The seed only
 * picks small details (how far a glitch block slides and which rings it
 * spans, where dust particles land), so two encodings of the same master
 * still look nearly the same.
 */
export function deriveRing(features: TrackFeatures, seedHex: string): RingParams {
  const { duration } = features;
  const steps = Math.min(1440, Math.max(360, Math.round(duration * 4)));

  const zoneOfRing = ringZones(features);
  const grid = buildGrid(features, steps);
  const { slits, shifts } = placeGlitches(features, steps, seedHex);

  return {
    style: 'ring',
    version: 1,
    steps,
    rings: RINGS,
    levels: LEVELS,
    grid,
    zoneOfRing,
    inner: INNER,
    outer: OUTER,
    slits,
    shifts,
    ticks: barTicks(features),
    particles: scatterParticles(grid, zoneOfRing, steps, seedHex),
    core: loudnessCore(features),
    palette: ringPalette(features, LEVELS),
  };
}

/** Which frequency zone each ring belongs to, from the spectrogram's bin centres. */
function ringZones(features: TrackFeatures): Uint8Array {
  const { centers, bins } = features.spectrogram;
  const per = bins / RINGS;
  const zones = new Uint8Array(RINGS);
  for (let b = 0; b < RINGS; b++) {
    const hz = Math.sqrt(centers[Math.floor(b * per)] * centers[Math.min(bins - 1, Math.floor((b + 1) * per) - 1)]);
    zones[b] = hz < LOW_ZONE_MAX_HZ ? 0 : hz < MID_ZONE_MAX_HZ ? 1 : 2;
  }
  return zones;
}

/**
 * Pools the 30 fps log spectrogram into steps × rings, normalises it against
 * the track itself and quantises to LEVELS. Quantising is what keeps a WAV
 * and an MP3 of the same master on (almost) the same grid.
 */
function buildGrid(features: TrackFeatures, steps: number): Uint8Array {
  const { db, frames, bins } = features.spectrogram;
  const per = bins / RINGS;
  const cells = new Float64Array(steps * RINGS);

  for (let a = 0; a < steps; a++) {
    const f0 = Math.floor((a * frames) / steps);
    const f1 = Math.max(f0 + 1, Math.floor(((a + 1) * frames) / steps));
    for (let b = 0; b < RINGS; b++) {
      const j0 = Math.floor(b * per);
      const j1 = Math.max(j0 + 1, Math.floor((b + 1) * per));
      let power = 0;
      let count = 0;
      for (let f = f0; f < Math.min(f1, frames); f++) {
        for (let j = j0; j < j1; j++) {
          power += Math.pow(10, db[f * bins + j] / 10);
          count++;
        }
      }
      cells[a * RINGS + b] = count > 0 && power > 0 ? 10 * Math.log10(power / count) : -120;
    }
  }

  const audible = audibleSteps(features, steps);
  const audibleCells: number[] = [];
  for (let a = 0; a < steps; a++) {
    if (!audible[a]) continue;
    for (let b = 0; b < RINGS; b++) audibleCells.push(cells[a * RINGS + b]);
  }
  const grid = new Uint8Array(steps * RINGS);
  if (audibleCells.length === 0) return grid;
  const globalRef = quantile(audibleCells, 0.99);

  for (let b = 0; b < RINGS; b++) {
    const ringValues: number[] = [];
    for (let a = 0; a < steps; a++) if (audible[a]) ringValues.push(cells[a * RINGS + b]);
    // Half-way between the track's loudest cells and this ring's own: keeps
    // the spectral tilt visible while still giving quiet highs some detail.
    const reference = 0.5 * globalRef + 0.5 * quantile(ringValues, 0.97);
    const floor = reference - RANGE_DB;
    for (let a = 0; a < steps; a++) {
      if (!audible[a]) continue;
      const v = (cells[a * RINGS + b] - floor) / RANGE_DB;
      if (v < VISIBLE_FROM) continue;
      const level = Math.ceil(((Math.min(1, v) - VISIBLE_FROM) / (1 - VISIBLE_FROM)) * LEVELS);
      grid[a * RINGS + b] = Math.max(1, Math.min(LEVELS, level));
    }
  }
  return grid;
}

/** Steps loud enough to draw. Quiet passages become negative space. */
function audibleSteps(features: TrackFeatures, steps: number): Uint8Array {
  const out = new Uint8Array(steps);
  const { integrated, momentary, rate } = features.loudness;
  if (integrated === null || momentary.length === 0) return out;
  const threshold = Math.max(QUIET_ABSOLUTE_LUFS, integrated - QUIET_LU);
  for (let a = 0; a < steps; a++) {
    const t0 = (a / steps) * features.duration;
    const t1 = ((a + 1) / steps) * features.duration;
    // Momentary window j covers [j / rate, j / rate + 0.4 s].
    const last = momentary.length - 1;
    const j0 = Math.min(last, Math.max(0, Math.floor((t0 - 0.2) * rate)));
    const j1 = Math.min(last, Math.max(j0, Math.ceil((t1 - 0.2) * rate)));
    let loudest = -Infinity;
    for (let j = j0; j <= j1; j++) loudest = Math.max(loudest, momentary[j]);
    out[a] = loudest >= threshold ? 1 : 0;
  }
  return out;
}

interface Candidate {
  time: number;
  strength: number;
  score: number;
  lowRise: number;
  highRise: number;
}

/**
 * Glitches sit on the track's strongest onsets, favouring the ones where a
 * section gets louder (drops, re-entries after a stop), measured on 3 s
 * short-term loudness so the dips between kicks don't count. Bass-led
 * attacks become radial slits; mid/high-led ones become datamosh shifts.
 */
function placeGlitches(features: TrackFeatures, steps: number, seedHex: string): { slits: Slit[]; shifts: Shift[] } {
  const { times, strengths, density } = features.onsets;
  const { shortTerm, rate } = features.loudness;
  const { low, mid, high, frameRate } = features.bands;
  // Short-term window j covers [j / rate, j / rate + 3 s].
  const shortTermFrom = (t: number) => shortTerm[Math.min(shortTerm.length - 1, Math.max(0, Math.round(t * rate)))] ?? -120;
  const bandAt = (series: Float32Array, t: number) => series[Math.min(series.length - 1, Math.max(0, Math.round(t * frameRate)))] ?? -120;

  const candidates: Candidate[] = [];
  for (let i = 0; i < times.length; i++) {
    if (strengths[i] < 0.6) continue;
    const t = times[i];
    const before = shortTermFrom(t - 3.1);
    const after = shortTermFrom(t);
    const contrast = Math.max(0, Math.min(15, after - before)) / 15;
    const rise = (series: Float32Array) => bandAt(series, t + 0.03) - bandAt(series, t - 0.1);
    const lowRise = rise(low);
    const highRise = Math.max(rise(mid), rise(high));
    // Rise size (capped) breaks ties between equally strong onsets.
    const punch = Math.min(30, Math.max(0, Math.max(lowRise, highRise))) / 30;
    candidates.push({
      time: t,
      strength: strengths[i],
      score: Math.round(strengths[i] * (1 + 3 * contrast + 0.3 * punch) * 1000) / 1000,
      lowRise,
      highRise,
    });
  }
  candidates.sort((x, y) => y.score - x.score || x.time - y.time);

  const budget = Math.min(36, Math.round(2 + density * 4));
  const minSeparation = Math.max(4, Math.round(steps / 60));
  const chosen: Candidate[] = [];
  for (const c of candidates) {
    if (chosen.length >= budget) break;
    const step = Math.floor((c.time / features.duration) * steps);
    if (chosen.some((o) => Math.abs(Math.floor((o.time / features.duration) * steps) - step) < minSeparation)) continue;
    chosen.push(c);
  }
  // The top third (by score) of the slits also get an accent hairline.
  const hairlineScore = chosen[Math.floor((chosen.length - 1) / 3)]?.score ?? Infinity;
  chosen.sort((x, y) => x.time - y.time);

  const rng = createRng(seedHex, 'ring/glitch');
  const slits: Slit[] = [];
  const shifts: Shift[] = [];
  for (const c of chosen) {
    const step = Math.min(steps - 1, Math.floor((c.time / features.duration) * steps));
    // Seeded details are drawn for every glitch, in time order, so the
    // sequence doesn't depend on which kind each one turned out to be.
    const span = rng.int(10, 30);
    const start = rng.int(0, RINGS - span);
    const slide = rng.sign() * rng.int(2, 7);
    const length = rng.int(4, 14);
    if (c.lowRise >= c.highRise) {
      slits.push({ step, width: 1 + Math.round(c.strength * 2), hairline: c.score >= hairlineScore });
    } else {
      shifts.push({
        step,
        length: Math.round(length * (0.6 + 0.4 * c.strength)),
        ringStart: start,
        ringEnd: start + span,
        offset: Math.round(slide * (steps / 720)) || slide,
      });
    }
  }
  return { slits, shifts };
}

/** One tick per bar, every 8th bar longer. Phase follows the first strong onset. */
function barTicks(features: TrackFeatures): RingParams['ticks'] {
  if (!features.tempo || !(features.duration > 0)) return [];
  const bar = 240 / features.tempo.bpm;
  const { times, strengths } = features.onsets;
  let first = 0;
  for (let i = 0; i < times.length; i++) {
    if (strengths[i] >= 0.5) {
      first = times[i];
      break;
    }
  }
  const phase = first % bar;
  const ticks: RingParams['ticks'] = [];
  for (let k = 0; phase + k * bar < features.duration; k++) {
    const t = phase + k * bar;
    ticks.push({ turn: Math.round((t / features.duration) * 1e5) / 1e5, major: Math.round((t - first) / bar) % 8 === 0 });
  }
  return ticks;
}

/**
 * Dust outside the rings. How much there is follows the high-zone activity;
 * where it gathers follows the high-zone energy over time. Only the exact
 * positions are seeded.
 */
function scatterParticles(grid: Uint8Array, zoneOfRing: Uint8Array, steps: number, seedHex: string): Particle[] {
  const weights = new Float64Array(steps);
  let total = 0;
  let highCells = 0;
  let highSum = 0;
  for (let a = 0; a < steps; a++) {
    let w = 0;
    for (let b = 0; b < RINGS; b++) {
      if (zoneOfRing[b] !== 2) continue;
      const level = grid[a * RINGS + b];
      w += level * level;
      highSum += level;
      highCells++;
    }
    weights[a] = w;
    total += w;
  }
  if (!(total > 0) || highCells === 0) return [];
  const activity = highSum / (highCells * LEVELS);
  const count = Math.round(60 + 1400 * Math.min(1, activity * 1.6));

  const cumulative = new Float64Array(steps);
  let acc = 0;
  for (let a = 0; a < steps; a++) {
    acc += weights[a];
    cumulative[a] = acc / total;
  }

  const rng = createRng(seedHex, 'ring/particles');
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const u = rng.next();
    let lo = 0;
    let hi = steps - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (cumulative[m] < u) lo = m + 1;
      else hi = m;
    }
    const turn = (lo + rng.next()) / steps;
    const out = rng.next();
    particles.push({
      turn: round4(turn),
      radius: round4(OUTER + 0.006 + 0.06 * out * out),
      size: rng.next() < 0.75 ? 1.4 : rng.next() < 0.8 ? 2.4 : 3.6,
      level: rng.int(Math.ceil(LEVELS / 2), LEVELS),
    });
  }
  return particles;
}

/** Low-poly silhouette of short-term loudness around the centre. */
function loudnessCore(features: TrackFeatures): number[] {
  const { shortTerm, momentary, rate, integrated } = features.loudness;
  const series = shortTerm.length > 0 ? shortTerm : momentary;
  const radii: number[] = [];
  const min = 0.035;
  const max = INNER - 0.03;
  for (let v = 0; v < CORE_VERTICES; v++) {
    if (integrated === null || series.length === 0) {
      radii.push(min);
      continue;
    }
    const t0 = (v / CORE_VERTICES) * features.duration;
    const t1 = ((v + 1) / CORE_VERTICES) * features.duration;
    let loudest = -Infinity;
    // Short-term window j covers [j / rate, j / rate + 3 s]: centre it on the vertex.
    const last = series.length - 1;
    const j0 = Math.min(last, Math.max(0, Math.floor(t0 * rate - 15)));
    const j1 = Math.min(last, Math.max(j0, Math.ceil(t1 * rate - 15)));
    for (let j = j0; j <= j1; j++) loudest = Math.max(loudest, series[j]);
    const x = Math.min(1, Math.max(0, (loudest - (integrated - 18)) / 24));
    radii.push(round4(min + (max - min) * Math.pow(x, 1.3)));
  }
  return radii;
}

function quantile(values: number[], q: number): number {
  const sorted = Float64Array.from(values).sort();
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function round4(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}
