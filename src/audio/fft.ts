/**
 * Radix-2 FFT for real input.
 *
 * Ported from phase-viz (src/audio/fft.ts, MIT License,
 * https://github.com/7g3n/phase-viz). Changes from the original:
 *  - twiddle factors come from a precomputed table instead of a running
 *    complex product, so rounding error does not build up across a stage;
 *  - real input is packed into a half-size complex transform (about 2x faster);
 *  - all arithmetic is Float64 and the transform object is reusable.
 */
export class RealFFT {
  readonly size: number;
  private readonly half: number;
  private readonly bitrev: Uint32Array;
  private readonly twRe: Float64Array;
  private readonly twIm: Float64Array;
  private readonly splitRe: Float64Array;
  private readonly splitIm: Float64Array;
  private readonly re: Float64Array;
  private readonly im: Float64Array;

  constructor(size: number) {
    if (!Number.isInteger(size) || size < 4 || (size & (size - 1)) !== 0) {
      throw new RangeError(`FFT size must be a power of two >= 4, got ${size}`);
    }
    this.size = size;
    const half = size >> 1;
    this.half = half;
    this.bitrev = bitReversalTable(half);

    this.twRe = new Float64Array(half >> 1);
    this.twIm = new Float64Array(half >> 1);
    for (let j = 0; j < half >> 1; j++) {
      const angle = (-2 * Math.PI * j) / half;
      this.twRe[j] = Math.cos(angle);
      this.twIm[j] = Math.sin(angle);
    }

    this.splitRe = new Float64Array(half + 1);
    this.splitIm = new Float64Array(half + 1);
    for (let k = 0; k <= half; k++) {
      const angle = (-2 * Math.PI * k) / size;
      this.splitRe[k] = Math.cos(angle);
      this.splitIm[k] = Math.sin(angle);
    }

    this.re = new Float64Array(half);
    this.im = new Float64Array(half);
  }

  /**
   * Transforms `input` (length `size`) and writes the power |X[k]|^2 of the
   * one-sided spectrum, k = 0..size/2, into `out` (length size/2 + 1).
   */
  power(input: ArrayLike<number>, out: Float64Array): void {
    const { half, re, im, splitRe, splitIm } = this;
    for (let n = 0; n < half; n++) {
      re[n] = input[2 * n];
      im[n] = input[2 * n + 1];
    }
    this.complexInPlace();

    for (let k = 0; k <= half; k++) {
      const k1 = k === half ? 0 : k;
      const k2 = k === 0 ? 0 : half - k;
      const zr = re[k1];
      const zi = im[k1];
      const mr = re[k2];
      const mi = im[k2];
      // Even/odd halves of the original real sequence.
      const er = (zr + mr) * 0.5;
      const ei = (zi - mi) * 0.5;
      const or = (zi + mi) * 0.5;
      const oi = (mr - zr) * 0.5;
      const wr = splitRe[k];
      const wi = splitIm[k];
      const xr = er + wr * or - wi * oi;
      const xi = ei + wr * oi + wi * or;
      out[k] = xr * xr + xi * xi;
    }
  }

  private complexInPlace(): void {
    const { half: n, re, im, bitrev, twRe, twIm } = this;

    for (let i = 0; i < n; i++) {
      const j = bitrev[i];
      if (i < j) {
        const tr = re[i];
        re[i] = re[j];
        re[j] = tr;
        const ti = im[i];
        im[i] = im[j];
        im[j] = ti;
      }
    }

    for (let len = 2; len <= n; len <<= 1) {
      const halfLen = len >> 1;
      const step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < halfLen; k++) {
          const wr = twRe[k * step];
          const wi = twIm[k * step];
          const a = i + k;
          const b = a + halfLen;
          const vr = re[b] * wr - im[b] * wi;
          const vi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - vr;
          im[b] = im[a] - vi;
          re[a] += vr;
          im[a] += vi;
        }
      }
    }
  }
}

function bitReversalTable(size: number): Uint32Array {
  const table = new Uint32Array(size);
  let j = 0;
  for (let i = 0; i < size; i++) {
    table[i] = j;
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
  }
  return table;
}

/** Periodic Hann window, the usual choice for STFT analysis. */
export function hannWindow(size: number): Float64Array {
  const w = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
  }
  return w;
}

/** Smallest power of two >= n. */
export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}
