import { nextPow2 } from './fft';
import { applyBands, buildLogBands, planFrames, powerToDb, stftPower } from './stft';
import type { TrackFeatures } from './types';

/** Same frame rate as phase-viz, so one frame per video frame at 30 fps. */
export const SPECTRO_FRAME_RATE = 30;
export const SPECTRO_BINS = 128;
export const SPECTRO_MIN_HZ = 30;
export const SPECTRO_MAX_HZ = 16000;
export const BAND_EDGES_HZ = [20, 250, 4000, 20000] as const;

/** Frames quieter than this (total power, dB) count as silent. */
const SILENT_FRAME_DB = -80;
/** The centroid mean only uses frames within this many dB of the loud frames. */
const CENTROID_RANGE_DB = 30;

type SpectralFeatures = Pick<TrackFeatures, 'spectrogram' | 'bands' | 'centroid' | 'stereo'>;

/**
 * Log-frequency spectrogram at 30 fps plus the per-frame band energy, spectral
 * centroid and stereo width, all from one STFT pass over the mono mix.
 */
export function computeSpectralFeatures(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  onProgress?: (fraction: number) => void,
): SpectralFeatures {
  const nyquist = sampleRate / 2;
  // ~93 ms window at 44.1 kHz: enough resolution for the bass end of a log axis.
  const fftSize = nextPow2(Math.round(sampleRate * 0.085));
  const hop = sampleRate / SPECTRO_FRAME_RATE;
  const frames = planFrames(left.length, hop);
  const maxHz = Math.min(SPECTRO_MAX_HZ, nyquist * 0.95);
  const logBands = buildLogBands(fftSize, sampleRate, SPECTRO_MIN_HZ, maxHz, SPECTRO_BINS);

  const db = new Float32Array(frames * SPECTRO_BINS);
  const low = new Float32Array(frames);
  const mid = new Float32Array(frames);
  const high = new Float32Array(frames);
  const centroidSeries = new Float32Array(frames);
  const frameDb = new Float32Array(frames);

  const df = sampleRate / fftSize;
  const half = fftSize >> 1;
  const binOf = (hz: number) => Math.min(half + 1, Math.max(0, Math.round(hz / df)));
  const [b0, b1, b2, b3] = BAND_EDGES_HZ.map((hz) => binOf(Math.min(hz, nyquist)));
  const kMin = binOf(20);
  const bandOut = new Float64Array(SPECTRO_BINS);

  stftPower(
    left,
    right,
    { fftSize, hop, frames },
    (f, power) => {
      applyBands(logBands, power, bandOut);
      const row = f * SPECTRO_BINS;
      for (let j = 0; j < SPECTRO_BINS; j++) db[row + j] = powerToDb(bandOut[j]);

      let lo = 0;
      let md = 0;
      let hi = 0;
      for (let k = b0; k < b1; k++) lo += power[k];
      for (let k = b1; k < b2; k++) md += power[k];
      for (let k = b2; k < b3; k++) hi += power[k];
      low[f] = powerToDb(lo);
      mid[f] = powerToDb(md);
      high[f] = powerToDb(hi);

      let total = 0;
      let weighted = 0;
      for (let k = kMin; k <= half; k++) {
        total += power[k];
        weighted += power[k] * k * df;
      }
      const totalDb = powerToDb(total);
      frameDb[f] = totalDb;
      centroidSeries[f] = totalDb > SILENT_FRAME_DB ? weighted / total : 0;
    },
    onProgress,
  );

  return {
    spectrogram: {
      frameRate: SPECTRO_FRAME_RATE,
      frames,
      bins: SPECTRO_BINS,
      minHz: SPECTRO_MIN_HZ,
      maxHz,
      centers: logBands.centers,
      db,
    },
    bands: { frameRate: SPECTRO_FRAME_RATE, edgesHz: BAND_EDGES_HZ, low, mid, high },
    centroid: {
      frameRate: SPECTRO_FRAME_RATE,
      series: centroidSeries,
      mean: meanCentroid(centroidSeries, frameDb),
    },
    stereo: {
      ...measureStereo(left, right),
      frameRate: SPECTRO_FRAME_RATE,
      series: stereoWidthSeries(left, right, hop, frames),
    },
  };
}

function meanCentroid(series: Float32Array, frameDb: Float32Array): number {
  const loud = Array.from(frameDb).filter((v) => v > SILENT_FRAME_DB).sort((a, b) => a - b);
  if (loud.length === 0) return 0;
  const reference = loud[Math.floor((loud.length - 1) * 0.95)];
  let sum = 0;
  let n = 0;
  for (let f = 0; f < series.length; f++) {
    if (frameDb[f] > SILENT_FRAME_DB && frameDb[f] >= reference - CENTROID_RANGE_DB) {
      sum += series[f];
      n++;
    }
  }
  return n > 0 ? sum / n : 0;
}

/**
 * Stereo correlation and width over the whole track.
 *
 * phase-viz looked only at the first 44 100 samples (one second) and used the
 * mean |L − R|, so an intro decided the result. This sums over every sample.
 */
export function measureStereo(
  left: Float32Array,
  right: Float32Array,
): { correlation: number; width: number } {
  if (left === right) return { correlation: 1, width: 0 };
  let ll = 0;
  let rr = 0;
  let lr = 0;
  const n = Math.min(left.length, right.length);
  for (let i = 0; i < n; i++) {
    const l = left[i];
    const r = right[i];
    ll += l * l;
    rr += r * r;
    lr += l * r;
  }
  if (ll === 0 && rr === 0) return { correlation: 1, width: 0 };
  const correlation = ll > 0 && rr > 0 ? clamp(lr / Math.sqrt(ll * rr), -1, 1) : 0;
  // mid = (l + r) / 2, side = (l − r) / 2
  const mid = (ll + rr + 2 * lr) / 4;
  const side = (ll + rr - 2 * lr) / 4;
  const width = mid + side > 0 ? clamp(side / (mid + side), 0, 1) : 0;
  return { correlation, width };
}

function stereoWidthSeries(
  left: Float32Array,
  right: Float32Array,
  hop: number,
  frames: number,
): Float32Array {
  const series = new Float32Array(frames);
  if (left === right) return series;
  const n = Math.min(left.length, right.length);
  for (let f = 0; f < frames; f++) {
    const s = Math.max(0, Math.round((f - 0.5) * hop));
    const e = Math.min(n, Math.round((f + 0.5) * hop));
    let mid = 0;
    let side = 0;
    for (let i = s; i < e; i++) {
      const m = left[i] + right[i];
      const d = left[i] - right[i];
      mid += m * m;
      side += d * d;
    }
    series[f] = mid + side > 1e-12 ? side / (mid + side) : 0;
  }
  return series;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
