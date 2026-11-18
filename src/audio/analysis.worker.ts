import { analyzeTrack } from './analyzeTrack';
import { featureTransferables } from './types';
import type { AnalyzeRequest, AnalyzeResponse } from './workerProtocol';

// Typed locally so this file doesn't need the WebWorker lib (which clashes with DOM).
interface WorkerScope {
  onmessage: ((event: MessageEvent<AnalyzeRequest>) => void) | null;
  postMessage(message: AnalyzeResponse, transfer?: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;

scope.onmessage = ({ data }) => {
  if (data.type !== 'analyze') return;
  const { id, channels, sampleRate } = data;
  try {
    let lastPercent = -1;
    const features = analyzeTrack(channels, sampleRate, {
      onProgress: (progress, stage) => {
        const percent = Math.floor(progress * 100);
        if (percent === lastPercent) return;
        lastPercent = percent;
        scope.postMessage({ type: 'progress', id, progress, stage });
      },
    });
    scope.postMessage({ type: 'done', id, features }, featureTransferables(features));
  } catch (error) {
    scope.postMessage({ type: 'error', id, message: error instanceof Error ? error.message : String(error) });
  }
};
