import { renderArt, type ArtParams, type Ctx2D } from '../art';
import type { TrackFeatures } from '../audio/types';
import { readout } from '../format';
import { strings } from '../strings';

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

/** Latin glyphs come from the bundled fonts; CJK and others fall back to the system. */
export const CARD_SANS =
  '"Space Grotesk", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", Meiryo, system-ui, sans-serif';
export const CARD_MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export interface CardContent {
  params: ArtParams;
  features: TrackFeatures;
  title: string;
  artist: string;
  fingerprintId: string;
  /** Shown without the protocol. */
  siteUrl: string;
}

const MARGIN = 64;
const TEXT = '#eeedf3';
const MUTED = '#8f8d9a';
const RULE = '#34333c';

/**
 * Share card, 1080 × 1350 (4:5): the art on top, then title, artist, the
 * analysis values and the fingerprint ID. Flat colours, no effects.
 */
export function renderCard(ctx: Ctx2D, card: CardContent): void {
  const { params } = card;
  const width = CARD_WIDTH - 2 * MARGIN;

  ctx.save();
  ctx.fillStyle = params.palette.background;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Art: same background colour, so it sits on the card without a frame.
  const artSize = 1000;
  ctx.save();
  ctx.translate((CARD_WIDTH - artSize) / 2, 16);
  ctx.beginPath();
  ctx.rect(0, 0, artSize, artSize);
  ctx.clip();
  renderArt(ctx, params, artSize);
  ctx.restore();

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  const hasArtist = card.artist.trim().length > 0;
  ctx.fillStyle = TEXT;
  fitText(ctx, card.title.trim() || strings.card.untitled, MARGIN, hasArtist ? 1086 : 1104, width, (s) => `500 ${s}px ${CARD_SANS}`, 50, 30);
  if (hasArtist) {
    ctx.fillStyle = MUTED;
    fitText(ctx, card.artist.trim(), MARGIN, 1128, width, (s) => `400 ${s}px ${CARD_SANS}`, 30, 22);
  }

  // Values: six columns, widths weighted by how long their values get ("F# minor" vs "128").
  const r = readout(card.features);
  const columns: [string, string, number][] = [
    [strings.card.bpm, r.bpm, 0.8],
    [strings.card.key, r.key, 1.45],
    [strings.card.lufs, r.lufs, 1],
    [strings.card.peak, r.peakValue, 1.05],
    [strings.card.width, r.width, 0.85],
    [strings.card.length, r.length, 0.85],
  ];
  const unit = width / columns.reduce((sum, [, , w]) => sum + w, 0);
  let x = MARGIN;
  for (const [label, value, weight] of columns) {
    const column = unit * weight;
    ctx.fillStyle = MUTED;
    fitText(ctx, label, x, 1186, column - 20, (s) => `500 ${s}px ${CARD_MONO}`, 15, 11);
    ctx.fillStyle = TEXT;
    fitText(ctx, value, x, 1226, column - 20, (s) => `400 ${s}px ${CARD_MONO}`, 30, 18);
    x += column;
  }

  ctx.fillStyle = RULE;
  ctx.fillRect(MARGIN, 1252, width, 1);

  ctx.font = `500 15px ${CARD_MONO}`;
  ctx.fillStyle = MUTED;
  const idLabel = `${strings.card.fingerprint}  `;
  ctx.fillText(idLabel, MARGIN, 1290);
  ctx.fillStyle = params.palette.hairline;
  ctx.fillText(card.fingerprintId, MARGIN + ctx.measureText(idLabel).width, 1290);

  ctx.fillStyle = MUTED;
  ctx.textAlign = 'right';
  ctx.fillText(card.siteUrl, CARD_WIDTH - MARGIN, 1290);
  ctx.textAlign = 'left';
  ctx.font = `400 17px ${CARD_SANS}`;
  ctx.fillText(strings.card.credit, MARGIN, 1322);

  ctx.restore();
}

/** Draws text at the largest size that fits, down to `minSize`; below that, ellipsises. */
function fitText(
  ctx: Ctx2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: (size: number) => string,
  size: number,
  minSize: number,
): void {
  let s = size;
  ctx.font = font(s);
  while (s > minSize && ctx.measureText(text).width > maxWidth) {
    s -= 1;
    ctx.font = font(s);
  }
  let out = text;
  if (ctx.measureText(out).width > maxWidth) {
    const chars = Array.from(text);
    while (chars.length > 1 && ctx.measureText(chars.join('') + '…').width > maxWidth) chars.pop();
    out = chars.join('') + '…';
  }
  ctx.fillText(out, x, y);
}
