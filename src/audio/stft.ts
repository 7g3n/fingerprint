import { hannWindow, RealFFT } from './fft';

/** Sparse matrix that maps FFT power bins onto a smaller set of bands. */
export interface BandWeights {
  count: number;
  /** Band centre frequencies in Hz. */
  centers: Float32Array;
  /** Band edges in Hz, length count + 1. */
  edges: Float64Array;
  /** start[j]..start[j+1] index into `index`/`weight` for band j. */
  start: Uint32Array;
  index: Uint32Array;
  weight: Float64Array;
}

/**
 * Builds `count` log-spaced bands between minHz and maxHz. Each band value is
 * the mean power density over the band: narrow low bands (narrower than one FFT
 * bin) interpolate between the two nearest bins, wide bands integrate the bins
 * they overlap.
 */
export function buildLogBands(
  fftSize: number,
  sampleRate: number,
  minHz: number,
  maxHz: number,
  count: number,
): BandWeights {
  const half = fftSize >> 1;
  const df = sampleRate / fftSize;
  const edges = new Float64Array(count + 1);
  const ratio = maxHz / minHz;
  for (let e = 0; e <= count; e++) edges[e] = minHz * Math.pow(ratio, e / count);

  const centers = new Float32Array(count);
  const start = new Uint32Array(count + 1);
  const index: number[] = [];
  const weight: number[] = [];

  for (let j = 0; j < count; j++) {
    const lo = edges[j];
    const hi = edges[j + 1];
    const center = Math.sqrt(lo * hi);
    centers[j] = center;
    start[j] = index.length;

    if (hi - lo < df) {
      const x = Math.min(center / df, half);
      const k0 = Math.min(Math.floor(x), half - 1);
      const frac = x - k0;
      index.push(k0, k0 + 1);
      weight.push(1 - frac, frac);
    } else {
      const kFirst = Math.max(0, Math.floor(lo / df + 0.5));
      const kLast = Math.min(half, Math.ceil(hi / df - 0.5));
      const width = hi - lo;
      for (let k = kFirst; k <= kLast; k++) {
        const binLo = (k - 0.5) * df;
        const binHi = (k + 0.5) * df;
        const overlap = Math.min(hi, binHi) - Math.max(lo, binLo);
        if (overlap > 0) {
          index.push(k);
          weight.push(overlap / width);
        }
      }
    }
  }
  start[count] = index.length;

  return {
    count,
    centers,
    edges,
    start,
    index: Uint32Array.from(index),
    weight: Float64Array.from(weight),
  };
}

export function applyBands(bands: BandWeights, power: Float64Array, out: Float64Array): void {
  const { start, index, weight } = bands;
  for (let j = 0; j < bands.count; j++) {
    let sum = 0;
    for (let p = start[j]; p < start[j + 1]; p++) sum += power[index[p]] * weight[p];
    out[j] = sum;
  }
}

export interface StftPlan {
  fftSize: number;
  /** Hop in samples; may be fractional. Frame i is centred on round(i * hop). */
  hop: number;
  frames: number;
}

export function planFrames(length: number, hop: number): number {
  if (length <= 0) return 0;
  return Math.floor((length - 1) / hop) + 1;
}

/**
 * Runs a Hann-windowed STFT over the mono mix (L + R) / 2 and calls `onFrame`
 * with the power spectrum of each frame, scaled so that a sine of amplitude A
 * peaks at about A^2. Samples outside the signal are treated as silence.
 */
export function stftPower(
  left: Float32Array,
  right: Float32Array,
  plan: StftPlan,
  onFrame: (frame: number, power: Float64Array) => void,
  onProgress?: (fraction: number) => void,
): void {
  const { fftSize, hop, frames } = plan;
  const fft = new RealFFT(fftSize);
  const window = hannWindow(fftSize);
  let windowSum = 0;
  for (let i = 0; i < fftSize; i++) windowSum += window[i];
  const scale = (2 / windowSum) ** 2;

  const length = left.length;
  const buffer = new Float64Array(fftSize);
  const power = new Float64Array((fftSize >> 1) + 1);
  const halfSize = fftSize >> 1;
  const progressEvery = Math.max(1, Math.floor(frames / 50));

  for (let f = 0; f < frames; f++) {
    const startSample = Math.round(f * hop) - halfSize;
    const lo = Math.max(0, -startSample);
    const hi = Math.min(fftSize, length - startSample);
    if (lo > 0 || hi < fftSize) buffer.fill(0);
    for (let n = lo; n < hi; n++) {
      const s = startSample + n;
      buffer[n] = (left[s] + right[s]) * 0.5 * window[n];
    }
    fft.power(buffer, power);
    for (let k = 0; k <= halfSize; k++) power[k] *= scale;
    onFrame(f, power);
    if (onProgress && f % progressEvery === 0) onProgress(f / frames);
  }
}

export function powerToDb(power: number, floorDb = -120): number {
  if (!(power > 0)) return floorDb;
  const db = 10 * Math.log10(power);
  return db < floorDb ? floorDb : db;
}
