import type { TrackFeatures } from './audio/types';
import { strings } from './strings';

const dash = strings.unknown;

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Display values for a track, shared by the on-screen readout and the share card. */
export function readout(features: TrackFeatures) {
  const signed = (v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)).replace('-', '−');
  return {
    bpm: features.tempo ? String(Math.round(features.tempo.bpm)) : dash,
    key: features.key ? features.key.name : strings.noKey,
    camelot: features.key?.camelot ?? '',
    lufs: features.loudness.integrated === null ? dash : signed(features.loudness.integrated),
    peak: features.peak === null ? dash : `${signed(features.peak)} dBFS`,
    peakValue: features.peak === null ? dash : signed(features.peak),
    width: `${Math.round(features.stereo.width * 100)}%`,
    range: features.loudness.range === null ? dash : `${features.loudness.range.toFixed(1)} LU`,
    length: formatDuration(features.duration),
  };
}

/** File name without its extension. */
export function titleFromFileName(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '').replace(/_+/g, ' ').trim() || name;
}

/**
 * Initial title and artist from the file name. "Artist - Title.wav" is split
 * at the first " - "; anything else becomes the title with no artist.
 */
export function guessTitleAndArtist(fileName: string): { title: string; artist: string } {
  const base = titleFromFileName(fileName);
  const match = base.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (match && match[1].trim() && match[2].trim()) return { artist: match[1].trim(), title: match[2].trim() };
  return { title: base, artist: '' };
}

/** Safe for a download file name on every OS. */
export function safeFileName(text: string): string {
  const cleaned = Array.from(text, (ch) => (ch.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(ch) ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(cleaned).slice(0, 80).join('') || 'sound fingerprint';
}
