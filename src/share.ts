import { CARD_HEIGHT, CARD_WIDTH, renderCard, type CardContent } from './card/renderCard';
import { SITE_URL } from './config';

/** Waits for the bundled card fonts, so the first card isn't drawn in a fallback font. */
export async function ensureCardFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load('500 48px "Space Grotesk"'),
      document.fonts.load('400 28px "Space Grotesk"'),
      document.fonts.load('400 30px "JetBrains Mono"'),
      document.fonts.load('500 15px "JetBrains Mono"'),
    ]);
  } catch {
    // Fall back to whatever is available; the card still renders.
  }
}

/** Renders the share card to a PNG. Uses a DOM canvas so it sees the page's fonts. */
export async function renderCardPng(card: CardContent): Promise<Blob> {
  await ensureCardFonts();
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  renderCard(ctx, card);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))), 'image/png'),
  );
}

/** True when this browser can open the share sheet with an image file attached. */
export function canShareFile(file: File): boolean {
  try {
    return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Opens the native share sheet. Resolves false if the user dismissed it. */
export async function shareFile(file: File, text: string): Promise<boolean> {
  try {
    // The URL goes in the text: some share targets drop the files when `url` is set.
    await navigator.share({ files: [file], text: `${text}\n${SITE_URL}` });
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return false;
    throw error;
  }
}

/** X's post composer with the text and site URL filled in. The image has to be attached by hand. */
export function xPostUrl(text: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(SITE_URL)}`;
}
