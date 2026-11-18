/**
 * All UI copy lives here so another language can be added by swapping this
 * object. Keep it short.
 */
export const strings = {
  appName: 'sound fingerprint',
  tagline: 'Drop a track. Get a picture drawn from its sound alone.',
  noAi: 'No generative AI. The same file always draws the same picture.',
  privacy: 'Runs entirely in your browser. Your audio is never uploaded.',

  drop: {
    prompt: 'Drop a track here',
    choose: 'Choose file',
    hint: 'WAV, MP3, FLAC, OGG, M4A — up to 15 min',
    active: 'Release to analyse',
  },

  stage: {
    reading: 'Reading file',
    decoding: 'Decoding',
    spectrum: 'Spectrum',
    rhythm: 'Rhythm',
    key: 'Key',
    loudness: 'Loudness',
    drawing: 'Drawing',
  },

  label: {
    bpm: 'BPM',
    key: 'Key',
    lufs: 'LUFS-I',
    peak: 'Peak',
    width: 'Stereo width',
    range: 'Loudness range',
    length: 'Length',
    id: 'Fingerprint ID',
  },

  unknown: '—',
  noKey: 'n/a',

  field: {
    title: 'Title',
    artist: 'Artist',
  },

  preview: {
    art: 'Art',
    card: 'Card',
  },

  card: {
    untitled: 'Untitled',
    bpm: 'BPM',
    key: 'KEY',
    lufs: 'LUFS-I',
    peak: 'PEAK dBFS',
    width: 'WIDTH',
    length: 'LENGTH',
    fingerprint: 'FINGERPRINT ID',
    credit: 'drawn from sound — no generative AI',
  },

  action: {
    share: 'Share',
    saveCard: 'Save card',
    saveArt: 'Save art · 3000 px',
    saving: 'Saving…',
    postOnX: 'Post on X',
    another: 'Try another track',
  },

  /** Text that goes with a shared card or an X post. */
  share: {
    text: (title: string, artist: string) =>
      `${artist ? `${artist} — ` : ''}${title || 'Untitled'}\nDrawn from sound. No generative AI.`,
    xHint: 'Save the card first, then attach it to your post.',
  },

  error: {
    unsupported: (name: string) => `“${name}” isn’t a supported audio file. Use WAV, MP3, FLAC, OGG or M4A.`,
    tooLarge: 'That file is too large. Try a compressed version (MP3, M4A) or a shorter track.',
    decode: 'Your browser couldn’t decode this file. It may be damaged or use an unsupported codec — try a WAV or MP3 export.',
    tooLong: (length: string) => `Tracks up to 15 minutes are supported. This one is ${length}.`,
    empty: 'This file has no audio in it.',
    analysis: 'Something went wrong while analysing. Try again, or try another file.',
  },
} as const;
