import { useEffect, useId, useRef, useState } from 'react';
import { ACCEPTED_EXTENSIONS } from '../config';
import { strings } from '../strings';
import styles from './DropZone.module.css';

const accept = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(',') + ',audio/*';

/**
 * File picker plus a page-wide drop target: a file dropped anywhere on the
 * page is taken, so there is no small box to aim for.
 */
export function DropZone({ onFile, compact = false }: { onFile: (file: File) => void; compact?: boolean }) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const onFileRef = useRef(onFile);
  useEffect(() => {
    onFileRef.current = onFile;
  }, [onFile]);

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) onFileRef.current(file);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);

  return (
    <div className={`${styles.zone} ${compact ? styles.compact : ''} ${dragging ? styles.dragging : ''}`}>
      {!compact && <p className={styles.prompt}>{dragging ? strings.drop.active : strings.drop.prompt}</p>}
      <label htmlFor={inputId} className={styles.choose}>
        {compact ? strings.action.another : strings.drop.choose}
      </label>
      <input
        id={inputId}
        className={styles.input}
        type="file"
        accept={accept}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) onFile(file);
          e.currentTarget.value = '';
        }}
      />
      {!compact && <p className={styles.hint}>{strings.drop.hint}</p>}
      {!compact && <p className={styles.privacy}>{strings.privacy}</p>}
      {dragging && <div className={styles.overlay} aria-hidden="true" />}
    </div>
  );
}
