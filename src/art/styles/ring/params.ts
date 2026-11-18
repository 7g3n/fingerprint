/** Colours for one frequency zone, index = intensity level (0 unused). */
export type Ramp = readonly string[];

export interface RingPalette {
  background: string;
  /** Low / mid / high frequency zones. */
  zones: readonly [Ramp, Ramp, Ramp];
  /** Ramp used for datamoshed (shifted) blocks. */
  glitch: Ramp;
  /** Hairlines at slits and shift edges. */
  hairline: string;
  tick: string;
  core: string;
  particle: Ramp;
}

export interface Slit {
  step: number;
  width: number;
  hairline: boolean;
}

export interface Shift {
  step: number;
  length: number;
  ringStart: number;
  ringEnd: number;
  /** Angular displacement in steps (signed). */
  offset: number;
}

export interface Particle {
  /** Angular position, 0…1 of a turn from 12 o'clock. */
  turn: number;
  /** Radius as a fraction of the canvas size. */
  radius: number;
  /** Side length in 1/1000ths of the canvas size. */
  size: number;
  level: number;
}

export interface RingParams {
  style: 'ring';
  version: 1;
  /** Angular resolution: time is split into this many steps. */
  steps: number;
  /** Radial resolution: frequency rings, low (inside) to high (outside). */
  rings: number;
  /** Intensity levels; grid cells hold 0 (empty) … levels. */
  levels: number;
  /** steps × rings, row-major by step. */
  grid: Uint8Array;
  /** Frequency zone (0 low, 1 mid, 2 high) of each ring. */
  zoneOfRing: Uint8Array;
  /** Inner and outer radius of the ring band, fractions of the canvas size. */
  inner: number;
  outer: number;
  slits: Slit[];
  shifts: Shift[];
  /** Bar ticks as fractions of a turn; `major` marks every 8th bar. */
  ticks: { turn: number; major: boolean }[];
  particles: Particle[];
  /** Radii (fractions of the canvas size) of the low-poly loudness core, clockwise from 12 o'clock. */
  core: number[];
  palette: RingPalette;
}
