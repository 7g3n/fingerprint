import { hannWindow, RealFFT } from './fft';
import type { KeyEstimate, KeyMode } from './types';

/** Krumhansl & Kessler (1982) probe-tone profiles, tonic first. */
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export const PITCH_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

/** Chroma range C2 … C7. */
const CHROMA_MIN_HZ = 65.4;
const CHROMA_MAX_HZ = 2093;
/** Analyse at ~5.5 kHz: chroma needs nothing above C7 and the FFT gets finer. */
const TARGET_RATE = 5000;
const FFT_SIZE = 4096;
const HOP = 2048;
const MAGNITUDE_COMPRESSION = 100;
/** Frames quieter than this (summed magnitude) are skipped. */
const SILENT_FRAME = 1e-4;

const MIN_CORRELATION = 0.5;
const MIN_MARGIN = 0.01;

/**
 * Key estimate from the track's summed chroma with the Krumhansl–Schmuckler
 * algorithm (correlation against all 24 rotated major/minor profiles).
 * Returns key = null when the best correlation is weak or the runner-up is
 * too close to call.
 */
export function estimateKey(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  onProgress?: (fraction: number) => void,
): { chroma: Float32Array; key: KeyEstimate | null } {
  const chroma = computeChroma(left, right, sampleRate, onProgress);
  return { chroma, key: keyFromChroma(chroma) };
}

export function keyFromChroma(chroma: ArrayLike<number>): KeyEstimate | null {
  let mean = 0;
  for (let i = 0; i < 12; i++) mean += chroma[i];
  mean /= 12;
  let variance = 0;
  for (let i = 0; i < 12; i++) variance += (chroma[i] - mean) ** 2;
  if (!(variance > 1e-9)) return null;

  const scores: { tonic: number; mode: KeyMode; r: number }[] = [];
  for (const mode of ['major', 'minor'] as const) {
    const profile = mode === 'major' ? MAJOR_PROFILE : MINOR_PROFILE;
    for (let tonic = 0; tonic < 12; tonic++) {
      const rotated = new Array<number>(12);
      for (let pc = 0; pc < 12; pc++) rotated[pc] = profile[(pc - tonic + 12) % 12];
      scores.push({ tonic, mode, r: pearson(chroma, rotated) });
    }
  }
  scores.sort((a, b) => b.r - a.r || a.tonic - b.tonic);
  const [best, second] = scores;
  const margin = best.r - second.r;
  if (best.r < MIN_CORRELATION || margin < MIN_MARGIN) return null;

  return {
    tonic: best.tonic,
    mode: best.mode,
    name: `${PITCH_NAMES[best.tonic]} ${best.mode}`,
    camelot: camelotCode(best.tonic, best.mode),
    correlation: round3(best.r),
    margin: round3(margin),
  };
}

/** Camelot wheel: 8B = C major, 8A = A minor, one step per fifth. */
export function camelotCode(tonic: number, mode: KeyMode): string {
  const relativeMajor = mode === 'major' ? tonic : (tonic + 3) % 12;
  const fifths = (relativeMajor * 7) % 12; // C=0, G=1, D=2 …
  const number = ((fifths + 7) % 12) + 1;
  return `${number}${mode === 'major' ? 'B' : 'A'}`;
}

function computeChroma(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  onProgress?: (fraction: number) => void,
): Float32Array {
  const factor = Math.max(1, Math.floor(sampleRate / TARGET_RATE));
  const rate = sampleRate / factor;
  const signal = decimateMono(left, right, factor, sampleRate);

  const fft = new RealFFT(FFT_SIZE);
  const window = hannWindow(FFT_SIZE);
  const buffer = new Float64Array(FFT_SIZE);
  const power = new Float64Array(FFT_SIZE / 2 + 1);
  let windowSum = 0;
  for (let i = 0; i < FFT_SIZE; i++) windowSum += window[i];
  const scale = 2 / windowSum;

  // Precompute pitch class and weight for each FFT bin in range.
  const df = rate / FFT_SIZE;
  const kLo = Math.ceil(CHROMA_MIN_HZ / df);
  const kHi = Math.min(FFT_SIZE / 2, Math.floor(Math.min(CHROMA_MAX_HZ, rate * 0.45) / df));
  const binClass = new Int8Array(FFT_SIZE / 2 + 1).fill(-1);
  const binWeight = new Float64Array(FFT_SIZE / 2 + 1);
  for (let k = kLo; k <= kHi; k++) {
    const midi = 69 + 12 * Math.log2((k * df) / 440);
    const nearest = Math.round(midi);
    const deviation = midi - nearest;
    binClass[k] = ((nearest % 12) + 12) % 12;
    binWeight[k] = Math.cos(Math.PI * deviation) ** 2;
  }

  const frames = signal.length >= FFT_SIZE ? Math.floor((signal.length - FFT_SIZE) / HOP) + 1 : signal.length > 0 ? 1 : 0;
  const frameChroma = new Float64Array(frames * 12);
  const frameEnergy = new Float64Array(frames);
  const progressEvery = Math.max(1, Math.floor(frames / 20));

  for (let f = 0; f < frames; f++) {
    const start = f * HOP;
    for (let n = 0; n < FFT_SIZE; n++) buffer[n] = (signal[start + n] ?? 0) * window[n];
    fft.power(buffer, power);
    const row = f * 12;
    let energy = 0;
    for (let k = kLo; k <= kHi; k++) {
      const pc = binClass[k];
      if (pc < 0) continue;
      const mag = Math.sqrt(power[k]) * scale;
      energy += mag;
      frameChroma[row + pc] += binWeight[k] * Math.log1p(MAGNITUDE_COMPRESSION * mag);
    }
    frameEnergy[f] = energy;
    if (onProgress && f % progressEvery === 0) onProgress(f / frames);
  }

  // Each frame's chroma is max-normalised (so loud sections don't drown the
  // rest), then weighted down when the frame is much quieter than the track.
  const audible = Array.from(frameEnergy).filter((e) => e >= SILENT_FRAME).sort((a, b) => a - b);
  const reference = audible.length > 0 ? audible[Math.floor((audible.length - 1) * 0.75)] * 0.25 : 1;
  const total = new Float64Array(12);
  for (let f = 0; f < frames; f++) {
    if (frameEnergy[f] < SILENT_FRAME) continue;
    const row = f * 12;
    let frameMax = 0;
    for (let i = 0; i < 12; i++) if (frameChroma[row + i] > frameMax) frameMax = frameChroma[row + i];
    if (!(frameMax > 0)) continue;
    const weight = Math.min(1, frameEnergy[f] / reference);
    for (let i = 0; i < 12; i++) total[i] += (weight * frameChroma[row + i]) / frameMax;
  }

  let max = 0;
  for (let i = 0; i < 12; i++) if (total[i] > max) max = total[i];
  const chroma = new Float32Array(12);
  if (max > 0) for (let i = 0; i < 12; i++) chroma[i] = total[i] / max;
  return chroma;
}

/** Low-pass (Blackman-windowed sinc) and keep every `factor`-th sample of the mono mix. */
function decimateMono(
  left: Float32Array,
  right: Float32Array,
  factor: number,
  sampleRate: number,
): Float32Array {
  const length = Math.floor(left.length / factor);
  const out = new Float32Array(length);
  if (factor === 1) {
    for (let i = 0; i < length; i++) out[i] = (left[i] + right[i]) * 0.5;
    return out;
  }

  // Pass band ends at C7; aliases may land above it but not inside the chroma range.
  const outRate = sampleRate / factor;
  const transition = Math.max(outRate - 2 * CHROMA_MAX_HZ, outRate * 0.1) / sampleRate;
  let taps = Math.ceil(5.5 / transition);
  if (taps % 2 === 0) taps++;
  const half = (taps - 1) / 2;
  const cutoff = 0.5 / factor;
  const kernel = new Float64Array(taps);
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const x = i - half;
    const sinc = x === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * x) / (Math.PI * x);
    const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (taps - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (taps - 1));
    kernel[i] = sinc * w;
    sum += kernel[i];
  }
  for (let i = 0; i < taps; i++) kernel[i] /= sum;

  const n = left.length;
  for (let o = 0; o < length; o++) {
    const centre = o * factor;
    let acc = 0;
    const lo = Math.max(0, half - centre);
    const hi = Math.min(taps, n - centre + half);
    for (let t = lo; t < hi; t++) {
      const s = centre - half + t;
      acc += kernel[t] * (left[s] + right[s]);
    }
    out[o] = acc * 0.5;
  }
  return out;
}

function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < 12; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= 12;
  mb /= 12;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < 12; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
