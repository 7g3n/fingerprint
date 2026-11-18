import { ONSET_RATE, pickOnsets } from './onset';

const MIN_BPM = 50;
const MAX_BPM = 220;
/** Log-normal tempo prior: centre and spread in octaves (as in librosa). */
const PRIOR_CENTER_BPM = 120;
const PRIOR_OCTAVES = 1;
/** Below this normalised autocorrelation there is no steady pulse. */
const MIN_CONFIDENCE = 0.12;
/** A pulse needs actual onsets: at least this many, and this many per second. */
const MIN_ONSETS = 8;
const MIN_ONSET_DENSITY = 0.3;

/**
 * Tempo from the autocorrelation of the onset envelope.
 *
 * phase-viz took the median gap between energy onsets, which drifts on
 * syncopated patterns and returned 120 when unsure. This version:
 *  1. removes the local mean of the envelope (so loud sections don't dominate),
 *  2. scores each beat period by its autocorrelation plus that of twice the
 *     period, times a tempo prior centred on 120 BPM,
 *  3. refines the period with parabolic peak fits at several multiples of it,
 *  4. returns null when the pulse is weak (ambient, rubato, silence) or there
 *     are too few onsets to carry one (beating pads have periodic shimmer
 *     but no attacks).
 */
export function estimateTempo(
  envelope: Float32Array,
  rate = ONSET_RATE,
): { bpm: number; confidence: number } | null {
  const n = envelope.length;
  const minLag = Math.floor((60 * rate) / MAX_BPM);
  const maxLag = Math.ceil((60 * rate) / MIN_BPM);
  const acMaxLag = Math.min(n - 2, maxLag * 4 + 4);
  if (acMaxLag < maxLag * 2 + 2) return null;

  const onsetCount = pickOnsets(envelope, rate).times.length;
  if (onsetCount < MIN_ONSETS || onsetCount < MIN_ONSET_DENSITY * (n / rate)) return null;

  // 1. Local-mean removal and half-wave rectification.
  const radius = Math.round(0.5 * rate);
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + envelope[i];
  const u = new Float64Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - radius);
    const hi = Math.min(n, i + radius + 1);
    const v = envelope[i] - (prefix[hi] - prefix[lo]) / (hi - lo);
    u[i] = v > 0 ? v : 0;
    mean += u[i];
  }
  mean /= n;
  for (let i = 0; i < n; i++) u[i] -= mean;

  // Unbiased autocorrelation.
  const ac = new Float64Array(acMaxLag + 1);
  for (let lag = 0; lag <= acMaxLag; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < n; i++) sum += u[i] * u[i + lag];
    ac[lag] = sum / (n - lag);
  }
  if (!(ac[0] > 0)) return null;

  const smooth = (lag: number) => 0.25 * ac[lag - 1] + 0.5 * ac[lag] + 0.25 * ac[lag + 1];

  // 2. Pick the beat period.
  let bestLag = -1;
  let bestScore = -Infinity;
  for (let lag = Math.max(1, minLag); lag <= maxLag; lag++) {
    const bpm = (60 * rate) / lag;
    const octaves = Math.log2(bpm / PRIOR_CENTER_BPM) / PRIOR_OCTAVES;
    const prior = Math.exp(-0.5 * octaves * octaves);
    const score = (smooth(lag) + 0.5 * smooth(2 * lag)) * prior;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (bestLag < 0) return null;

  const first = refinePeak(ac, bestLag, 2);
  const confidence = ac[Math.round(first)] / ac[0];
  if (!(confidence >= MIN_CONFIDENCE)) return null;

  // 3. Least-squares period through the peaks at m × period.
  let num = 0;
  let den = 0;
  for (let m = 1; m * first + 3 <= acMaxLag; m++) {
    const peak = refinePeak(ac, Math.round(m * first), 2);
    const height = ac[Math.round(peak)];
    if (!(height > 0.3 * ac[Math.round(first)])) continue;
    num += height * m * peak;
    den += height * m * m;
  }
  const period = den > 0 ? num / den : first;
  const bpm = Math.round(((60 * rate) / period) * 10) / 10;
  return { bpm, confidence: Math.round(confidence * 1000) / 1000 };
}

/** Local maximum near `lag` (±radius) refined with a parabola through its neighbours. */
function refinePeak(ac: Float64Array, lag: number, radius: number): number {
  let best = lag;
  for (let l = Math.max(1, lag - radius); l <= Math.min(ac.length - 2, lag + radius); l++) {
    if (ac[l] > ac[best]) best = l;
  }
  if (best <= 0 || best >= ac.length - 1) return best;
  const a = ac[best - 1];
  const b = ac[best];
  const c = ac[best + 1];
  const denom = a - 2 * b + c;
  if (denom >= 0) return best;
  const offset = (0.5 * (a - c)) / denom;
  return best + Math.max(-0.5, Math.min(0.5, offset));
}
