/** Public URL of the site, used on the share card and in share text. */
export const SITE_URL = 'https://ring.7g3.net';

/** SITE_URL without the protocol, as printed on the card. */
export const SITE_URL_DISPLAY = SITE_URL.replace(/^https?:\/\//, '');

/**
 * Every file is decoded at this rate (the browser resamples if needed), so a
 * track gives the same analysis on a 44.1 kHz laptop and a 48 kHz phone.
 */
export const ANALYSIS_SAMPLE_RATE = 44100;

/** Longer tracks take too much memory and time to analyse on a phone. */
export const MAX_DURATION_SECONDS = 15 * 60;

/** Rejected before reading: even a 15 min 24-bit/96 kHz WAV is ~520 MB. */
export const MAX_FILE_BYTES = 600 * 1024 * 1024;

export const ACCEPTED_EXTENSIONS = ['wav', 'mp3', 'flac', 'ogg', 'oga', 'm4a'] as const;

export const ACCEPTED_MIME_TYPES = [
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mpeg',
  'audio/mp3',
  'audio/flac',
  'audio/x-flac',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
] as const;

/** Exported art is square, this many pixels per side. */
export const ART_EXPORT_SIZE = 3000;
