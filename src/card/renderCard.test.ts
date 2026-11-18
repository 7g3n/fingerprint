import { createCanvas } from '@napi-rs/canvas';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { analyzeTrack } from '../audio/analyzeTrack';
import { ambientTrack, DEMO_SAMPLE_RATE } from '../audio/demoTracks';
import { deriveArtParams, type Ctx2D } from '../art';
import { guessTitleAndArtist, safeFileName } from '../format';
import { CARD_HEIGHT, CARD_WIDTH, renderCard, type CardContent } from './renderCard';

const track = ambientTrack(20);
const features = analyzeTrack([track.left, track.right], DEMO_SAMPLE_RATE);
const params = deriveArtParams(features, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

function draw(content: Partial<CardContent>) {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext('2d');
  const texts: string[] = [];
  const fillText = ctx.fillText.bind(ctx);
  ctx.fillText = (text: string, x: number, y: number) => {
    texts.push(text);
    fillText(text, x, y);
  };
  renderCard(ctx as unknown as Ctx2D, {
    params,
    features,
    title: 'Title',
    artist: 'Artist',
    fingerprintId: 'BA7816BF',
    siteUrl: 'example.com',
    ...content,
  });
  return { texts, hash: createHash('sha256').update(canvas.data()).digest('hex') };
}

describe('renderCard', () => {
  it('prints the title, artist, values, fingerprint ID, credit and URL', () => {
    const { texts } = draw({});
    for (const t of ['Title', 'Artist', 'BA7816BF', 'example.com', 'drawn from sound — no generative AI', 'BPM', 'LUFS-I', '0:20']) {
      expect(texts).toContain(t);
    }
  });

  it('is deterministic', () => {
    expect(draw({}).hash).toBe(draw({}).hash);
  });

  it('shortens a title that cannot fit', () => {
    const long = 'An Extremely Long Track Title That Will Never Fit On One Line Of The Card';
    const { texts } = draw({ title: long });
    const printed = texts.find((t) => t.startsWith('An Extremely'));
    expect(printed?.endsWith('…')).toBe(true);
  });

  it('falls back to "Untitled" and skips an empty artist', () => {
    const { texts } = draw({ title: '  ', artist: '' });
    expect(texts).toContain('Untitled');
    expect(texts).not.toContain('');
  });
});

describe('file-name helpers', () => {
  it('splits "Artist - Title" and keeps plain names as the title', () => {
    expect(guessTitleAndArtist('7g3 - Night Drive.wav')).toEqual({ artist: '7g3', title: 'Night Drive' });
    expect(guessTitleAndArtist('my_track_v2.mp3')).toEqual({ artist: '', title: 'my track v2' });
    expect(guessTitleAndArtist('a-b.flac')).toEqual({ artist: '', title: 'a-b' });
  });

  it('removes characters that are not allowed in file names', () => {
    expect(safeFileName('a/b:c*?"<>|d')).toBe('a b c d');
    expect(safeFileName('   ')).toBe('sound fingerprint');
  });
});
