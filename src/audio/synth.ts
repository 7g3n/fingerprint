/**
 * Deterministic test-signal generators, shared by the unit tests and the
 * sample-render script. Nothing here is used by the app at runtime.
 */

/** Small seeded PRNG so noise is identical on every run. */
export function noiseSource(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return (s / 4294967296) * 2 - 1;
  };
}

export function dbToAmp(db: number): number {
  return Math.pow(10, db / 20);
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Sine with peak amplitude from dBFS, as used by EBU Tech 3341/3342. */
export function sine(freq: number, dbfs: number, seconds: number, sampleRate: number, phase = 0): Float32Array {
  const n = Math.round(seconds * sampleRate);
  const out = new Float32Array(n);
  const amp = dbToAmp(dbfs);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate + phase);
  return out;
}

export function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** Short decaying noise bursts on every beat. */
export function clickTrain(
  bpm: number,
  seconds: number,
  sampleRate: number,
  { offset = 0.1, amplitude = 0.8, seed = 1 } = {},
): Float32Array {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  const rand = noiseSource(seed);
  const period = 60 / bpm;
  const clickLength = Math.round(0.01 * sampleRate);
  for (let t = offset; t < seconds; t += period) {
    const start = Math.round(t * sampleRate);
    for (let i = 0; i < clickLength && start + i < out.length; i++) {
      out[start + i] += amplitude * rand() * Math.exp(-i / (0.002 * sampleRate));
    }
  }
  return out;
}

/** A tone with a few harmonics and a soft attack/release. */
export function addTone(
  out: Float32Array,
  sampleRate: number,
  freq: number,
  startSec: number,
  lengthSec: number,
  amplitude: number,
  { harmonics = 4, attack = 0.02, release = 0.08, pan = 0, outRight }: { harmonics?: number; attack?: number; release?: number; pan?: number; outRight?: Float32Array } = {},
): void {
  const start = Math.round(startSec * sampleRate);
  const n = Math.round(lengthSec * sampleRate);
  const a = Math.max(1, Math.round(attack * sampleRate));
  const r = Math.max(1, Math.round(release * sampleRate));
  const gl = outRight ? Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2 : 1;
  const gr = outRight ? Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2 : 0;
  for (let i = 0; i < n; i++) {
    const idx = start + i;
    if (idx < 0 || idx >= out.length) continue;
    const env = Math.min(1, i / a, (n - i) / r);
    let v = 0;
    for (let h = 1; h <= harmonics; h++) {
      const f = freq * h;
      if (f > sampleRate * 0.45) break;
      v += Math.sin((2 * Math.PI * f * i) / sampleRate) / h;
    }
    const s = amplitude * env * v;
    out[idx] += s * gl;
    if (outRight) outRight[idx] += s * gr;
  }
}

/** Block chords, each a list of MIDI notes, `secondsPerChord` long, looped to `seconds`. */
export function chordProgression(
  chords: number[][],
  secondsPerChord: number,
  seconds: number,
  sampleRate: number,
  amplitude = 0.12,
): Float32Array {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  let index = 0;
  for (let t = 0; t < seconds; t += secondsPerChord, index++) {
    const chord = chords[index % chords.length];
    for (const note of chord) {
      addTone(out, sampleRate, midiToHz(note), t, Math.min(secondsPerChord, seconds - t), amplitude);
    }
  }
  return out;
}

export function whiteNoise(seconds: number, sampleRate: number, amplitude: number, seed = 7): Float32Array {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  const rand = noiseSource(seed);
  for (let i = 0; i < out.length; i++) out[i] = amplitude * rand();
  return out;
}
