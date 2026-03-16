import type { Category } from './types.js';

export const VERSION = process.env.VERSION ?? '0.1.0';

export const PERFECT_SCORE = 100;
export const SCORE_EXCELLENT_THRESHOLD = 85;
export const SCORE_GOOD_THRESHOLD = 70;
export const SCORE_NEEDS_WORK_THRESHOLD = 50;

export const SCORE_BAR_WIDTH = 25;

export const SEVERITY_WEIGHTS = {
  error: 3,
  warning: 1,
} as const;

export const EXPERIMENTAL_WEIGHT_MULTIPLIER = 0.5;

export const CATEGORY_MAX_DEDUCTIONS: Record<Category, number> = {
  'best-practices': 25,
  performance: 20,
  architecture: 20,
  'dead-code': 20,
  security: 15,
};

export const CATEGORY_LABELS: Record<Category, string> = {
  'best-practices': 'Best Practices',
  performance: 'Performance',
  architecture: 'Architecture',
  'dead-code': 'Dead Code',
  security: 'Security',
};

export const SCORE_LABELS = [
  { min: SCORE_EXCELLENT_THRESHOLD, label: 'Excellent' },
  { min: SCORE_GOOD_THRESHOLD, label: 'Good' },
  { min: SCORE_NEEDS_WORK_THRESHOLD, label: 'Needs Work' },
  { min: 0, label: 'Critical' },
] as const;

export const getScoreLabel = (score: number): string =>
  SCORE_LABELS.find((s) => score >= s.min)?.label ?? 'Critical';

export const EXPERIMENTAL_ANALYZERS = new Set([
  'dead-code-generic',
  'dead-code-angular',
  'dead-class-members',
  'security',
  'signal-readiness',
  'circular-injection',
]);

export const EXIT_CODES = {
  SUCCESS: 0,
  FATAL: 1,
  PARTIAL_SCAN: 2,
  THRESHOLD_FAILURE: 3,
} as const;

export const RULE_MAX_DEDUCTIONS: Partial<Record<string, number>> = {
  'prefer-inject': 8,
  'missing-onpush': 10,
  '@angular-eslint/template/use-track-by-function': 6,
  '@angular-eslint/prefer-standalone': 8,
  '@angular-eslint/template/alt-text': 4,
  '@angular-eslint/template/click-events-have-key-events': 4,
};
