import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ART_EXPORT_SIZE, SITE_URL_DISPLAY } from '../config';
import { guessTitleAndArtist, safeFileName } from '../format';
import { downloadBlob, renderArtPng, type Result } from '../pipeline';
import { canShareFile, renderCardPng, shareFile, xPostUrl } from '../share';
import { strings } from '../strings';
import { ArtCanvas } from './ArtCanvas';
import { DropZone } from './DropZone';
import { Readout } from './Readout';
import styles from './ResultView.module.css';

interface CardImage {
  file: File;
  url: string;
}

/** Art and card previews, title/artist fields, and export / share actions. */
export function ResultView({ result, onFile }: { result: Result; onFile: (file: File) => void }) {
  const initial = useMemo(() => guessTitleAndArtist(result.fileName), [result.fileName]);
  const [title, setTitle] = useState(initial.title);
  const [artist, setArtist] = useState(initial.artist);
  const [card, setCard] = useState<CardImage | null>(null);
  const [savingArt, setSavingArt] = useState(false);
  const cardUrlRef = useRef<string | null>(null);
  const titleId = useId();
  const artistId = useId();
  const id = result.fingerprint.id;

  // Re-render the card shortly after typing stops. It is kept ready so the
  // share button can open the share sheet straight from the tap.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const blob = await renderCardPng({
        params: result.params,
        features: result.features,
        title,
        artist,
        fingerprintId: id,
        siteUrl: SITE_URL_DISPLAY,
      });
      if (cancelled) return;
      const name = `${safeFileName(artist ? `${artist} - ${title}` : title)} - ${id} - card.png`;
      const next = { file: new File([blob], name, { type: 'image/png' }), url: URL.createObjectURL(blob) };
      if (cardUrlRef.current) URL.revokeObjectURL(cardUrlRef.current);
      cardUrlRef.current = next.url;
      setCard(next);
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [result, title, artist, id]);

  useEffect(
    () => () => {
      if (cardUrlRef.current) URL.revokeObjectURL(cardUrlRef.current);
    },
    [],
  );

  const shareText = strings.share.text(title.trim(), artist.trim());
  const shareable = card !== null && canShareFile(card.file);

  const saveArt = async () => {
    setSavingArt(true);
    try {
      const blob = await renderArtPng(result.params, ART_EXPORT_SIZE);
      downloadBlob(blob, `${safeFileName(artist ? `${artist} - ${title}` : title)} - ${id}.png`);
    } finally {
      setSavingArt(false);
    }
  };

  return (
    <section className={styles.result}>
      <figure className={styles.art}>
        <ArtCanvas params={result.params} label={`${title}, fingerprint ${id}`} />
      </figure>

      <div className={styles.info}>
        <div className={styles.fields}>
          <label className={styles.field} htmlFor={titleId}>
            <span>{strings.field.title}</span>
            <input id={titleId} value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
          <label className={styles.field} htmlFor={artistId}>
            <span>{strings.field.artist}</span>
            <input id={artistId} value={artist} onChange={(e) => setArtist(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
        </div>

        <Readout features={result.features} fingerprintId={id} />

        <figure className={styles.card}>
          {card ? (
            <img src={card.url} width={1080} height={1350} alt={`${strings.preview.card}: ${title}`} />
          ) : (
            <div className={styles.cardPlaceholder} />
          )}
          <figcaption>{strings.preview.card} · 1080 × 1350</figcaption>
        </figure>

        <div className={styles.actions}>
          {shareable && (
            <button type="button" className={styles.primary} onClick={() => card && shareFile(card.file, shareText)}>
              {strings.action.share}
            </button>
          )}
          <button type="button" className={styles.action} disabled={!card} onClick={() => card && downloadBlob(card.file, card.file.name)}>
            {strings.action.saveCard}
          </button>
          <button type="button" className={styles.action} disabled={savingArt} onClick={saveArt}>
            {savingArt ? strings.action.saving : strings.action.saveArt}
          </button>
          {!shareable && (
            <a className={styles.action} href={xPostUrl(shareText)} target="_blank" rel="noopener noreferrer">
              {strings.action.postOnX}
            </a>
          )}
        </div>
        {!shareable && <p className={styles.hint}>{strings.share.xHint}</p>}

        <div className={styles.another}>
          <DropZone onFile={onFile} compact />
        </div>
      </div>
    </section>
  );
}
