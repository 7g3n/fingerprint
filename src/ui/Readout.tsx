import type { TrackFeatures } from '../audio/types';
import { readout } from '../format';
import { strings } from '../strings';
import styles from './Readout.module.css';

export function Readout({ features, fingerprintId }: { features: TrackFeatures; fingerprintId: string }) {
  const r = readout(features);
  const rows: [string, string, string?][] = [
    [strings.label.bpm, r.bpm],
    [strings.label.key, r.key, r.camelot],
    [strings.label.lufs, r.lufs],
    [strings.label.peak, r.peak],
    [strings.label.width, r.width],
    [strings.label.range, r.range],
    [strings.label.length, r.length],
    [strings.label.id, fingerprintId],
  ];
  return (
    <dl className={styles.list}>
      {rows.map(([label, value, note]) => (
        <div key={label} className={styles.row}>
          <dt>{label}</dt>
          <dd>
            {value}
            {note ? <span className={styles.note}>{note}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
