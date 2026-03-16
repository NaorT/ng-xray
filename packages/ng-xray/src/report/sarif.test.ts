import { describe, expect, it } from 'vitest';
import { generateSarif } from './sarif.js';
import type { Diagnostic, ScanResult } from '../types.js';

const makeDiagnostic = (overrides: Partial<Diagnostic> = {}): Diagnostic => ({
  filePath: 'src/app/app.component.ts',
  rule: 'missing-onpush',
  category: 'performance',
  severity: 'warning',
  message: 'Component does not use OnPush change detection strategy.',
  help: 'Add OnPush.',
  line: 1,
  column: 1,
  source: 'ng-xray',
  stability: 'stable',
  ...overrides,
});

const makeScanResult = (overrides: Partial<ScanResult> = {}): ScanResult => ({
  scanStatus: 'complete',
  failedAnalyzers: [],
  diagnostics: [makeDiagnostic()],
  score: {
    overall: 95,
    label: 'Excellent',
    categories: [
      {
        category: 'performance',
        label: 'Performance',
        score: 19,
        maxDeduction: 20,
        deduction: 1,
        issueCount: 1,
      },
    ],
  },
  project: {
    rootDirectory: '/tmp/project',
    projectName: 'project',
    angularVersion: '19.0.0',
    hasSSR: false,
    hasSignals: false,
    standalonePercentage: 100,
    hasTypeScript: true,
    sourceFileCount: 1,
    componentCount: 1,
    serviceCount: 0,
  },
  remediation: [],
  elapsedMs: 100,
  timestamp: '2026-01-01T00:00:00.000Z',
  configPath: null,
  analyzerRuns: [],
  ...overrides,
});

describe('generateSarif', () => {
  it('captures partial-scan metadata at the run level', () => {
    const sarif = JSON.parse(generateSarif(makeScanResult({
      scanStatus: 'partial',
      failedAnalyzers: ['Lint checks'],
    })));

    expect(sarif.runs[0].invocations[0].executionSuccessful).toBe(false);
    expect(sarif.runs[0].properties.scanStatus).toBe('partial');
    expect(sarif.runs[0].properties.failedAnalyzers).toEqual(['Lint checks']);
  });
});
