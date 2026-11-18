import type { AnalysisStage } from './analyzeTrack';
import type { TrackFeatures } from './types';

export interface AnalyzeRequest {
  type: 'analyze';
  id: number;
  channels: Float32Array[];
  sampleRate: number;
}

export type AnalyzeResponse =
  | { type: 'progress'; id: number; progress: number; stage: AnalysisStage }
  | { type: 'done'; id: number; features: TrackFeatures }
  | { type: 'error'; id: number; message: string };
