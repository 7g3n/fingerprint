/**
 * Renders the three synthetic demo tracks to WAV + PNG in samples/.
 *
 *   npm run samples            # 150 s tracks, 3000 px art
 *   npm run samples -- --quick # 40 s tracks, for iterating on the style
 *
 * The WAV bytes are hashed and the 16-bit samples re-read exactly as a
 * browser would decode them, so dropping samples/*.wav into the app gives
 * the same params as printed here.
 */
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeTrack } from '../src/audio/analyzeTrack';
import { DEMO_SAMPLE_RATE, demoTracks } from '../src/audio/demoTracks';
import { deriveArtParams, renderArt, type Ctx2D } from '../src/art';
import { fingerprintBytes } from '../src/art/seed';
import { CARD_HEIGHT, CARD_WIDTH, renderCard } from '../src/card/renderCard';
import { SITE_URL_DISPLAY } from '../src/config';

// Same faces the browser bundles, so sample cards match the app.
for (const [file, family] of [
  ['@fontsource/space-grotesk/files/space-grotesk-latin-400-normal.woff2', 'Space Grotesk'],
  ['@fontsource/space-grotesk/files/space-grotesk-latin-500-normal.woff2', 'Space Grotesk'],
  ['@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2', 'JetBrains Mono'],
  ['@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2', 'JetBrains Mono'],
]) {
  GlobalFonts.registerFromPath(join(process.cwd(), 'node_modules', file), family);
}

const quick = process.argv.includes('--quick');
const seconds = quick ? 40 : 150;
const size = quick ? 1000 : 3000;
const outDir = join(process.cwd(), 'samples');
mkdirSync(outDir, { recursive: true });

function encodeWav16(left: Float32Array, right: Float32Array, sampleRate: number): Uint8Array<ArrayBuffer> {
  const frames = left.length;
  const buffer = new ArrayBuffer(44 + frames * 4);
  const view = new DataView(buffer);
  const text = (offset: number, s: string) => [...s].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + frames * 4, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, frames * 4, true);
  const toInt = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  for (let i = 0; i < frames; i++) {
    view.setInt16(44 + i * 4, toInt(left[i]), true);
    view.setInt16(46 + i * 4, toInt(right[i]), true);
  }
  return new Uint8Array(buffer);
}

/** 16-bit PCM back to float the way Web Audio does it (int / 32768). */
function decodeWav16(bytes: Uint8Array): [Float32Array, Float32Array] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frames = (bytes.byteLength - 44) / 4;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    left[i] = view.getInt16(44 + i * 4, true) / 32768;
    right[i] = view.getInt16(46 + i * 4, true) / 32768;
  }
  return [left, right];
}

function render(params: ReturnType<typeof deriveArtParams>, px: number): Buffer {
  const canvas = createCanvas(px, px);
  renderArt(canvas.getContext('2d') as unknown as Ctx2D, params, px);
  return canvas.toBuffer('image/png');
}

const fmt = (v: number | null | undefined, digits = 1, unit = '') => (v === null || v === undefined ? '—' : `${v.toFixed(digits)}${unit}`);

for (const track of demoTracks(seconds)) {
  const started = performance.now();
  const wav = encodeWav16(track.left, track.right, DEMO_SAMPLE_RATE);
  writeFileSync(join(outDir, `${track.name}.wav`), wav);
  const fingerprint = await fingerprintBytes(wav);
  const channels = decodeWav16(wav);

  const t0 = performance.now();
  const features = analyzeTrack(channels, DEMO_SAMPLE_RATE);
  const analysisMs = performance.now() - t0;
  const params = deriveArtParams(features, fingerprint.hex);
  const again = deriveArtParams(analyzeTrack(channels, DEMO_SAMPLE_RATE), fingerprint.hex);

  const png = render(params, size);
  const same = render(again, size);
  writeFileSync(join(outDir, `${track.name}.png`), png);
  writeFileSync(join(outDir, `${track.name}-preview.png`), render(params, 900));
  const cardCanvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  renderCard(cardCanvas.getContext('2d') as unknown as Ctx2D, {
    params,
    features,
    title: track.title,
    artist: 'Demo',
    fingerprintId: fingerprint.id,
    siteUrl: SITE_URL_DISPLAY,
  });
  writeFileSync(join(outDir, `${track.name}-card.png`), cardCanvas.toBuffer('image/png'));

  const paramsHash = createHash('sha256').update(JSON.stringify(params, (_, v) => (v instanceof Uint8Array ? Array.from(v) : v))).digest('hex');
  console.log(
    [
      `${track.name} (${track.description})`,
      `  fingerprint ${fingerprint.id}  duration ${features.duration.toFixed(1)} s  analysis ${analysisMs.toFixed(0)} ms  total ${(performance.now() - started).toFixed(0)} ms`,
      `  BPM ${fmt(features.tempo?.bpm)}  key ${features.key?.name ?? '—'} (${features.key?.camelot ?? '—'}, r=${fmt(features.key?.correlation, 2)})`,
      `  LUFS-I ${fmt(features.loudness.integrated, 1)}  LRA ${fmt(features.loudness.range, 1, ' LU')}  peak ${fmt(features.peak, 1, ' dBFS')}`,
      `  width ${(features.stereo.width * 100).toFixed(0)}%  corr ${features.stereo.correlation.toFixed(2)}  centroid ${features.centroid.mean.toFixed(0)} Hz  onsets ${features.onsets.times.length} (${features.onsets.density.toFixed(2)}/s)`,
      `  art: ${params.steps} steps, ${params.slits.length} slits, ${params.shifts.length} shifts, ${params.ticks.length} ticks, ${params.particles.length} particles`,
      `  params sha256 ${paramsHash.slice(0, 16)}…  re-run identical: params ${JSON.stringify(params, (_, v) => (v instanceof Uint8Array ? Array.from(v) : v)) === JSON.stringify(again, (_, v) => (v instanceof Uint8Array ? Array.from(v) : v))}, png ${png.equals(same)}`,
    ].join('\n'),
  );
}
console.log(`\nwrote ${outDir}`);
