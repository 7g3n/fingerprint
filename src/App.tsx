import { useCallback, useRef, useState } from 'react';
import styles from './App.module.css';
import { DecodeError } from './audio/decode';
import { formatDuration } from './format';
import { processFile, type Result, type Stage } from './pipeline';
import { strings } from './strings';
import { DropZone } from './ui/DropZone';
import { Progress } from './ui/Progress';
import { ResultView } from './ui/ResultView';

type State =
  | { kind: 'idle' }
  | { kind: 'working'; fileName: string; progress: number; stage: Stage }
  | { kind: 'done'; result: Result }
  | { kind: 'error'; message: string };

function errorMessage(error: unknown, fileName: string): string {
  if (error instanceof DecodeError) {
    switch (error.code) {
      case 'unsupported':
        return strings.error.unsupported(fileName);
      case 'too-large':
        return strings.error.tooLarge;
      case 'too-long':
        return strings.error.tooLong(formatDuration(error.duration ?? 0));
      case 'empty':
        return strings.error.empty;
      case 'decode':
        return strings.error.decode;
    }
  }
  return strings.error.analysis;
}

export function App() {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const runRef = useRef<AbortController | null>(null);

  const handleFile = useCallback(async (file: File) => {
    runRef.current?.abort();
    const controller = new AbortController();
    runRef.current = controller;
    setState({ kind: 'working', fileName: file.name, progress: 0, stage: 'reading' });
    try {
      const result = await processFile(
        file,
        (progress, stage) => {
          if (!controller.signal.aborted) setState({ kind: 'working', fileName: file.name, progress, stage });
        },
        controller.signal,
      );
      if (!controller.signal.aborted) setState({ kind: 'done', result });
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error(error);
      setState({ kind: 'error', message: errorMessage(error, file.name) });
    }
  }, []);

  return (
    <div className={styles.page}>
      <header className={`${styles.header} ${state.kind === 'done' ? styles.headerCompact : ''}`}>
        <p className={styles.wordmark}>{strings.appName}</p>
        {state.kind !== 'done' && <h1 className={styles.tagline}>{strings.tagline}</h1>}
      </header>

      <main className={styles.main}>
        {state.kind === 'idle' && <DropZone onFile={handleFile} />}

        {state.kind === 'working' && (
          <>
            <Progress fileName={state.fileName} progress={state.progress} stage={state.stage} />
            <div className={styles.cancel}>
              <DropZone onFile={handleFile} compact />
            </div>
          </>
        )}

        {state.kind === 'error' && (
          <>
            <p className={styles.error} role="alert">
              {state.message}
            </p>
            <DropZone onFile={handleFile} />
          </>
        )}

        {state.kind === 'done' && (
          <ResultView key={`${state.result.fingerprint.hex}:${state.result.fileName}`} result={state.result} onFile={handleFile} />
        )}
      </main>

      <footer className={styles.footer}>
        {/* The full drop zone already states this prominently. */}
        {(state.kind === 'working' || state.kind === 'done') && <p>{strings.privacy}</p>}
        <p>{strings.noAi}</p>
      </footer>
    </div>
  );
}
