import { applyBands, buildLogBands, planFrames, stftPower } from './stft';

/** Onset envelope rate. 10 ms steps keep tempo estimates precise. */
export const ONSET_RATE = 100;
const ONSET_BANDS = 36;
/** log(1 + γ·|X|) compression, so attacks out of silence don't dwarf the rest. */
const COMPRESSION = 1000;
/** Tracks are scaled to this RMS before compression (at most MAX_GAIN times). */
const REFERENCE_RMS = 0.1;
const MAX_GAIN = 100;

/**
 * Spectral-flux onset strength: the summed positive change of log-compressed
 * band magnitudes between consecutive 10 ms frames.
 *
 * Replaces phase-viz's frame-energy derivative, which missed attacks that do
 * not raise the total energy much (hi-hats over a sustained bass, for example).
 */
export function onsetEnvelope(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  onProgress?: (fraction: number) => void,
): Float32Array {
  const fftSize = 1 << Math.round(Math.log2(sampleRate * 0.0232));
  const hop = sampleRate / ONSET_RATE;
  const frames = planFrames(left.length, hop);
  const bands = buildLogBands(fftSize, sampleRate, 40, Math.min(16000, sampleRate * 0.45), ONSET_BANDS);
  const envelope = new Float32Array(frames);
  const current = new Float64Array(ONSET_BANDS);
  const previous = new Float64Array(ONSET_BANDS);

  // Level-normalise to the track's RMS so a quiet master is read like a loud one.
  let sum = 0;
  for (let i = 0; i < left.length; i++) {
    const m = (left[i] + right[i]) * 0.5;
    sum += m * m;
  }
  const rms = left.length > 0 ? Math.sqrt(sum / left.length) : 0;
  if (!(rms > 1e-6)) return envelope;
  const gain = COMPRESSION * Math.min(MAX_GAIN, REFERENCE_RMS / rms);

  stftPower(
    left,
    right,
    { fftSize, hop, frames },
    (f, power) => {
      applyBands(bands, power, current);
      let flux = 0;
      for (let b = 0; b < ONSET_BANDS; b++) {
        const c = Math.log1p(gain * Math.sqrt(current[b]));
        if (f > 0) {
          const d = c - previous[b];
          if (d > 0) flux += d;
        }
        previous[b] = c;
      }
      envelope[f] = flux / ONSET_BANDS;
    },
    onProgress,
  );
  return envelope;
}

export interface OnsetList {
  times: Float32Array;
  strengths: Float32Array;
}

const PEAK_RADIUS = 3; // frames either side that a peak must beat
const BACKGROUND_SECONDS = 1;
/** A peak must rise above BACKGROUND_FACTOR × local median + MARGIN. */
const BACKGROUND_FACTOR = 3;
const MARGIN = 0.15;
const MIN_GAP_SECONDS = 0.05;

/**
 * Peak-picks the onset envelope into onset times (seconds) and strengths (0…1).
 *
 * A peak has to stand out from the local background (the moving median of the
 * envelope), so the steady shimmer of pads, beating partials and noise beds
 * is not read as a stream of onsets.
 */
export function pickOnsets(envelope: Float32Array, rate = ONSET_RATE): OnsetList {
  const n = envelope.length;
  const background = movingMedian(envelope, Math.max(1, Math.round(BACKGROUND_SECONDS * rate)));
  const minGap = Math.round(MIN_GAP_SECONDS * rate);

  const frames: number[] = [];
  const values: number[] = [];
  for (let i = 1; i < n; i++) {
    const v = envelope[i];
    if (v < BACKGROUND_FACTOR * background[i] + MARGIN) continue;
    let isPeak = true;
    for (let k = 1; k <= PEAK_RADIUS && isPeak; k++) {
      if (i - k >= 0 && envelope[i - k] >= v) isPeak = false;
      if (i + k < n && envelope[i + k] > v) isPeak = false;
    }
    if (!isPeak) continue;
    const last = frames.length - 1;
    if (last >= 0 && i - frames[last] < minGap) {
      // Keep the stronger of two peaks that are too close together.
      if (v > values[last]) {
        frames[last] = i;
        values[last] = v;
      }
      continue;
    }
    frames.push(i);
    values.push(v);
  }

  // Strength relative to the track's own strong onsets.
  const reference = Math.max(percentile(values, 0.95), 1e-9);
  return {
    times: Float32Array.from(frames, (f) => f / rate),
    strengths: Float32Array.from(values, (v) => Math.min(1, v / reference)),
  };
}

/** Median over blocks of `block` frames, linearly interpolated between block centres. */
function movingMedian(x: Float32Array, block: number): Float64Array {
  const n = x.length;
  const out = new Float64Array(n);
  if (n === 0) return out;
  const blocks = Math.ceil(n / block);
  const medians = new Float64Array(blocks);
  for (let b = 0; b < blocks; b++) {
    const slice = Float64Array.from(x.subarray(b * block, Math.min(n, (b + 1) * block))).sort();
    const mid = slice.length >> 1;
    medians[b] = slice.length % 2 ? slice[mid] : 0.5 * (slice[mid - 1] + slice[mid]);
  }
  for (let i = 0; i < n; i++) {
    const p = (i + 0.5) / block - 0.5;
    const b0 = Math.max(0, Math.min(blocks - 1, Math.floor(p)));
    const b1 = Math.min(blocks - 1, b0 + 1);
    const t = Math.max(0, Math.min(1, p - b0));
    out[i] = medians[b0] + (medians[b1] - medians[b0]) * t;
  }
  return out;
}

export function percentile(values: ArrayLike<number>, q: number): number {
  if (values.length === 0) return 0;
  const sorted = Float64Array.from(values as ArrayLike<number>).sort();
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
