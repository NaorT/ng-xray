import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { appendHistory, getHistoryDelta, loadHistory } from './history.js';
import type { ScanResult } from './types.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const makeTempDir = (): string => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ng-xray-history-'));
  tempDirs.push(dir);
  return dir;
};

const makeResult = (overrides: Partial<ScanResult> = {}): ScanResult => ({
  scanStatus: 'complete',
  failedAnalyzers: [],
  diagnostics: [],
  score: {
    overall: 100,
    label: 'Excellent',
    categories: [],
  },
  project: {
    projectName: 'fixture',
    rootDirectory: '/repo',
    angularVersion: '19.0.0',
    sourceFileCount: 1,
    componentCount: 1,
    serviceCount: 0,
    hasSSR: false,
    hasSignals: false,
    standalonePercentage: 100,
    hasTypeScript: true,
  },
  remediation: [],
  elapsedMs: 100,
  timestamp: '2026-01-01T00:00:00.000Z',
  configPath: null,
  analyzerRuns: [],
  profile: 'core',
  scoredDiagnosticsCount: 0,
  advisoryDiagnosticsCount: 0,
  excludedDiagnosticsCount: 0,
  ...overrides,
});

describe('history', () => {
  it('persists score profile metadata with each history entry', () => {
    const directory = makeTempDir();

    appendHistory(directory, makeResult({
      profile: 'all',
      score: {
        overall: 87,
        label: 'Excellent',
        categories: [],
      },
      advisoryDiagnosticsCount: 3,
      excludedDiagnosticsCount: 0,
    }));

    const history = loadHistory(directory);

    expect(history.entries).toHaveLength(1);
    expect(history.entries[0]?.profile).toBe('all');
    expect(history.entries[0]?.advisoryDiagnosticsCount).toBe(3);
  });

  it('computes deltas against the previous entry in the same profile', () => {
    const directory = makeTempDir();

    appendHistory(directory, makeResult({
      profile: 'core',
      score: { overall: 90, label: 'Excellent', categories: [] },
    }));
    appendHistory(directory, makeResult({
      profile: 'all',
      score: { overall: 80, label: 'Good', categories: [] },
    }));
    appendHistory(directory, makeResult({
      profile: 'core',
      score: { overall: 94, label: 'Excellent', categories: [] },
    }));

    const history = loadHistory(directory);

    expect(getHistoryDelta(history, 'core')).toEqual({
      scoreDelta: 4,
      issuesDelta: 0,
    });
    expect(getHistoryDelta(history, 'all')).toBeNull();
  });
});
