import { describe, expect, it } from 'vitest';
import { hue, oklch } from './color';

describe('oklch', () => {
  it('maps the ends of the lightness axis to black and white', () => {
    expect(oklch(0, 0, 0)).toBe('#000000');
    expect(oklch(1, 0, 0)).toBe('#ffffff');
  });

  it('matches known sRGB primaries', () => {
    // CSS Color 4 reference values for sRGB red and blue.
    expect(oklch(0.62796, 0.25768, 29.2339)).toBe('#ff0000');
    expect(oklch(0.45201, 0.31321, 264.052)).toBe('#0000ff');
  });

  it('pulls out-of-gamut colours back in by reducing chroma', () => {
    expect(oklch(0.7, 0.6, 145)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('wraps hues', () => {
    expect(hue(-30)).toBe(330);
    expect(hue(725)).toBe(5);
  });
});
