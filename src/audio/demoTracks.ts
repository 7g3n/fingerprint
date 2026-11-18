/**
 * Three synthetic demo tracks with very different characters, used to render
 * the sample images and in tests. Deterministic (seeded noise only).
 * Nothing here is used by the app at runtime.
 */
import { measureLoudness } from './loudness';
import { midiToHz, noiseSource } from './synth';

export const DEMO_SAMPLE_RATE = 44100;

export interface DemoTrack {
  name: string;
  title: string;
  description: string;
  left: Float32Array;
  right: Float32Array;
}

class Mix {
  readonly left: Float32Array;
  readonly right: Float32Array;
  readonly sr: number;
  constructor(seconds: number, sr: number) {
    this.sr = sr;
    this.left = new Float32Array(Math.round(seconds * sr));
    this.right = new Float32Array(Math.round(seconds * sr));
  }
  get length() {
    return this.left.length;
  }
  add(i: number, l: number, r: number) {
    if (i >= 0 && i < this.left.length) {
      this.left[i] += l;
      this.right[i] += r;
    }
  }
  /** Scales so integrated loudness hits `lufs`, then soft-clips with tanh at `ceiling`. */
  master(lufs: number, drive = 1, ceiling = 0.97) {
    const measured = measureLoudness([this.left, this.right], this.sr).integrated ?? -70;
    const gain = Math.pow(10, (lufs - measured) / 20) * drive;
    for (const ch of [this.left, this.right]) {
      for (let i = 0; i < ch.length; i++) ch[i] = ceiling * Math.tanh((ch[i] * gain) / ceiling);
    }
    if (drive !== 1) {
      // Re-trim after clipping so the target holds.
      const after = measureLoudness([this.left, this.right], this.sr).integrated ?? lufs;
      const trim = Math.min(1, Math.pow(10, (lufs - after) / 20));
      for (const ch of [this.left, this.right]) for (let i = 0; i < ch.length; i++) ch[i] *= trim;
    }
  }
}

const saw = (phase: number) => 2 * (phase - Math.floor(phase)) - 1;

function kick(mix: Mix, t: number, gain = 0.9) {
  const sr = mix.sr;
  const start = Math.round(t * sr);
  let phase = 0;
  for (let i = 0; i < 0.32 * sr; i++) {
    const f = 46 + 120 * Math.exp(-i / (0.025 * sr));
    phase += f / sr;
    const v = gain * Math.sin(2 * Math.PI * phase) * Math.exp(-i / (0.16 * sr));
    mix.add(start + i, v, v);
  }
}

function noiseHit(
  mix: Mix,
  rand: () => number,
  t: number,
  { gain, decay, length, highpass = 0.0, lowpass = 1, width = 0.3 }: { gain: number; decay: number; length: number; highpass?: number; lowpass?: number; width?: number },
) {
  const sr = mix.sr;
  const start = Math.round(t * sr);
  let lpL = 0;
  let lpR = 0;
  let hpL = 0;
  let hpR = 0;
  for (let i = 0; i < length * sr; i++) {
    const env = gain * Math.exp(-i / (decay * sr));
    const n = rand();
    const nl = n * (1 - width) + rand() * width;
    const nr = n * (1 - width) + rand() * width;
    lpL += lowpass * (nl - lpL);
    lpR += lowpass * (nr - lpR);
    hpL += highpass * (lpL - hpL);
    hpR += highpass * (lpR - hpR);
    mix.add(start + i, env * (lpL - hpL), env * (lpR - hpR));
  }
}

/** Detuned saw voice through a one-pole low-pass; `detune` in cents splits L/R. */
function sawVoice(
  mix: Mix,
  t: number,
  length: number,
  hz: number,
  { gain, cutoff = 0.08, attack = 0.005, release = 0.05, detune = 0, voices = 1 }: { gain: number; cutoff?: number; attack?: number; release?: number; detune?: number; voices?: number },
) {
  const sr = mix.sr;
  const start = Math.round(t * sr);
  const n = Math.round(length * sr);
  const a = Math.max(1, attack * sr);
  const r = Math.max(1, release * sr);
  const ratioL = Math.pow(2, -detune / 1200);
  const ratioR = Math.pow(2, detune / 1200);
  const phasesL = new Float64Array(voices).map((_, v) => v * 0.37);
  const phasesR = new Float64Array(voices).map((_, v) => v * 0.61);
  let yl = 0;
  let yr = 0;
  for (let i = 0; i < n; i++) {
    let l = 0;
    let rr = 0;
    for (let v = 0; v < voices; v++) {
      const spread = 1 + (v - (voices - 1) / 2) * 0.004;
      phasesL[v] += (hz * ratioL * spread) / sr;
      phasesR[v] += (hz * ratioR * spread) / sr;
      l += saw(phasesL[v]);
      rr += saw(phasesR[v]);
    }
    yl += cutoff * (l / voices - yl);
    yr += cutoff * (rr / voices - yr);
    const env = gain * Math.min(1, i / a, (n - i) / r);
    mix.add(start + i, env * yl, env * yr);
  }
}

function sineVoice(mix: Mix, t: number, length: number, hz: number, gain: number, decay: number, pan = 0) {
  const sr = mix.sr;
  const start = Math.round(t * sr);
  const gl = Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < length * sr; i++) {
    const env = gain * Math.exp(-i / (decay * sr)) * Math.min(1, i / (0.002 * sr));
    const v = env * (Math.sin((2 * Math.PI * hz * i) / sr) + 0.3 * Math.sin((2 * Math.PI * hz * 2.76 * i) / sr));
    mix.add(start + i, v * gl, v * gr);
  }
}

/** Quiet, wide, slow: D minor pads, a sub drone, sparse bells, a near-silent middle. */
export function ambientTrack(seconds = 150, sr = DEMO_SAMPLE_RATE): DemoTrack {
  const mix = new Mix(seconds, sr);
  const rand = noiseSource(101);
  const chords = [
    [50, 57, 60, 64, 65],
    [46, 53, 57, 62, 65],
    [41, 53, 57, 60, 64],
    [48, 55, 57, 64, 67],
  ];
  const chordLength = 16;
  const hole = [72, 84];
  for (let c = 0; c * chordLength < seconds; c++) {
    const t = c * chordLength;
    if (t >= hole[0] && t < hole[1]) continue;
    for (const note of chords[c % chords.length]) {
      sawVoice(mix, t, chordLength + 4, midiToHz(note), {
        gain: 0.05,
        cutoff: 0.02 + 0.015 * Math.sin(c),
        attack: 5,
        release: 6,
        detune: 16,
        voices: 3,
      });
    }
  }
  // Sub drone, dipping out for the quiet middle.
  for (let i = 0; i < mix.length; i++) {
    const t = i / sr;
    const dip = t > hole[0] && t < hole[1] ? 0.15 : 1;
    const v = 0.035 * dip * Math.sin(2 * Math.PI * 36.71 * t) * Math.min(1, t / 10, (seconds - t) / 10);
    mix.add(i, v, v);
  }
  // Sparse bells.
  let t = 6;
  while (t < seconds - 8) {
    if (t < hole[0] || t > hole[1]) {
      const note = [74, 77, 81, 84, 86][Math.floor((rand() * 0.5 + 0.5) * 5) % 5];
      sineVoice(mix, t, 4, midiToHz(note), 0.06, 1.2, rand() * 0.8);
    }
    t += 3 + (rand() * 0.5 + 0.5) * 5;
  }
  // Air: decorrelated low-passed noise bed.
  let al = 0;
  let ar = 0;
  for (let i = 0; i < mix.length; i++) {
    al += 0.05 * (rand() - al);
    ar += 0.05 * (rand() - ar);
    const env = 0.02 * Math.min(1, i / (15 * sr), (mix.length - i) / (15 * sr));
    mix.add(i, env * al, env * ar);
  }
  // Long fades.
  for (const ch of [mix.left, mix.right]) {
    for (let i = 0; i < ch.length; i++) ch[i] *= Math.min(1, i / (12 * sr), (ch.length - i) / (15 * sr));
  }
  mix.master(-23);
  return { name: 'ambient', title: 'Slow Water', description: 'Quiet ambient: slow pads, no beat, near-silent middle', ...mix };
}

/** Loud four-on-the-floor at 128 BPM in F minor: intro, build, drop, break, drop. */
export function fourOnTheFloorTrack(seconds = 150, sr = DEMO_SAMPLE_RATE): DemoTrack {
  const mix = new Mix(seconds, sr);
  const rand = noiseSource(202);
  const beat = 60 / 128;
  const bar = 4 * beat;
  const bars = Math.floor(seconds / bar);
  // Fm – Db – Ab – Eb, one chord per bar.
  const roots = [41, 37, 44, 39];
  const stabs = [
    [65, 68, 72],
    [61, 65, 68],
    [63, 68, 72],
    [63, 67, 70],
  ];
  const section = (b: number) => (b < 16 ? 'intro' : b < 24 ? 'build' : b < 56 ? 'drop' : b < 64 ? 'break' : 'drop');

  for (let b = 0; b < bars; b++) {
    const s = section(b);
    const t0 = b * bar;
    const chord = b % 4;
    if (s === 'break') {
      for (const note of stabs[chord]) sawVoice(mix, t0, bar, midiToHz(note - 12), { gain: 0.07, cutoff: 0.05, attack: 0.4, release: 0.5, detune: 12, voices: 3 });
      continue;
    }
    for (let k = 0; k < 4; k++) {
      const t = t0 + k * beat;
      kick(mix, t);
      if (k % 2 === 1 && s !== 'intro') noiseHit(mix, rand, t, { gain: 0.35, decay: 0.05, length: 0.2, highpass: 0.08, lowpass: 0.5, width: 0.4 });
      noiseHit(mix, rand, t + beat / 2, { gain: 0.2, decay: 0.06, length: 0.15, highpass: 0.5, width: 0.6 });
      for (let q = 0; q < 4; q++) noiseHit(mix, rand, t + (q * beat) / 4, { gain: 0.05, decay: 0.012, length: 0.04, highpass: 0.7, width: 0.8 });
      if (s !== 'intro') {
        sawVoice(mix, t + beat / 2, beat / 2 - 0.02, midiToHz(roots[chord]), { gain: 0.3, cutoff: 0.12, release: 0.02 });
        sawVoice(mix, t + beat / 2, beat / 2 - 0.02, midiToHz(roots[chord] + 12), { gain: 0.12, cutoff: 0.2, release: 0.02 });
      }
      if (s === 'drop' && (k === 1 || k === 3)) {
        for (const note of stabs[chord]) sawVoice(mix, t + (3 * beat) / 4, beat / 3, midiToHz(note), { gain: 0.14, cutoff: 0.3, detune: 18, voices: 3 });
      }
    }
    if (s === 'drop' || s === 'build') {
      for (const note of stabs[chord]) sawVoice(mix, t0, bar, midiToHz(note - 12), { gain: 0.045, cutoff: 0.06, attack: 0.05, release: 0.1, detune: 22, voices: 3 });
    }
    if (s === 'build') {
      // Riser: noise brightening over the 8 bars.
      const progress = (b - 16) / 8;
      noiseHit(mix, rand, t0, { gain: 0.04 + 0.12 * progress, decay: 10, length: bar, highpass: 0.2 + 0.5 * progress, width: 0.7 });
    }
  }
  mix.master(-7, 1.8);
  return { name: 'four-on-the-floor', title: 'Floor Pressure', description: 'Loud 128 BPM four-on-the-floor in F minor', ...mix };
}

/** 172 BPM breakbeat in E minor with hard stops, a breakdown and stutter edits. */
export function breaksTrack(seconds = 150, sr = DEMO_SAMPLE_RATE): DemoTrack {
  const mix = new Mix(seconds, sr);
  const rand = noiseSource(303);
  const beat = 60 / 172;
  const step = beat / 4;
  const bar = 4 * beat;
  const bars = Math.floor(seconds / bar);
  // 16-step break: K . . . S . . K | . K . . S . . .
  const kicks = [0, 7, 9];
  const snares = [4, 12];
  const roots = [28, 24, 31, 26];
  const pads = [
    [64, 67, 71, 74],
    [60, 64, 67, 71],
    [67, 71, 74, 78],
    [62, 66, 69, 72],
  ];
  // Bars with a hard stop (silence) and the breakdown bars.
  const stops = new Set([11, 23, 39, 47, 63, 79, 95]);
  const breakdown = (b: number) => (b >= 48 && b < 62) || b >= 100;

  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    const chord = Math.floor(b / 2) % 4;
    if (stops.has(b)) {
      // One beat of tail, then nothing until the next bar.
      kick(mix, t0, 0.6);
      continue;
    }
    if (breakdown(b)) {
      for (const note of pads[chord]) sawVoice(mix, t0, bar + 0.3, midiToHz(note), { gain: 0.05, cutoff: 0.04, attack: 0.6, release: 0.6, detune: 9, voices: 2 });
      if (b % 4 === 3) sineVoice(mix, t0 + 2 * beat, 2, midiToHz(83), 0.05, 0.6, -0.4);
      continue;
    }
    const stutter = b % 8 === 7;
    for (let s = 0; s < 16; s++) {
      const t = t0 + s * step;
      if (stutter && s >= 8) {
        // Snare stutter: 32nd-note repeats, rising level.
        for (let r = 0; r < 2; r++) noiseHit(mix, rand, t + (r * step) / 2, { gain: 0.15 + 0.03 * (s - 8), decay: 0.02, length: 0.06, highpass: 0.1, lowpass: 0.6, width: 0.2 });
        continue;
      }
      if (kicks.includes(s)) kick(mix, t, 0.85);
      if (snares.includes(s)) {
        noiseHit(mix, rand, t, { gain: 0.45, decay: 0.07, length: 0.25, highpass: 0.08, lowpass: 0.7, width: 0.25 });
        sineVoice(mix, t, 0.15, 185, 0.25, 0.04);
      }
      if (s % 2 === 0) noiseHit(mix, rand, t, { gain: 0.06, decay: 0.03, length: 0.08, highpass: 0.6, width: 0.7 });
    }
    // Reese bass: two detuned saws, one note per half bar.
    for (let h = 0; h < 2; h++) {
      sawVoice(mix, t0 + h * 2 * beat, 2 * beat - 0.01, midiToHz(roots[chord] + (h ? 12 : 0)), { gain: 0.22, cutoff: 0.035, release: 0.02, detune: 18, voices: 2 });
    }
  }
  mix.master(-10, 1.3);
  return { name: 'breaks', title: 'Cut Up Weather', description: '172 BPM breakbeat in E minor with hard stops, breakdowns and stutters', ...mix };
}

export function demoTracks(seconds = 150): DemoTrack[] {
  return [ambientTrack(seconds), fourOnTheFloorTrack(seconds), breaksTrack(seconds)];
}
