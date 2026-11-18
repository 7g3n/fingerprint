import type { Stage } from '../pipeline';
import { strings } from '../strings';
import styles from './Progress.module.css';

export function Progress({ fileName, progress, stage }: { fileName: string; progress: number; stage: Stage }) {
  const percent = Math.min(100, Math.max(0, Math.round(progress * 100)));
  return (
    <section className={styles.progress} aria-live="polite">
      <p className={styles.file}>{fileName}</p>
      <div
        className={styles.track}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={strings.stage[stage]}
      >
        <div className={styles.fill} style={{ transform: `scaleX(${percent / 100})` }} />
      </div>
      <p className={styles.status}>
        <span>{strings.stage[stage]}</span>
        <span className={styles.percent}>{percent}%</span>
      </p>
    </section>
  );
}
