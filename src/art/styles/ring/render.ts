import type { Ctx2D } from '../../types';
import type { RingParams } from './params';

/**
 * Draws the Ring style: a polar spectrogram where time runs clockwise from
 * 12 o'clock and frequency runs outwards (log scale).
 *
 * Only flat fills and hard-edged strokes: no blur, no glow, no gradients,
 * no alpha blending. Cells of equal colour are batched into one path each.
 */
export function renderRing(ctx: Ctx2D, p: RingParams, size: number): void {
  const u = size / 1000;
  const cx = size / 2;
  const cy = size / 2;
  const { steps, rings, levels } = p;

  ctx.save();
  ctx.fillStyle = p.palette.background;
  ctx.fillRect(0, 0, size, size);

  const { display, moshed } = applyGlitches(p);

  // Unit vectors at each step boundary; time starts at 12 o'clock, clockwise.
  const cos = new Float64Array(steps + 1);
  const sin = new Float64Array(steps + 1);
  for (let a = 0; a <= steps; a++) {
    const angle = -Math.PI / 2 + (2 * Math.PI * a) / steps;
    cos[a] = Math.cos(angle);
    sin[a] = Math.sin(angle);
  }

  const r0 = p.inner * size;
  const r1 = p.outer * size;
  const pitch = (r1 - r0) / rings;
  const halfThickness = (level: number) => pitch * (0.07 + 0.36 * (level / levels));

  // One path per (ramp, level). Runs of equal cells along a ring become one polygon.
  const drawLayer = (colour: string, level: number, wantMoshed: boolean, zone: number) => {
    ctx.beginPath();
    let any = false;
    for (let b = 0; b < rings; b++) {
      if (!wantMoshed && p.zoneOfRing[b] !== zone) continue;
      const rc = r0 + (b + 0.5) * pitch;
      const h = halfThickness(level);
      const rin = rc - h;
      const rout = rc + h;
      let a = 0;
      while (a < steps) {
        const idx = a * rings + b;
        if (display[idx] !== level || moshed[idx] !== (wantMoshed ? 1 : 0)) {
          a++;
          continue;
        }
        const start = a;
        while (a < steps && display[a * rings + b] === level && moshed[a * rings + b] === (wantMoshed ? 1 : 0)) a++;
        ctx.moveTo(cx + rout * cos[start], cy + rout * sin[start]);
        for (let k = start + 1; k <= a; k++) ctx.lineTo(cx + rout * cos[k], cy + rout * sin[k]);
        for (let k = a; k >= start; k--) ctx.lineTo(cx + rin * cos[k], cy + rin * sin[k]);
        ctx.closePath();
        any = true;
      }
    }
    if (any) {
      ctx.fillStyle = colour;
      ctx.fill();
    }
  };

  for (let zone = 0; zone < 3; zone++) {
    for (let level = 1; level <= levels; level++) drawLayer(p.palette.zones[zone][level], level, false, zone);
  }
  for (let level = 1; level <= levels; level++) drawLayer(p.palette.glitch[level], level, true, -1);

  // Hairlines: slit centres and the leading edge of each shifted block.
  const hairline = Math.max(1, 0.9 * u);
  ctx.strokeStyle = p.palette.hairline;
  ctx.lineWidth = hairline;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  for (const s of p.slits) {
    if (!s.hairline) continue;
    const angle = -Math.PI / 2 + (2 * Math.PI * (s.step + s.width / 2)) / steps;
    radial(ctx, cx, cy, angle, r0 - 10 * u, r1 + 8 * u);
  }
  for (const s of p.shifts) {
    const edge = s.offset > 0 ? s.step + s.length + s.offset : s.step + s.offset;
    const angle = -Math.PI / 2 + (2 * Math.PI * edge) / steps;
    radial(ctx, cx, cy, angle, r0 + s.ringStart * pitch, r0 + s.ringEnd * pitch);
  }
  ctx.stroke();

  // Bar ticks.
  if (p.ticks.length > 0) {
    ctx.strokeStyle = p.palette.tick;
    ctx.lineWidth = Math.max(1, 1.1 * u);
    ctx.beginPath();
    const t0 = r1 + 14 * u;
    for (const t of p.ticks) {
      const angle = -Math.PI / 2 + 2 * Math.PI * t.turn;
      radial(ctx, cx, cy, angle, t0, t0 + (t.major ? 16 : 6) * u);
    }
    ctx.stroke();
  }

  // Dust: pixel-snapped squares, one path per brightness level.
  for (let level = 1; level <= levels; level++) {
    ctx.beginPath();
    let any = false;
    for (const d of p.particles) {
      if (d.level !== level) continue;
      const angle = -Math.PI / 2 + 2 * Math.PI * d.turn;
      const side = Math.max(1, Math.round(d.size * u));
      const x = Math.round(cx + d.radius * size * Math.cos(angle) - side / 2);
      const y = Math.round(cy + d.radius * size * Math.sin(angle) - side / 2);
      ctx.rect(x, y, side, side);
      any = true;
    }
    if (any) {
      ctx.fillStyle = p.palette.particle[level];
      ctx.fill();
    }
  }

  // Low-poly loudness core.
  if (p.core.length >= 3) {
    ctx.beginPath();
    p.core.forEach((r, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / p.core.length;
      const x = cx + r * size * Math.cos(angle);
      const y = cy + r * size * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = p.palette.core;
    ctx.fill();
  }

  ctx.restore();
}

function radial(ctx: Ctx2D, cx: number, cy: number, angle: number, from: number, to: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  ctx.moveTo(cx + from * c, cy + from * s);
  ctx.lineTo(cx + to * c, cy + to * s);
}

/**
 * Applies slits (cut every ring for a few steps) and shifts (slide a block
 * of rings sideways, leaving a gap behind) to a copy of the grid. `moshed`
 * marks the cells that were moved, which are drawn in the glitch colour.
 */
export function applyGlitches(p: RingParams): { display: Uint8Array; moshed: Uint8Array } {
  const { steps, rings } = p;
  const display = p.grid.slice();
  const moshed = new Uint8Array(display.length);
  const wrap = (a: number) => ((a % steps) + steps) % steps;

  for (const s of p.shifts) {
    const block: number[] = [];
    for (let k = 0; k < s.length; k++) {
      for (let b = s.ringStart; b < s.ringEnd; b++) block.push(display[wrap(s.step + k) * rings + b]);
    }
    for (let k = 0; k < s.length; k++) {
      for (let b = s.ringStart; b < s.ringEnd; b++) display[wrap(s.step + k) * rings + b] = 0;
    }
    let i = 0;
    for (let k = 0; k < s.length; k++) {
      for (let b = s.ringStart; b < s.ringEnd; b++) {
        const idx = wrap(s.step + k + s.offset) * rings + b;
        const v = block[i++];
        if (v > 0) {
          display[idx] = v;
          moshed[idx] = 1;
        }
      }
    }
  }

  for (const s of p.slits) {
    for (let k = 0; k < s.width; k++) {
      const row = wrap(s.step + k) * rings;
      display.fill(0, row, row + rings);
      moshed.fill(0, row, row + rings);
    }
  }
  return { display, moshed };
}
