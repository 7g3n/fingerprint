import type { RingParams } from './styles/ring/params';

/** Any 2D context the renderers can draw into (on-screen, offscreen, or node-canvas in scripts). */
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Union of every style's params. Add new styles here. */
export type ArtParams = RingParams;

export type StyleId = ArtParams['style'];
