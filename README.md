# sound fingerprint

Drop a track, get a picture drawn from its sound alone.

The art comes only from measurements of the audio — spectrum, onsets, tempo,
key, loudness, stereo width — run through hand-written DSP and a deterministic
renderer. **No generative AI, no machine-learning models.** The same file
always draws the same picture.

**Your audio never leaves the browser.** Decoding, analysis and drawing all
happen on the device; the site is static files with no backend. In production
the Content-Security-Policy sets `connect-src 'none'`, so the browser itself
refuses any upload from the page.

## What you get

- **Art** — a 3000 × 3000 PNG, usable as a release cover.
- **Share card** — a 1080 × 1350 PNG with the art, title, artist, BPM, key,
  integrated loudness (LUFS-I), sample peak, stereo width, length, the
  Fingerprint ID and a "drawn from sound — no generative AI" credit.
- **Sharing** — on devices that can share files (most phones), the share sheet
  opens with the card attached. Elsewhere: download buttons plus a link that
  opens X's composer with the text and URL filled in.

Supported input: WAV, MP3, FLAC, OGG, M4A (whatever the browser can decode),
up to 15 minutes.

## How a track becomes a picture

```
file bytes ──SHA-256──▶ seed, Fingerprint ID (first 8 hex digits)
     │
     └─decode (Web Audio, fixed 44.1 kHz)─▶ analyzeTrack ─▶ TrackFeatures
                                              (Web Worker)        │
                                     deriveArtParams(features, seed) ─▶ ArtParams
                                                                   │
                                            renderArt(ctx, params, size) ─▶ canvas
```

`analyzeTrack` and `deriveArtParams` are pure functions; `renderArt` only
draws what the params say. All randomness goes through a seeded PRNG (sfc32)
keyed by the file's SHA-256 — no `Math.random`, no dates, nothing
device-dependent.

### Analysis (`src/audio/`)

| Feature | Method |
| --- | --- |
| Spectrogram | 30 fps Hann STFT of the mono mix, resampled to 128 log-spaced bins (30 Hz – 16 kHz) |
| Band energy | low < 250 Hz, mid < 4 kHz, high, per frame |
| Spectral centroid | per frame, and the mean over non-quiet frames |
| Onsets | spectral flux at 100 fps, peaks above 3 × the local median |
| BPM | autocorrelation of the onset envelope with a tempo prior around 120 BPM; `null` when there is no steady pulse |
| Key | chroma (C2–C7) + Krumhansl–Schmuckler; `null` when the correlation is weak or the runner-up too close |
| Loudness | ITU-R BS.1770-4 integrated loudness (K-weighting, absolute and relative gating), momentary and short-term series |
| Loudness range | EBU Tech 3342 (10th–95th percentile of gated short-term loudness) |
| Sample peak | dBFS |
| Stereo | whole-track L/R correlation and side / (mid + side) energy |

Integrated loudness is tested against the EBU Tech 3341 cases (1 kHz stereo
sine at −23 dBFS → −23.0 LUFS ± 0.1, plus the gating cases), and the loudness
range against EBU Tech 3342. Tempo, onsets, key, stereo width and the
spectrum are tested on synthetic signals with known answers.

### The Ring style (`src/art/styles/ring/`)

A polar spectrogram that reads like a fingerprint or tree rings.

- **Time → angle**, clockwise from 12 o'clock. **Frequency → radius**, log
  scale, lows inside. **Intensity → line thickness and brightness**, quantised
  to six levels.
- **Quiet passages are left empty** (negative space).
- **Glitches sit on the strongest onsets**, preferring the ones where a
  section gets louder: bass-led attacks cut radial **slits**, mid/high-led ones
  **shift** a block of rings sideways (drawn in the accent colour).
- **Colour**: key → base hue along the Camelot wheel (relative major/minor
  share a hue; unknown key → near-monochrome); spectral centroid → lightness
  and warmth; stereo width → how far the low/mid/high zones fan apart in hue.
- Bar ticks from the BPM, dust particles from high-frequency activity, and a
  low-poly core tracing short-term loudness.
- The seed only decides small details (how far a glitch block slides, which
  rings it spans, where the dust lands). Because the structure comes from
  quantised analysis values, a WAV and an MP3 of the same master look almost
  the same even though their Fingerprint IDs differ.

Pixel-identical output is guaranteed within one browser. Across browsers the
picture is the same but anti-aliasing (and, for lossy formats, the browser's
decoder) can differ by a pixel here and there.

### Adding a style

1. Create `src/art/styles/<name>/` with a params type whose `style` field is a
   unique string literal, a `derive(features, seedHex)` and a
   `render(ctx, params, size)`.
2. Add the params type to `ArtParams` in `src/art/types.ts`.
3. Register it in `STYLES` in `src/art/styles/index.ts`.

Draw seeded details from your own stream, `createRng(seedHex, '<name>/…')`,
so other styles' randomness is unaffected.

## Development

Requires Node 22+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest
npm run lint       # ESLint
npm run build      # type-check + production build into dist/
```

`npm run samples` synthesises three demo tracks (ambient, four-on-the-floor,
breakbeat), writes them to `samples/` as WAV, and renders their art (3000 px),
a 900 px preview and a share card with `@napi-rs/canvas`. Add `-- --quick` for
40-second versions. Dropping `samples/*.wav` into the app gives the same
values.

UI copy lives in `src/strings.ts`; the site URL printed on the card is
`SITE_URL` in `src/config.ts`.

### Layout

```
src/
  audio/      decoding, analysis (pure), Web Worker, synthetic test signals
  art/        seed + PRNG, colour, deriveArtParams / renderArt, styles/
  card/       share card renderer
  ui/         React components (CSS Modules)
  pipeline.ts file → features → params, PNG export
  share.ts    Web Share / X intent
scripts/      sample renderer (Node)
public/       static files, including _headers (CSP)
```

## Deploy (Cloudflare Workers Static Assets)

The site is static: `wrangler.toml` points Workers Static Assets at `dist/`,
with no Worker script. `public/_headers` (copied into `dist/`) sets the CSP and
other security headers.

`dist/` is not committed. The `[build]` section of `wrangler.toml` runs
`npm run build` before every `wrangler deploy` and `wrangler dev`, so
Cloudflare's Git integration works with the default deploy command
(`npx wrangler deploy`) and no separate build command. `.node-version` pins
the Node version used there.

```bash
npx wrangler login     # once
npm run deploy         # builds, then deploys
```

To check the production build locally with the same headers:

```bash
npx wrangler dev
```

## Credits

The FFT, the 30 fps spectrogram framing and the first versions of the onset,
tempo and stereo-width code were ported from
[phase-viz](https://github.com/7g3n/phase-viz) (MIT). Stereo width now covers
the whole track instead of the first second, and the RMS "loudness" was
replaced with BS.1770-4 LUFS.

Fonts: Space Grotesk and JetBrains Mono (SIL Open Font License), bundled via
Fontsource.
