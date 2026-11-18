import { analyzeInWorker } from './audio/analyzeInWorker';
import { decodeAudioFile } from './audio/decode';
import type { TrackFeatures } from './audio/types';
import { deriveArtParams, renderArt, type ArtParams } from './art';
import type { Fingerprint } from './art/seed';

export type Stage = 'reading' | 'decoding' | 'spectrum' | 'rhythm' | 'key' | 'loudness' | 'drawing';

export interface Result {
  fileName: string;
  fingerprint: Fingerprint;
  features: TrackFeatures;
  params: ArtParams;
}

/**
 * File → fingerprint → decode → analyse (worker) → art params.
 * Progress is reported 0…1 across all of it.
 */
export async function processFile(
  file: File,
  onProgress: (progress: number, stage: Stage) => void,
  signal?: AbortSignal,
): Promise<Result> {
  const decoded = await decodeAudioFile(file, (stage) => onProgress(stage === 'reading' ? 0 : 0.06, stage));
  signal?.throwIfAborted();
  onProgress(0.12, 'spectrum');
  const features = await analyzeInWorker(decoded.channels, decoded.sampleRate, {
    signal,
    onProgress: (p, stage) => onProgress(0.12 + 0.86 * p, stage),
  });
  onProgress(0.99, 'drawing');
  const params = deriveArtParams(features, decoded.fingerprint.hex);
  return { fileName: file.name, fingerprint: decoded.fingerprint, features, params };
}

/** Renders the art at `size` px and returns a PNG blob. */
export async function renderArtPng(params: ArtParams, size: number): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      renderArt(ctx, params, size);
      return canvas.convertToBlob({ type: 'image/png' });
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  renderArt(ctx, params, size);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))), 'image/png'),
  );
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
