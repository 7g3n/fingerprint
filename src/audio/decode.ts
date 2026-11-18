import { fingerprintBytes, type Fingerprint } from '../art/seed';
import {
  ACCEPTED_EXTENSIONS,
  ACCEPTED_MIME_TYPES,
  ANALYSIS_SAMPLE_RATE,
  MAX_DURATION_SECONDS,
  MAX_FILE_BYTES,
} from '../config';

export type DecodeErrorCode = 'unsupported' | 'too-large' | 'decode' | 'too-long' | 'empty';

export class DecodeError extends Error {
  readonly code: DecodeErrorCode;
  /** Track length in seconds, for 'too-long'. */
  readonly duration?: number;
  constructor(code: DecodeErrorCode, message: string, duration?: number) {
    super(message);
    this.name = 'DecodeError';
    this.code = code;
    this.duration = duration;
  }
}

export interface DecodedTrack {
  fingerprint: Fingerprint;
  /** One or two planar channels, copied so they can be transferred to a worker. */
  channels: Float32Array[];
  sampleRate: number;
  duration: number;
}

export function isAcceptedFile(file: File): boolean {
  const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext) return (ACCEPTED_EXTENSIONS as readonly string[]).includes(ext);
  return (ACCEPTED_MIME_TYPES as readonly string[]).includes(file.type);
}

/**
 * Reads, fingerprints and decodes a file, entirely in the browser.
 *
 * The SHA-256 is taken over the original bytes before decoding. Decoding goes
 * through an OfflineAudioContext pinned to ANALYSIS_SAMPLE_RATE, so every
 * device analyses the same sample rate.
 */
export async function decodeAudioFile(
  file: File,
  onStage?: (stage: 'reading' | 'decoding') => void,
): Promise<DecodedTrack> {
  if (!isAcceptedFile(file)) throw new DecodeError('unsupported', `Unsupported file: ${file.name}`);
  if (file.size > MAX_FILE_BYTES) throw new DecodeError('too-large', `File too large: ${file.size} bytes`);
  if (file.size === 0) throw new DecodeError('empty', 'Empty file');

  onStage?.('reading');
  const bytes = await file.arrayBuffer();
  const fingerprint = await fingerprintBytes(bytes);

  onStage?.('decoding');
  let buffer: AudioBuffer;
  try {
    const context = new OfflineAudioContext(2, 1, ANALYSIS_SAMPLE_RATE);
    // decodeAudioData detaches `bytes`; the hash above is already done.
    buffer = await context.decodeAudioData(bytes);
  } catch (error) {
    throw new DecodeError('decode', `Could not decode ${file.name}: ${String(error)}`);
  }

  if (buffer.length === 0 || buffer.duration === 0) throw new DecodeError('empty', 'No audio');
  if (buffer.duration > MAX_DURATION_SECONDS) {
    throw new DecodeError('too-long', `Track is ${buffer.duration.toFixed(0)} s`, buffer.duration);
  }

  const channels: Float32Array[] = [];
  for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) {
    const copy = new Float32Array(buffer.length);
    buffer.copyFromChannel(copy, c);
    channels.push(copy);
  }
  return { fingerprint, channels, sampleRate: buffer.sampleRate, duration: buffer.duration };
}
