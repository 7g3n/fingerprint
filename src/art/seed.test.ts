import { describe, expect, it } from 'vitest';
import { createRng, fnv1a } from './prng';
import { fingerprintBytes } from './seed';

describe('fingerprintBytes', () => {
  it('is the SHA-256 of the bytes, with the first 8 hex digits as the ID', async () => {
    const f = await fingerprintBytes(new TextEncoder().encode('abc'));
    expect(f.hex).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(f.id).toBe('BA7816BF');
  });
});

describe('createRng', () => {
  const seed = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

  it('repeats exactly for the same seed and stream', () => {
    const a = createRng(seed, 'x');
    const b = createRng(seed, 'x');
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  it('gives independent sequences per stream and per seed', () => {
    const a = Array.from({ length: 8 }, createRng(seed, 'x').next);
    const b = Array.from({ length: 8 }, createRng(seed, 'y').next);
    const c = Array.from({ length: 8 }, createRng(seed.replace(/^b/, 'c'), 'x').next);
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('stays in range and is roughly uniform', () => {
    const rng = createRng(seed, 'uniform');
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 20000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      buckets[Math.floor(v * 10)]++;
    }
    for (const n of buckets) expect(Math.abs(n - 2000)).toBeLessThan(200);
    for (let i = 0; i < 1000; i++) {
      const k = rng.int(3, 7);
      expect(k).toBeGreaterThanOrEqual(3);
      expect(k).toBeLessThanOrEqual(7);
    }
  });

  it('rejects a seed that is too short', () => {
    expect(() => createRng('abc', 'x')).toThrow();
  });

  it('hashes stream names with FNV-1a', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
  });
});
