import type { TrackFeatures } from '../../audio/types';
import type { ArtParams, Ctx2D, StyleId } from '../types';
import { deriveRing } from './ring/derive';
import { renderRing } from './ring/render';

export interface ArtStyle<P extends ArtParams = ArtParams> {
  id: P['style'];
  /** Short display name. */
  name: string;
  /** Pure: features + seed → params. */
  derive(features: TrackFeatures, seedHex: string): P;
  /** Draws params into a size × size square. */
  render(ctx: Ctx2D, params: P, size: number): void;
}

/**
 * Style registry. To add a style: give it a params type with a unique
 * `style` literal, add that type to `ArtParams`, and register it here.
 */
export const STYLES: { [K in StyleId]: ArtStyle<Extract<ArtParams, { style: K }>> } = {
  ring: { id: 'ring', name: 'Ring', derive: deriveRing, render: renderRing },
};

export const DEFAULT_STYLE: StyleId = 'ring';
