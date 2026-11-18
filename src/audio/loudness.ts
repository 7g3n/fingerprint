/**
 * Loudness per ITU-R BS.1770-4 (integrated, momentary, short-term) and
 * loudness range per EBU Tech 3342.
 *
 * Replaces phase-viz's `loudness`, which was the RMS of the left channel in
 * dBFS: no K-weighting, no gating, and only one channel.
 */

export interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

export interface LoudnessResult {
  integrated: number | null;
  range: number | null;
  rate: number;
  momentary: Float32Array;
  shortTerm: Float32Array;
}

export const LOUDNESS_RATE = 10;
const ABSOLUTE_GATE = -70;
const RELATIVE_GATE = -10;
const LRA_RELATIVE_GATE = -20;
const SERIES_FLOOR = -120;

/**
 * K-weighting filter (high shelf, then RLB high-pass) for any sample rate.
 * Derived from the analogue prototypes the BS.1770 coefficients come from, as
 * in libebur128, so 48 kHz reproduces the published values exactly.
 */
export function kWeighting(sampleRate: number): { shelf: Biquad; highpass: Biquad } {
  let f0 = 1681.974450955533;
  const gainDb = 3.999843853973347;
  let q = 0.7071752369554196;
  let k = Math.tan((Math.PI * f0) / sampleRate);
  const vh = Math.pow(10, gainDb / 20);
  const vb = Math.pow(vh, 0.4996667741545416);
  let a0 = 1 + k / q + k * k;
  const shelf: Biquad = {
    b0: (vh + (vb * k) / q + k * k) / a0,
    b1: (2 * (k * k - vh)) / a0,
    b2: (vh - (vb * k) / q + k * k) / a0,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / q + k * k) / a0,
  };

  f0 = 38.13547087602444;
  q = 0.5003270373238773;
  k = Math.tan((Math.PI * f0) / sampleRate);
  a0 = 1 + k / q + k * k;
  const highpass: Biquad = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / q + k * k) / a0,
  };
  return { shelf, highpass };
}

/**
 * Measures loudness of up to two channels (L, R; channel weight 1 each).
 * A mono file is measured as a single channel.
 */
export function measureLoudness(
  channels: readonly Float32Array[],
  sampleRate: number,
  onProgress?: (fraction: number) => void,
): LoudnessResult {
  const used = channels.slice(0, 2);
  const length = used[0]?.length ?? 0;
  const step = sampleRate / LOUDNESS_RATE;
  const subBlocks = Math.floor(length / step);
  const bounds = new Float64Array(subBlocks + 1);
  for (let j = 0; j <= subBlocks; j++) bounds[j] = Math.round(j * step);

  // Sum of K-weighted squares per 100 ms sub-block, summed over channels.
  const energy = new Float64Array(subBlocks);
  const { shelf, highpass } = kWeighting(sampleRate);
  used.forEach((x, c) => {
    filterEnergy(x, shelf, highpass, bounds, energy);
    onProgress?.((c + 1) / used.length);
  });

  const sampleCount = (from: number, to: number) => bounds[to] - bounds[from];
  const windowPower = (blocks: number) => {
    const out = new Float64Array(Math.max(0, subBlocks - blocks + 1));
    let acc = 0;
    for (let j = 0; j < subBlocks; j++) {
      acc += energy[j];
      if (j >= blocks) acc -= energy[j - blocks];
      if (j >= blocks - 1) {
        const start = j - blocks + 1;
        out[start] = acc / sampleCount(start, j + 1);
      }
    }
    return out;
  };

  const momentaryPower = windowPower(4); // 400 ms
  const shortTermPower = windowPower(30); // 3 s

  return {
    integrated: gatedLoudness(momentaryPower),
    range: loudnessRange(shortTermPower),
    rate: LOUDNESS_RATE,
    momentary: toSeries(momentaryPower),
    shortTerm: toSeries(shortTermPower),
  };
}

function filterEnergy(
  x: Float32Array,
  s: Biquad,
  h: Biquad,
  bounds: Float64Array,
  energy: Float64Array,
): void {
  // Transposed direct form II, two stages in series.
  let s1 = 0;
  let s2 = 0;
  let h1 = 0;
  let h2 = 0;
  for (let j = 0; j < energy.length; j++) {
    let sum = 0;
    const end = bounds[j + 1];
    for (let i = bounds[j]; i < end; i++) {
      const v = x[i];
      const y1 = s.b0 * v + s1;
      s1 = s.b1 * v - s.a1 * y1 + s2;
      s2 = s.b2 * v - s.a2 * y1;
      const y2 = h.b0 * y1 + h1;
      h1 = h.b1 * y1 - h.a1 * y2 + h2;
      h2 = h.b2 * y1 - h.a2 * y2;
      sum += y2 * y2;
    }
    energy[j] += sum;
  }
}

export function powerToLufs(power: number): number {
  return power > 0 ? -0.691 + 10 * Math.log10(power) : -Infinity;
}

/** BS.1770-4 two-stage gating over 400 ms blocks. */
function gatedLoudness(blockPower: Float64Array): number | null {
  let sum = 0;
  let count = 0;
  for (const p of blockPower) {
    if (powerToLufs(p) > ABSOLUTE_GATE) {
      sum += p;
      count++;
    }
  }
  if (count === 0) return null;
  const relativeGate = powerToLufs(sum / count) + RELATIVE_GATE;
  const gate = Math.max(ABSOLUTE_GATE, relativeGate);
  sum = 0;
  count = 0;
  for (const p of blockPower) {
    if (powerToLufs(p) > gate) {
      sum += p;
      count++;
    }
  }
  return count > 0 ? round(powerToLufs(sum / count), 2) : null;
}

/** EBU Tech 3342: spread between the 10th and 95th percentile of gated short-term loudness. */
function loudnessRange(shortTermPower: Float64Array): number | null {
  const aboveAbsolute: number[] = [];
  let sum = 0;
  for (const p of shortTermPower) {
    if (powerToLufs(p) > ABSOLUTE_GATE) {
      aboveAbsolute.push(p);
      sum += p;
    }
  }
  if (aboveAbsolute.length < 2) return null;
  const gate = powerToLufs(sum / aboveAbsolute.length) + LRA_RELATIVE_GATE;
  const values = aboveAbsolute
    .map(powerToLufs)
    .filter((l) => l > gate)
    .sort((a, b) => a - b);
  if (values.length < 2) return null;
  const at = (q: number) => {
    const pos = (values.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.min(values.length - 1, lo + 1);
    return values[lo] + (values[hi] - values[lo]) * (pos - lo);
  };
  return round(at(0.95) - at(0.1), 2);
}

function toSeries(power: Float64Array): Float32Array {
  const out = new Float32Array(power.length);
  for (let i = 0; i < power.length; i++) out[i] = Math.max(SERIES_FLOOR, powerToLufs(power[i]));
  return out;
}

function round(v: number, digits: number): number {
  const m = 10 ** digits;
  return Math.round(v * m) / m;
}
