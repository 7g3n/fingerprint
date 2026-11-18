import type { TrackFeatures } from '../../../audio/types';
import { hue, oklch } from '../../color';
import type { Ramp, RingPalette } from './params';

/** Hue of 8B/8A (C major / A minor) on the Camelot wheel; each step adds 30°. */
const BASE_HUE = 292;

/**
 * Palette from the analysis only (no randomness):
 *  - key → base hue, by position on the Camelot wheel, so relative major and
 *    minor share a hue and neighbouring keys get neighbouring hues; minor keys
 *    sit darker and cooler. Unknown key → near-monochrome inks.
 *  - spectral centroid → brightness: lighter inks and a warmer tilt for
 *    bright mixes, deeper inks for dark ones.
 *  - stereo width → hue spread between the low / mid / high zones: a mono
 *    mix stays in one hue family, a wide mix fans out.
 */
export function ringPalette(features: TrackFeatures, levels: number): RingPalette {
  const brightness = quantize(centroidBrightness(features.centroid.mean), 32);
  const width = quantize(Math.min(1, features.stereo.width / 0.3), 32);
  const key = features.key;
  const minor = key?.mode === 'minor';

  const camelot = key ? parseInt(key.camelot, 10) : 0;
  const baseHue = key
    ? hue(BASE_HUE + 30 * (camelot - 8) + (brightness - 0.5) * 24 - (minor ? 12 : 0))
    : hue(250 + brightness * 90);
  const chroma = key ? 0.17 : 0.025;
  const spread = 8 + 62 * width;

  const ramp = (h: number, c: number, lightMin: number, lightMax: number): Ramp => {
    const out = ['transparent'];
    for (let level = 1; level <= levels; level++) {
      const t = level / levels;
      out.push(oklch(lightMin + (lightMax - lightMin) * Math.pow(t, 0.85), c * (0.55 + 0.45 * t), h));
    }
    return out;
  };

  const lightMax = 0.8 + 0.16 * brightness - (minor ? 0.04 : 0);
  const lightMin = 0.3 + (minor ? -0.02 : 0.02);
  const zones = [
    ramp(hue(baseHue - spread), chroma, lightMin, lightMax),
    ramp(baseHue, chroma * 1.05, lightMin, lightMax),
    ramp(hue(baseHue + spread), chroma, lightMin, lightMax),
  ] as const;

  const accentHue = hue(baseHue + (minor ? 165 : 195));
  return {
    background: oklch(0.13 + 0.025 * brightness - (minor ? 0.015 : 0), 0.012 + (key ? 0.01 : 0), baseHue),
    zones,
    glitch: ramp(accentHue, 0.24, 0.55, 0.92),
    hairline: oklch(0.9, 0.2, accentHue),
    tick: oklch(0.55 + 0.1 * brightness, chroma * 0.5, baseHue),
    core: oklch(0.32 + 0.08 * brightness, chroma * 0.8, hue(baseHue - spread)),
    particle: ramp(hue(baseHue + spread * 1.5), chroma * 1.2, 0.6, 0.97),
  };
}

/** 0 for a dark mix (centroid ≤ 700 Hz) … 1 for a bright one (≥ 4.5 kHz). */
function centroidBrightness(hz: number): number {
  if (!(hz > 0)) return 0.5;
  const t = (Math.log2(hz) - Math.log2(700)) / (Math.log2(4500) - Math.log2(700));
  return Math.min(1, Math.max(0, t));
}

/** Snaps to a grid so tiny decoder differences don't nudge colours. */
function quantize(v: number, steps: number): number {
  return Math.round(v * steps) / steps;
}
