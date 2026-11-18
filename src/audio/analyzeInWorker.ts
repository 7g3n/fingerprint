import type { AnalysisStage } from './analyzeTrack';
import type { TrackFeatures } from './types';
import type { AnalyzeRequest, AnalyzeResponse } from './workerProtocol';

let nextId = 1;

/**
 * Runs analyzeTrack in a Web Worker so the page stays responsive. The channel
 * buffers are transferred (not copied) and are unusable afterwards.
 * Aborting terminates the worker.
 */
export function analyzeInWorker(
  channels: Float32Array[],
  sampleRate: number,
  { onProgress, signal }: { onProgress?: (progress: number, stage: AnalysisStage) => void; signal?: AbortSignal } = {},
): Promise<TrackFeatures> {
  const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
  const id = nextId++;

  return new Promise<TrackFeatures>((resolve, reject) => {
    const abort = () => reject(new DOMException('Analysis cancelled', 'AbortError'));
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });

    worker.onmessage = ({ data }: MessageEvent<AnalyzeResponse>) => {
      if (data.id !== id) return;
      if (data.type === 'progress') onProgress?.(data.progress, data.stage);
      else if (data.type === 'done') resolve(data.features);
      else reject(new Error(data.message));
    };
    worker.onerror = (event) => reject(new Error(event.message || 'Analysis worker failed'));

    const request: AnalyzeRequest = { type: 'analyze', id, channels, sampleRate };
    worker.postMessage(
      request,
      channels.map((c) => c.buffer as ArrayBuffer),
    );
  }).finally(() => worker.terminate());
}
