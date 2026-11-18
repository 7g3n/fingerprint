/**
 * Seeded PRNG (sfc32). Every random choice in the art goes through this; the
 * app never calls Math.random.
 *
 * Each visual element draws from its own named stream, so adding a new
 * element (or a new style) never shifts the random numbers of the others.
 */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Integer in [lo, hi]. */
  int(lo: number, hi: number): number;
  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number;
  /** −1 or 1. */
  sign(): number;
}

export function createRng(seedHex: string, stream: string): Rng {
  if (!/^[0-9a-f]{32,}$/i.test(seedHex)) throw new Error('createRng: seed must be at least 32 hex digits');
  const word = (i: number) => parseInt(seedHex.slice(i * 8, i * 8 + 8), 16) >>> 0;
  const salt = fnv1a(stream);
  let a = word(0) ^ salt;
  let b = word(1) ^ Math.imul(salt, 0x9e3779b1);
  let c = word(2) ^ Math.imul(salt, 0x85ebca6b);
  let d = word(3) ^ Math.imul(salt, 0xc2b2ae35);

  const next = () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 16; i++) next();

  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    range: (lo, hi) => lo + next() * (hi - lo),
    sign: () => (next() < 0.5 ? -1 : 1),
  };
}

/** 32-bit FNV-1a of a string's UTF-16 code units. */
export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
