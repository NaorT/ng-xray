import { describe, it, expect } from 'vitest';
import type { Diagnostic, Category } from '../types.js';
import { calculateScore, generateRemediation } from './calculate-score.js';

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

describe('calculateScore', () => {
  it('zero diagnostics → score 100, label "Excellent"', () => {
    const result = calculateScore([]);
    expect(result.overall).toBe(100);
    expect(result.label).toBe('Excellent');
  });

  it('single warning in best-practices → score 99', () => {
    const result = calculateScore([makeDiag({ severity: 'warning', category: 'best-practices' })]);
    expect(result.overall).toBe(99);
  });

  it('single error in performance → score 97', () => {
    const result = calculateScore([makeDiag({ severity: 'error', category: 'performance' })]);
    expect(result.overall).toBe(97);
  });

  it('category deduction is capped at maxDeduction', () => {
    const diags = Array.from({ length: 30 }, () =>
      makeDiag({ category: 'best-practices', severity: 'warning' })
    );
    const result = calculateScore(diags);
    const bestPractices = result.categories.find((c) => c.category === 'best-practices');
    expect(bestPractices?.deduction).toBe(25);
    expect(result.overall).toBe(75);
  });

  it('all categories maxed out → score 0, label "Critical"', () => {
    const categories: Category[] = ['best-practices', 'performance', 'architecture', 'dead-code', 'security'];
    const maxPerCategory = [25, 20, 20, 20, 15];
    const diags: Diagnostic[] = [];
    categories.forEach((cat, i) => {
      const needed = Math.ceil(maxPerCategory[i] / 3);
      for (let j = 0; j < needed; j++) {
        diags.push(makeDiag({ category: cat, severity: 'error', rule: `rule-${cat}-${j}` }));
      }
    });
    const result = calculateScore(diags);
    expect(result.overall).toBe(0);
    expect(result.label).toBe('Critical');
  });

  it('mixed severity within one category', () => {
    const diags: Diagnostic[] = [
      ...Array(2).fill(null).map(() => makeDiag({ category: 'architecture', severity: 'error', rule: 'e1' })),
      ...Array(3).fill(null).map(() => makeDiag({ category: 'architecture', severity: 'warning', rule: 'w1' })),
    ];
    const result = calculateScore(diags);
    expect(result.overall).toBe(91);
  });

  it('custom weight on diagnostic overrides severity weight', () => {
    const result = calculateScore([makeDiag({ weight: 5, severity: 'warning' })]);
    expect(result.overall).toBe(95);
  });

  it('per-rule deduction cap limits a noisy rule within a category', () => {
    const diags = Array.from({ length: 20 }, () =>
      makeDiag({ category: 'best-practices', severity: 'warning', rule: 'prefer-inject' }),
    );
    const result = calculateScore(diags);
    const bp = result.categories.find((c) => c.category === 'best-practices');
    expect(bp?.deduction).toBe(8);
    expect(result.overall).toBe(92);
  });

  it('density factor attenuates deductions for large projects', () => {
    const diags = [makeDiag({ category: 'performance', severity: 'error', rule: 'missing-onpush' })];
    const withoutDensity = calculateScore(diags);
    const withDensity = calculateScore(diags, { fileCount: 500 });
    expect(withDensity.overall).toBeGreaterThanOrEqual(withoutDensity.overall);
  });

  it('density factor has no effect when not provided', () => {
    const diags = [makeDiag({ category: 'performance', severity: 'error' })];
    const a = calculateScore(diags);
    const b = calculateScore(diags, {});
    expect(a.overall).toBe(b.overall);
  });

  it('experimental warning deducts half weight', () => {
    const result = calculateScore([
      makeDiag({ category: 'performance', severity: 'warning', stability: 'experimental' }),
    ]);
    expect(result.overall).toBe(99.5);
  });

  it('experimental error deducts half error weight', () => {
    const result = calculateScore([
      makeDiag({ category: 'performance', severity: 'error', stability: 'experimental' }),
    ]);
    expect(result.overall).toBe(98.5);
  });

  it('mixed stable and experimental findings combine using their respective weights', () => {
    const result = calculateScore([
      makeDiag({ category: 'performance', severity: 'error', stability: 'stable' }),
      makeDiag({ category: 'performance', severity: 'warning', stability: 'experimental' }),
    ]);
    expect(result.overall).toBe(96.5);
  });
});

describe('generateRemediation', () => {
  it('returns items sorted by estimated score impact (descending)', () => {
    const diags = [
      makeDiag({ rule: 'low-rule', category: 'best-practices', severity: 'warning' }),
      makeDiag({ rule: 'high-rule', category: 'best-practices', severity: 'error' }),
      makeDiag({ rule: 'high-rule', category: 'best-practices', severity: 'error' }),
      makeDiag({ rule: 'med-rule', category: 'best-practices', severity: 'error' }),
    ];
    const items = generateRemediation(diags);
    expect(items[0].rule).toBe('high-rule');
    expect(items[1].rule).toBe('med-rule');
    expect(items[2].rule).toBe('low-rule');
  });

  it('priority is high when impact >= 6, medium when >= 3, low otherwise', () => {
    const highDiags = Array(3).fill(null).map(() =>
      makeDiag({ rule: 'high', category: 'best-practices', severity: 'error' })
    );
    const medDiags = [makeDiag({ rule: 'med', category: 'best-practices', severity: 'error' })];
    const lowDiags = [makeDiag({ rule: 'low', category: 'best-practices', severity: 'warning' })];
    const items = generateRemediation([...highDiags, ...medDiags, ...lowDiags]);
    expect(items.find((i) => i.rule === 'high')?.priority).toBe('high');
    expect(items.find((i) => i.rule === 'med')?.priority).toBe('medium');
    expect(items.find((i) => i.rule === 'low')?.priority).toBe('low');
  });

  it('counts unique affected files per rule', () => {
    const diags = [
      makeDiag({ rule: 'same-rule', filePath: 'a.ts' }),
      makeDiag({ rule: 'same-rule', filePath: 'b.ts' }),
      makeDiag({ rule: 'same-rule', filePath: 'a.ts' }),
    ];
    const items = generateRemediation(diags);
    expect(items).toHaveLength(1);
    expect(items[0].affectedFileCount).toBe(2);
  });

  it('returns empty array for empty diagnostics', () => {
    expect(generateRemediation([])).toEqual([]);
  });

  it('respects RULE_MAX_DEDUCTIONS cap', () => {
    const diags: Diagnostic[] = Array.from({ length: 20 }, (_, i) => ({
      filePath: `src/app/comp${i}.component.ts`,
      rule: 'missing-onpush',
      category: 'performance' as const,
      severity: 'warning' as const,
      message: 'Component does not use OnPush',
      help: 'Add OnPush',
      line: 1,
      column: 1,
      source: 'ng-xray',
      stability: 'stable',
    }));
    const items = generateRemediation(diags);
    const onpush = items.find(i => i.rule === 'missing-onpush');
    expect(onpush?.estimatedScoreImpact).toBeLessThanOrEqual(10);
  });

  it('caps by category max deduction', () => {
    const diags: Diagnostic[] = Array.from({ length: 50 }, (_, i) => ({
      filePath: `src/app/file${i}.ts`,
      rule: 'some-uncapped-perf-rule',
      category: 'performance' as const,
      severity: 'error' as const,
      message: 'Perf issue',
      help: 'Fix it',
      line: 1,
      column: 1,
      source: 'ng-xray',
      stability: 'stable',
    }));
    const items = generateRemediation(diags);
    expect(items[0].estimatedScoreImpact).toBeLessThanOrEqual(20);
  });

  it('applies density scaling to remediation impact when fileCount is provided', () => {
    const diags = [
      makeDiag({ rule: 'missing-onpush', category: 'performance', severity: 'error' }),
    ];

    const withoutDensity = generateRemediation(diags);
    const withDensity = generateRemediation(diags, { fileCount: 500 });

    expect(withDensity[0].estimatedScoreImpact).toBeLessThan(withoutDensity[0].estimatedScoreImpact);
  });

  it('downweights experimental findings in remediation impact', () => {
    const stableItems = generateRemediation([
      makeDiag({ rule: 'stable-rule', category: 'performance', severity: 'error', stability: 'stable' }),
    ]);
    const experimentalItems = generateRemediation([
      makeDiag({ rule: 'experimental-rule', category: 'performance', severity: 'error', stability: 'experimental' }),
    ]);

    expect(experimentalItems[0].estimatedScoreImpact).toBeLessThan(stableItems[0].estimatedScoreImpact);
  });
});
