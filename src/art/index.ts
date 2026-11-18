import type { TrackFeatures } from '../audio/types';
import { DEFAULT_STYLE, STYLES } from './styles';
import type { ArtParams, Ctx2D, StyleId } from './types';

export type { ArtParams, Ctx2D, StyleId } from './types';
export { STYLES } from './styles';

/**
 * Features + seed → art parameters. Pure: the same inputs always give the
 * same params. `seedHex` is the SHA-256 of the file bytes.
 */
export function deriveArtParams(features: TrackFeatures, seedHex: string, style: StyleId = DEFAULT_STYLE): ArtParams {
  return STYLES[style].derive(features, seedHex);
}

/** Draws params into a size × size square at the context's origin. */
export function renderArt(ctx: Ctx2D, params: ArtParams, size: number): void {
  STYLES[params.style].render(ctx, params, size);
}
