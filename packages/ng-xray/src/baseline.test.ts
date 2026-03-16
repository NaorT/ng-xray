import { describe, it, expect } from 'vitest';
import type { Diagnostic } from './types.js';
import { fingerprintDiagnostic, subtractBaseline } from './baseline.js';

const makeDiag = (overrides: Partial<Diagnostic> = {}): Diagnostic => ({
  filePath: 'test.ts',
  rule: 'test-rule',
  category: 'best-practices',
  severity: 'warning',
  message: 'test',
  help: 'fix it',
  line: 1,
  column: 1,
  source: 'ng-xray',
  stability: 'stable',
  ...overrides,
});

const makeBaseline = (fingerprints: string[]) => ({
  version: 1 as const,
  createdAt: '2025-01-01T00:00:00.000Z',
  fingerprints,
  meta: { totalIssues: fingerprints.length, score: 100 },
});

describe('fingerprintDiagnostic', () => {
  it('produces a stable hash for the same diagnostic', () => {
    const d = makeDiag();
    expect(fingerprintDiagnostic(d)).toBe(fingerprintDiagnostic(d));
  });

  it('produces different hashes for different rules', () => {
    const h1 = fingerprintDiagnostic(makeDiag({ rule: 'rule-a' }));
    const h2 = fingerprintDiagnostic(makeDiag({ rule: 'rule-b' }));
    expect(h1).not.toBe(h2);
  });

  it('produces different hashes for different files', () => {
    const h1 = fingerprintDiagnostic(makeDiag({ filePath: 'a.ts' }));
    const h2 = fingerprintDiagnostic(makeDiag({ filePath: 'b.ts' }));
    expect(h1).not.toBe(h2);
  });

  it('hash is 16 characters long', () => {
    const hash = fingerprintDiagnostic(makeDiag());
    expect(hash).toHaveLength(16);
    expect(hash).toMatch(/^[a-f0-9]{16}$/);
  });
});

describe('subtractBaseline', () => {
  it('removes diagnostics whose fingerprint is in the baseline', () => {
    const d1 = makeDiag({ rule: 'rule-1', filePath: 'a.ts', message: 'msg1' });
    const d2 = makeDiag({ rule: 'rule-2', filePath: 'b.ts', message: 'msg2' });
    const baseline = makeBaseline([fingerprintDiagnostic(d1)]);
    const result = subtractBaseline([d1, d2], baseline);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(d2);
  });

  it('keeps diagnostics not in the baseline', () => {
    const d = makeDiag({ rule: 'unknown', filePath: 'x.ts', message: 'msg' });
    const baseline = makeBaseline([]);
    const result = subtractBaseline([d], baseline);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(d);
  });

  it('handles empty baseline', () => {
    const d = makeDiag();
    const baseline = makeBaseline([]);
    const result = subtractBaseline([d], baseline);
    expect(result).toHaveLength(1);
  });

  it('handles empty diagnostics', () => {
    const baseline = makeBaseline(['abc123']);
    const result = subtractBaseline([], baseline);
    expect(result).toEqual([]);
  });
});
