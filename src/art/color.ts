/**
 * OKLCH → sRGB hex, with gamut mapping by chroma reduction. Implemented here
 * (rather than relying on CSS oklch()) so colours are computed identically
 * everywhere and work in any canvas implementation.
 */
export function oklch(l: number, c: number, hDeg: number): string {
  let lo = 0;
  let hi = Math.max(0, c);
  let rgb = oklchToLinear(l, hi, hDeg);
  if (!inGamut(rgb)) {
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear(l, mid, hDeg))) lo = mid;
      else hi = mid;
    }
    rgb = oklchToLinear(l, lo, hDeg);
  }
  return '#' + rgb.map((v) => toByte(v).toString(16).padStart(2, '0')).join('');
}

function oklchToLinear(l: number, c: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ * l_ * l_;
  const M = m_ * m_ * m_;
  const S = s_ * s_ * s_;
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
}

function inGamut([r, g, b]: [number, number, number]): boolean {
  const e = 1e-6;
  return r >= -e && r <= 1 + e && g >= -e && g <= 1 + e && b >= -e && b <= 1 + e;
}

function toByte(linear: number): number {
  const v = Math.min(1, Math.max(0, linear));
  const srgb = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.round(srgb * 255);
}

/** Wraps an angle into [0, 360). */
export function hue(deg: number): number {
  return ((deg % 360) + 360) % 360;
}
