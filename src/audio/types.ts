/** Bump when analysis output changes in a way that changes the art. */
export const ANALYSIS_VERSION = 1;

export type KeyMode = 'major' | 'minor';

export interface KeyEstimate {
  /** Pitch class of the tonic, C = 0 … B = 11. */
  tonic: number;
  mode: KeyMode;
  /** e.g. "F# minor". */
  name: string;
  /** Camelot wheel code, e.g. "11A". */
  camelot: string;
  /** Pearson correlation of the best Krumhansl–Kessler profile (−1…1). */
  correlation: number;
  /** Lead over the runner-up key. */
  margin: number;
}

export interface Spectrogram {
  /** Frames per second (frame i is centred at i / frameRate seconds). */
  frameRate: number;
  frames: number;
  /** Log-spaced frequency bins. */
  bins: number;
  minHz: number;
  maxHz: number;
  centers: Float32Array;
  /** frames × bins, row-major by frame, power in dB (full-scale sine ≈ 0 dB). */
  db: Float32Array;
}

export interface TrackFeatures {
  analysisVersion: number;
  sampleRate: number;
  channelCount: number;
  /** Seconds. */
  duration: number;

  spectrogram: Spectrogram;

  /** Band energy per spectrogram frame, dB. */
  bands: {
    frameRate: number;
    edgesHz: readonly [number, number, number, number];
    low: Float32Array;
    mid: Float32Array;
    high: Float32Array;
  };

  /** Spectral centroid per spectrogram frame in Hz (0 for silent frames). */
  centroid: {
    frameRate: number;
    series: Float32Array;
    /** Mean over the non-quiet frames, Hz. */
    mean: number;
  };

  onsets: {
    /** Seconds. */
    times: Float32Array;
    /** 0…1, relative to the track's own strong onsets. */
    strengths: Float32Array;
    /** Onsets per second. */
    density: number;
  };

  /** null when the track has no steady pulse. */
  tempo: { bpm: number; confidence: number } | null;

  /** Summed chroma, C … B, max-normalised. */
  chroma: Float32Array;
  /** null when the key cannot be estimated with confidence. */
  key: KeyEstimate | null;

  loudness: {
    /** ITU-R BS.1770-4 integrated loudness, LUFS. null for silence. */
    integrated: number | null;
    /** EBU Tech 3342 loudness range, LU. null when there is not enough signal. */
    range: number | null;
    /** Values per second of the two series below. */
    rate: number;
    /** 400 ms windows; value j starts at j / rate seconds. LUFS, floored at −120. */
    momentary: Float32Array;
    /** 3 s windows; value j starts at j / rate seconds. LUFS, floored at −120. */
    shortTerm: Float32Array;
  };

  /** Sample peak in dBFS. null for silence. */
  peak: number | null;

  stereo: {
    /** Whole-track Pearson correlation of L and R (−1…1). */
    correlation: number;
    /** Side energy / (mid + side) energy over the whole track: 0 mono, 0.5 uncorrelated, 1 out of phase. */
    width: number;
    frameRate: number;
    /** Width per spectrogram frame. */
    series: Float32Array;
  };
}

/** Typed arrays inside features, for zero-copy postMessage. */
export function featureTransferables(f: TrackFeatures): ArrayBuffer[] {
  const arrays = [
    f.spectrogram.centers,
    f.spectrogram.db,
    f.bands.low,
    f.bands.mid,
    f.bands.high,
    f.centroid.series,
    f.onsets.times,
    f.onsets.strengths,
    f.chroma,
    f.loudness.momentary,
    f.loudness.shortTerm,
    f.stereo.series,
  ];
  const buffers = new Set<ArrayBuffer>();
  for (const a of arrays) buffers.add(a.buffer as ArrayBuffer);
  return [...buffers];
}
