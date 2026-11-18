import { describe, expect, it } from 'vitest';
import { camelotCode, estimateKey } from './key';
import { chordProgression, whiteNoise } from './synth';

const SR = 44100;

function keyOf(chords: number[][]) {
  const x = chordProgression(chords, 2, 24, SR);
  return estimateKey(x, x, SR).key;
}

// MIDI note numbers: bass note plus a close triad around middle C.
const C = [48, 60, 64, 67];
const F = [53, 60, 65, 69];
const G = [55, 59, 62, 67];
const Am = [57, 60, 64, 69];
const Dm = [50, 62, 65, 69];
const E = [52, 59, 64, 68];
const shift = (chords: number[][], semitones: number) => chords.map((c) => c.map((n) => n + semitones));

describe('estimateKey', () => {
  it('finds C major in I-IV-V-I', () => {
    expect(keyOf([C, F, G, C])).toMatchObject({ tonic: 0, mode: 'major', name: 'C major', camelot: '8B' });
  });

  it('finds A minor in i-iv-V-i', () => {
    expect(keyOf([Am, Dm, E, Am])).toMatchObject({ tonic: 9, mode: 'minor', name: 'A minor', camelot: '8A' });
  });

  it('finds F# minor (transposed i-iv-V-i)', () => {
    expect(keyOf(shift([Am, Dm, E, Am], -3))).toMatchObject({ tonic: 6, mode: 'minor', name: 'F# minor' });
  });

  it('finds Eb major (transposed I-IV-V-I)', () => {
    expect(keyOf(shift([C, F, G, C], 3))).toMatchObject({ tonic: 3, mode: 'major', name: 'Eb major' });
  });

  it('declines to guess on white noise', () => {
    const x = whiteNoise(20, SR, 0.3);
    expect(estimateKey(x, x, SR).key).toBeNull();
  });

  it('declines to guess on silence', () => {
    const x = new Float32Array(SR * 10);
    const r = estimateKey(x, x, SR);
    expect(r.key).toBeNull();
    expect(Array.from(r.chroma)).toEqual(new Array(12).fill(0));
  });
});

describe('camelotCode', () => {
  it.each([
    [0, 'major', '8B'],
    [9, 'minor', '8A'],
    [7, 'major', '9B'],
    [5, 'major', '7B'],
    [6, 'minor', '11A'],
    [11, 'major', '1B'],
  ] as const)('%i %s is %s', (tonic, mode, code) => {
    expect(camelotCode(tonic, mode)).toBe(code);
  });
});
