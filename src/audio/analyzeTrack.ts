import { estimateKey } from './key';
import { measureLoudness } from './loudness';
import { ONSET_RATE, onsetEnvelope, pickOnsets } from './onset';
import { computeSpectralFeatures } from './spectral';
import { estimateTempo } from './tempo';
import { ANALYSIS_VERSION, type TrackFeatures } from './types';

export type AnalysisStage = 'spectrum' | 'rhythm' | 'key' | 'loudness';

export interface AnalyzeOptions {
  /** Progress callback; fraction is 0…1 over the whole analysis. */
  onProgress?: (fraction: number, stage: AnalysisStage) => void;
}

/** Share of the total running time spent in each stage, for progress reporting. */
const STAGES: readonly [AnalysisStage, number][] = [
  ['spectrum', 0.4],
  ['rhythm', 0.25],
  ['key', 0.15],
  ['loudness', 0.2],
];

/**
 * Analyses decoded PCM. Pure: the same channels and sample rate always give
 * the same features (the progress callback has no influence on the result).
 *
 * `channels` are planar samples in −1…1. A mono track is one channel; channels
 * past the first two are ignored.
 */
export function analyzeTrack(
  channels: readonly Float32Array[],
  sampleRate: number,
  options: AnalyzeOptions = {},
): TrackFeatures {
  if (channels.length === 0) throw new Error('analyzeTrack: no channels');
  if (!(sampleRate > 0)) throw new Error(`analyzeTrack: bad sample rate ${sampleRate}`);
  const left = channels[0];
  const right = channels[1] ?? channels[0];
  if (right.length !== left.length) throw new Error('analyzeTrack: channel lengths differ');

  const progress = makeProgress(options.onProgress);

  const spectral = computeSpectralFeatures(left, right, sampleRate, progress('spectrum'));

  const envelope = onsetEnvelope(left, right, sampleRate, progress('rhythm'));
  const onsets = pickOnsets(envelope, ONSET_RATE);
  const tempo = estimateTempo(envelope, ONSET_RATE);

  const { chroma, key } = estimateKey(left, right, sampleRate, progress('key'));

  const loudness = measureLoudness(channels.slice(0, 2), sampleRate, progress('loudness'));

  let peak = 0;
  for (const ch of channels.slice(0, 2)) {
    for (let i = 0; i < ch.length; i++) {
      const v = Math.abs(ch[i]);
      if (v > peak) peak = v;
    }
  }

  const duration = left.length / sampleRate;
  options.onProgress?.(1, 'loudness');

  return {
    analysisVersion: ANALYSIS_VERSION,
    sampleRate,
    channelCount: Math.min(2, channels.length),
    duration,
    ...spectral,
    onsets: {
      times: onsets.times,
      strengths: onsets.strengths,
      density: duration > 0 ? round(onsets.times.length / duration, 3) : 0,
    },
    tempo,
    chroma,
    key,
    loudness,
    peak: peak > 0 ? round(20 * Math.log10(peak), 2) : null,
  };
}

function makeProgress(callback: AnalyzeOptions['onProgress']) {
  return (stage: AnalysisStage) => {
    if (!callback) return undefined;
    let offset = 0;
    let span = 0;
    for (const [name, weight] of STAGES) {
      if (name === stage) {
        span = weight;
        break;
      }
      offset += weight;
    }
    return (fraction: number) => callback(offset + span * fraction, stage);
  };
}

function round(v: number, digits: number): number {
  const m = 10 ** digits;
  return Math.round(v * m) / m;
}
