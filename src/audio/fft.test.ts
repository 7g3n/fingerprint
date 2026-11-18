import { describe, expect, it } from 'vitest';
import { RealFFT } from './fft';
import { noiseSource } from './synth';

function naivePower(x: Float64Array): Float64Array {
  const n = x.length;
  const out = new Float64Array(n / 2 + 1);
  for (let k = 0; k <= n / 2; k++) {
    let re = 0;
    let im = 0;
    for (let t = 0; t < n; t++) {
      re += x[t] * Math.cos((2 * Math.PI * k * t) / n);
      im -= x[t] * Math.sin((2 * Math.PI * k * t) / n);
    }
    out[k] = re * re + im * im;
  }
  return out;
}

describe('RealFFT', () => {
  it.each([4, 8, 64, 512])('matches a naive DFT for size %i', (size) => {
    const rand = noiseSource(size);
    const x = Float64Array.from({ length: size }, () => rand());
    const out = new Float64Array(size / 2 + 1);
    new RealFFT(size).power(x, out);
    const expected = naivePower(x);
    for (let k = 0; k <= size / 2; k++) expect(out[k]).toBeCloseTo(expected[k], 8);
  });

  it('puts a sine in its bin', () => {
    const size = 2048;
    const bin = 64;
    const x = Float64Array.from({ length: size }, (_, i) => Math.sin((2 * Math.PI * bin * i) / size));
    const out = new Float64Array(size / 2 + 1);
    new RealFFT(size).power(x, out);
    expect(out.indexOf(Math.max(...out))).toBe(bin);
    expect(Math.sqrt(out[bin])).toBeCloseTo(size / 2, 6);
  });

  it('rejects sizes that are not powers of two', () => {
    expect(() => new RealFFT(1000)).toThrow(RangeError);
  });
});
