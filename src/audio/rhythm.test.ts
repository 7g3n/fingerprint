import { describe, expect, it } from 'vitest';
import { ONSET_RATE, onsetEnvelope, pickOnsets } from './onset';
import { addTone, chordProgression, clickTrain, noiseSource } from './synth';
import { estimateTempo } from './tempo';

const SR = 44100;

function tempoOf(x: Float32Array) {
  return estimateTempo(onsetEnvelope(x, x, SR), ONSET_RATE);
}

/** Kick on every beat, open hat on the off-beats, clap on 2 and 4. */
function fourOnTheFloor(bpm: number, seconds: number): Float32Array {
  const out = new Float32Array(seconds * SR);
  const rand = noiseSource(42);
  const beat = 60 / bpm;
  for (let b = 0; b * beat < seconds; b++) {
    const t = b * beat;
    const k = Math.round(t * SR);
    let phase = 0;
    for (let i = 0; i < 0.25 * SR && k + i < out.length; i++) {
      const f = 45 + 110 * Math.exp(-i / (0.03 * SR));
      phase += (2 * Math.PI * f) / SR;
      out[k + i] += 0.8 * Math.sin(phase) * Math.exp(-i / (0.12 * SR));
    }
    const h = Math.round((t + beat / 2) * SR);
    for (let i = 0; i < 0.08 * SR && h + i < out.length; i++) {
      out[h + i] += 0.15 * rand() * Math.exp(-i / (0.03 * SR));
    }
    if (b % 2 === 1) {
      for (let i = 0; i < 0.12 * SR && k + i < out.length; i++) {
        out[k + i] += 0.3 * rand() * Math.exp(-i / (0.04 * SR));
      }
    }
  }
  return out;
}

describe('estimateTempo', () => {
  it.each([90, 120, 128, 140, 150])('finds %i BPM in a click train', (bpm) => {
    const result = tempoOf(clickTrain(bpm, 30, SR));
    expect(result).not.toBeNull();
    expect(Math.abs(result!.bpm - bpm)).toBeLessThan(0.5);
  });

  it('finds 128 BPM in a four-on-the-floor pattern with off-beat hats', () => {
    const result = tempoOf(fourOnTheFloor(128, 30));
    expect(result).not.toBeNull();
    expect(Math.abs(result!.bpm - 128)).toBeLessThan(0.5);
  });

  it('returns null for slow pads without a pulse', () => {
    const pad = new Float32Array(30 * SR);
    const notes = [50, 57, 62, 65, 69];
    notes.forEach((n, i) =>
      addTone(pad, SR, 440 * Math.pow(2, (n - 69) / 12), i * 0.7, 30 - i * 0.7, 0.05, { attack: 4, release: 6 }),
    );
    expect(tempoOf(pad)).toBeNull();
  });

  it('returns null for silence', () => {
    expect(tempoOf(new Float32Array(20 * SR))).toBeNull();
  });

  it('is unaffected by a sustained chord under the clicks', () => {
    const x = clickTrain(124, 30, SR);
    const chords = chordProgression([[60, 64, 67]], 30, 30, SR, 0.05);
    for (let i = 0; i < x.length; i++) x[i] += chords[i];
    expect(Math.abs(tempoOf(x)!.bpm - 124)).toBeLessThan(0.5);
  });
});

describe('pickOnsets', () => {
  it('finds each click of a 120 BPM train at the right time', () => {
    const x = clickTrain(120, 10, SR, { offset: 0.25 });
    const { times, strengths } = pickOnsets(onsetEnvelope(x, x, SR));
    expect(times.length).toBe(20);
    times.forEach((t, i) => expect(Math.abs(t - (0.25 + i * 0.5))).toBeLessThan(0.025));
    strengths.forEach((s) => expect(s).toBeGreaterThan(0.5));
  });

  it('finds nothing in silence or in a slow swell', () => {
    const silence = new Float32Array(SR * 5);
    expect(pickOnsets(onsetEnvelope(silence, silence, SR)).times.length).toBe(0);
    const tone = new Float32Array(SR * 5);
    addTone(tone, SR, 220, 0, 5, 0.2, { attack: 1.5, release: 1.5 });
    expect(pickOnsets(onsetEnvelope(tone, tone, SR)).times.length).toBeLessThanOrEqual(1);
  });
});
