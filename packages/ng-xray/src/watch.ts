import path from 'node:path';
import { existsSync } from 'node:fs';
import type { Diagnostic, ScanOptions } from './types.js';
import { scan } from './scan.js';
import { logger } from './utils/logger.js';

export const fingerprintDiag = (d: Diagnostic): string =>
  `${d.rule}::${d.filePath}::${d.line}`;

export const diffDiagnostics = (
  previous: Diagnostic[],
  current: Diagnostic[],
): { added: Diagnostic[]; removed: Diagnostic[] } => {
  const prevSet = new Set(previous.map(fingerprintDiag));
  const currSet = new Set(current.map(fingerprintDiag));
  return {
    added: current.filter((d) => !prevSet.has(fingerprintDiag(d))),
    removed: previous.filter((d) => !currSet.has(fingerprintDiag(d))),
  };
};

const printWatchDelta = (score: number, added: Diagnostic[], removed: Diagnostic[]): void => {
  console.clear();
  logger.log(`ng-xray watch mode  |  Score: ${score}`);
  logger.break();

  if (added.length === 0 && removed.length === 0) {
    logger.dim('  No changes since last scan.');
    return;
  }

  if (added.length > 0) {
    logger.error(`  +${added.length} new issue${added.length > 1 ? 's' : ''}`);
    for (const d of added.slice(0, 10)) {
      logger.dim(`    ${d.rule} — ${d.filePath}:${d.line}`);
    }
    if (added.length > 10) logger.dim(`    ... and ${added.length - 10} more`);
  }

  if (removed.length > 0) {
    logger.success(`  -${removed.length} resolved issue${removed.length > 1 ? 's' : ''}`);
    for (const d of removed.slice(0, 5)) {
      logger.dim(`    ${d.rule} — ${d.filePath}:${d.line}`);
    }
    if (removed.length > 5) logger.dim(`    ... and ${removed.length - 5} more`);
  }
};

export const resolveWatchPath = (
  directory: string,
  sourceRoot?: string,
): string => {
  if (sourceRoot) return sourceRoot;
  const conventionalSrc = path.join(directory, 'src');
  return existsSync(conventionalSrc) ? conventionalSrc : directory;
};

export const startWatch = async (
  directory: string,
  options: ScanOptions,
  sourceRoot?: string,
): Promise<void> => {
  let chokidar: typeof import('chokidar');
  try {
    chokidar = await import('chokidar');
  } catch {
    logger.error('Watch mode requires chokidar. Run: npm install chokidar');
    process.exit(1);
  }

  let previousDiagnostics: Diagnostic[] = [];

  const runAndDiff = async (): Promise<void> => {
    try {
      const result = await scan(directory, options, true);
      const { added, removed } = diffDiagnostics(previousDiagnostics, result.diagnostics);
      previousDiagnostics = result.diagnostics;
      printWatchDelta(result.score.overall, added, removed);
    } catch (error) {
      logger.error(`Scan failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  logger.log('Running initial scan...');
  await runAndDiff();

  const watchPath = resolveWatchPath(directory, sourceRoot);
  const watcher = chokidar.watch(watchPath, {
    ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    ignoreInitial: true,
    persistent: true,
  });

  let timeout: ReturnType<typeof setTimeout> | undefined;
  watcher.on('all', () => {
    clearTimeout(timeout);
    timeout = setTimeout(runAndDiff, 500);
  });

  logger.dim('  Watching for changes... (Ctrl+C to stop)');

  process.on('SIGINT', () => {
    watcher.close();
    logger.break();
    logger.log('Watch mode stopped.');
    process.exit(0);
  });
};
