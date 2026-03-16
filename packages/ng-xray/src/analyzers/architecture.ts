import { existsSync } from 'node:fs';
import path from 'node:path';
import { cruise } from 'dependency-cruiser';
import type { ICruiseResult } from 'dependency-cruiser';
import type { ArchitectureAnalyzerConfig, Diagnostic, Severity } from '../types.js';

const HELP: Record<string, string> = {
  'feature-isolation': 'Move shared code to `shared/` or `core/`, or create a shared sub-module.',
  'core-shared-boundary': 'Move the needed code to `shared/` or `core/`, or refactor the dependency.',
  'circular-dependency': 'Break the circular dependency by extracting shared code or using dependency injection.',
};

function buildForbiddenRules(config?: ArchitectureAnalyzerConfig) {
  const featurePaths = config?.featurePaths?.length ? config.featurePaths : ['features'];
  const sharedPaths = config?.sharedPaths?.length ? config.sharedPaths : ['shared', 'core'];

  const featurePattern = `(${featurePaths.join('|')})/([^/]+)`;
  const sharedPattern = `(^|/)app/(${sharedPaths.join('|')})/`;

  return [
    {
      name: 'feature-isolation',
      severity: 'error' as const,
      from: { path: featurePattern },
      to: {
        path: `(${featurePaths.join('|')})/`,
        pathNot: `$1/$2`,
      },
    },
    {
      name: 'core-shared-boundary',
      severity: 'error' as const,
      from: { path: sharedPattern },
      to: { path: '(^|/)app/features/' },
    },
    {
      name: 'circular-dependency',
      severity: 'error' as const,
      from: {},
      to: { circular: true },
    },
  ];
}

function resolveTsConfig(directory: string): string | undefined {
  for (const name of ['tsconfig.json', 'tsconfig.app.json']) {
    const full = path.join(directory, name);
    if (existsSync(full)) return full;
  }
  return undefined;
}

function buildMessage(ruleName: string, from: string, to: string, cycle?: { name: string }[]): string {
  switch (ruleName) {
    case 'feature-isolation':
      return `Feature module imports from another feature module: ${from} → ${to}. Features must not import from each other.`;
    case 'core-shared-boundary':
      return `Shared/core module imports from a feature module: ${from} → ${to}.`;
    case 'circular-dependency': {
      const chain = cycle?.length ? cycle.map(c => c.name).join(' → ') : `${from} → ${to}`;
      return `Circular dependency detected: ${chain}`;
    }
    default:
      return `${ruleName}: ${from} → ${to}`;
  }
}

function normalizedCycleKey(cycle: { name: string }[]): string {
  const names = cycle.map(c => c.name);
  const min = names.reduce((a, b) => (a < b ? a : b));
  const idx = names.indexOf(min);
  const rotated = [...names.slice(idx), ...names.slice(0, idx)];
  return rotated.join(',');
}

export const runArchitectureAnalyzer = async (
  directory: string,
  config?: ArchitectureAnalyzerConfig,
): Promise<Diagnostic[]> => {
  const srcDir = path.join(directory, 'src');
  const scanDir = existsSync(srcDir) ? 'src' : '.';
  const tsConfigFile = resolveTsConfig(directory);
  const forbiddenRules = buildForbiddenRules(config);

  const result = await cruise(
    [scanDir],
    {
      baseDir: directory,
      validate: true,
      ruleSet: { forbidden: forbiddenRules },
      exclude: { path: 'node_modules|dist|\\.git|\\.spec\\.ts$|\\.test\\.ts$' },
      ...(tsConfigFile ? { tsConfig: { fileName: tsConfigFile } } : {}),
    },
  );

  const cruiseResult = result.output as ICruiseResult;
  if (typeof cruiseResult === 'string') return [];

  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();

  for (const violation of cruiseResult.summary.violations) {
    const { name: ruleName, severity: dcSeverity } = violation.rule;
    if (!(ruleName in HELP)) continue;

    const key = ruleName === 'circular-dependency' && violation.cycle?.length
      ? `circular:${normalizedCycleKey(violation.cycle)}`
      : `${ruleName}:${violation.from}:${violation.to}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const severity: Severity = dcSeverity === 'error' ? 'error' : 'warning';

    diagnostics.push({
      filePath: violation.from,
      rule: ruleName,
      category: 'architecture',
      severity,
      message: buildMessage(ruleName, violation.from, violation.to, violation.cycle),
      help: HELP[ruleName],
      line: 1,
      column: 1,
      source: 'ng-xray',
      stability: 'stable',
    });
  }

  return diagnostics;
};
