import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Diagnostic, DiagnosticSource } from '../types.js';
import { logger } from '../utils/logger.js';

const ESLINT_CONFIG_FILES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.cts',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.yaml',
  '.eslintrc.yml',
  '.eslintrc.json',
  '.eslintrc',
];

const ANGULAR_ESLINT_RULES: Record<string, string> = {
  '@angular-eslint/prefer-standalone': 'warn',
  '@angular-eslint/prefer-on-push-component-change-detection': 'warn',
  '@angular-eslint/use-lifecycle-interface': 'warn',
  '@angular-eslint/no-empty-lifecycle-method': 'warn',
  '@angular-eslint/contextual-lifecycle': 'error',
  '@angular-eslint/no-output-native': 'warn',
  '@angular-eslint/no-input-rename': 'warn',
  '@angular-eslint/no-output-rename': 'warn',
  '@angular-eslint/component-class-suffix': 'warn',
  '@angular-eslint/directive-class-suffix': 'warn',
};

const RULE_CATEGORY_MAP: Record<string, Diagnostic['category']> = {
  '@angular-eslint/prefer-standalone': 'best-practices',
  '@angular-eslint/prefer-on-push-component-change-detection': 'performance',
  '@angular-eslint/use-lifecycle-interface': 'best-practices',
  '@angular-eslint/no-empty-lifecycle-method': 'dead-code',
  '@angular-eslint/contextual-lifecycle': 'best-practices',
  '@angular-eslint/no-output-native': 'best-practices',
  '@angular-eslint/no-input-rename': 'best-practices',
  '@angular-eslint/no-output-rename': 'best-practices',
  '@angular-eslint/component-class-suffix': 'best-practices',
  '@angular-eslint/directive-class-suffix': 'best-practices',
  '@angular-eslint/template/use-track-by-function': 'performance',
  '@angular-eslint/template/no-duplicate-attributes': 'best-practices',
  '@angular-eslint/template/banana-in-box': 'best-practices',
  '@angular-eslint/template/conditional-complexity': 'performance',
  '@angular-eslint/template/cyclomatic-complexity': 'performance',
  '@angular-eslint/template/alt-text': 'best-practices',
  '@angular-eslint/template/click-events-have-key-events': 'best-practices',
  '@angular-eslint/template/elements-content': 'best-practices',
  'rxjs-x/no-unsafe-takeuntil': 'best-practices',
  'rxjs-x/no-ignored-subscription': 'best-practices',
};

const RULE_HELP_MAP: Record<string, string> = {
  '@angular-eslint/prefer-standalone': 'Convert to standalone component by adding `standalone: true` to the decorator.',
  '@angular-eslint/prefer-on-push-component-change-detection': 'Add `changeDetection: ChangeDetectionStrategy.OnPush` to the component decorator.',
  '@angular-eslint/use-lifecycle-interface': 'Implement the corresponding lifecycle interface (e.g., `implements OnInit`).',
  '@angular-eslint/no-empty-lifecycle-method': 'Remove empty lifecycle methods or add the required logic.',
  '@angular-eslint/contextual-lifecycle': 'Lifecycle hooks can only be used in classes decorated with @Component, @Directive, or @Pipe.',
  '@angular-eslint/no-output-native': 'Avoid naming outputs after native DOM events. Rename the output.',
  '@angular-eslint/no-input-rename': 'Avoid renaming inputs via the decorator. Use the class property name directly.',
  '@angular-eslint/no-output-rename': 'Avoid renaming outputs via the decorator. Use the class property name directly.',
  '@angular-eslint/template/use-track-by-function': 'Add a `trackBy` function to *ngFor or a `track` expression to @for to avoid unnecessary DOM re-renders.',
  '@angular-eslint/template/no-duplicate-attributes': 'Remove duplicate attributes from the element. Duplicate attributes cause unpredictable behavior.',
  '@angular-eslint/template/banana-in-box': 'Fix two-way binding syntax: use `[(ngModel)]` (banana-in-box), not `([ngModel])`.',
  '@angular-eslint/template/conditional-complexity': 'Simplify the template condition — extract complex logic into a component property or pipe.',
  '@angular-eslint/template/cyclomatic-complexity': 'Reduce template branching complexity by extracting sections into child components.',
  '@angular-eslint/template/alt-text': 'Add an `alt` attribute to <img> and other media elements for accessibility.',
  '@angular-eslint/template/click-events-have-key-events': 'Add a keyboard event handler alongside (click) for accessibility.',
  '@angular-eslint/template/elements-content': 'Ensure interactive elements have meaningful text content or aria-label.',
  'rxjs-x/no-unsafe-takeuntil': 'Place takeUntil/takeUntilDestroyed as the last operator before subscribe to prevent subscription leaks.',
  'rxjs-x/no-ignored-subscription': 'Store the Subscription or use takeUntilDestroyed/async pipe to manage the subscription lifecycle.',
};

const detectEslintConfig = (directory: string): string | null => {
  for (const filename of ESLINT_CONFIG_FILES) {
    const filePath = path.join(directory, filename);
    if (existsSync(filePath)) return filePath;
  }
  return null;
};

const classifySource = (ruleId: string): DiagnosticSource => {
  if (ruleId.startsWith('@angular-eslint')) return 'angular-eslint';
  return 'eslint';
};

const createBuiltInEslint = async (directory: string) => {
  const { ESLint } = await import('eslint');
  const tsEslint = (await import('typescript-eslint')).default;

  return new ESLint({
    cwd: directory,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        plugins: {
          '@angular-eslint': (await import('@angular-eslint/eslint-plugin')).default as any,
          'rxjs-x': (await import('eslint-plugin-rxjs-x')).default as any,
        },
        languageOptions: {
          parser: tsEslint.parser,
          parserOptions: {
            project: true,
            tsconfigRootDir: directory,
          },
        },
        rules: {
          ...ANGULAR_ESLINT_RULES,
          'rxjs-x/no-unsafe-takeuntil': 'error',
          'rxjs-x/no-ignored-subscription': 'warn',
        },
      },
      {
        files: ['**/*.html'],
        plugins: {
          '@angular-eslint/template': (await import('@angular-eslint/eslint-plugin-template')).default as any,
        },
        languageOptions: {
          parser: await import('@angular-eslint/template-parser'),
        },
        rules: {
          '@angular-eslint/template/use-track-by-function': 'warn',
          '@angular-eslint/template/no-duplicate-attributes': 'warn',
          '@angular-eslint/template/banana-in-box': 'error',
          '@angular-eslint/template/conditional-complexity': ['warn', { maxComplexity: 4 }],
          '@angular-eslint/template/cyclomatic-complexity': ['warn', { maxComplexity: 10 }],
          '@angular-eslint/template/alt-text': 'warn',
          '@angular-eslint/template/click-events-have-key-events': 'warn',
          '@angular-eslint/template/elements-content': 'warn',
        },
      },
    ],
  });
};

const createIngestEslint = async (directory: string) => {
  const { ESLint } = await import('eslint');
  return new ESLint({ cwd: directory });
};

const mapResultsToDiagnostics = (
  results: Awaited<ReturnType<InstanceType<typeof import('eslint').ESLint>['lintFiles']>>,
  directory: string,
): Diagnostic[] =>
  results.flatMap((result) =>
    result.messages
      .filter((msg) => msg.ruleId != null)
      .map((msg): Diagnostic => ({
        filePath: path.relative(directory, result.filePath),
        rule: msg.ruleId!,
        category: RULE_CATEGORY_MAP[msg.ruleId!] ?? 'best-practices',
        severity: msg.severity === 2 ? 'error' : 'warning',
        message: msg.message,
        help: RULE_HELP_MAP[msg.ruleId!] ?? '',
        line: msg.line,
        column: msg.column,
        source: classifySource(msg.ruleId!),
        stability: 'stable',
      })),
  );

export type LintMode = 'ingest' | 'built-in';

export const runLintAnalyzer = async (directory: string): Promise<Diagnostic[]> => {
  const configPath = detectEslintConfig(directory);

  let eslint: InstanceType<typeof import('eslint').ESLint>;
  let mode: LintMode;

  if (configPath) {
    mode = 'ingest';
    logger.debug(`Lint: using project ESLint config at ${configPath}`);
    eslint = await createIngestEslint(directory);
  } else {
    mode = 'built-in';
    logger.debug('Lint: no ESLint config found, using built-in Angular rules');
    eslint = await createBuiltInEslint(directory);
  }

  const srcDir = path.join(directory, 'src');
  const patterns = existsSync(srcDir)
    ? ['src/**/*.ts', 'src/**/*.html']
    : ['**/*.ts', '**/*.html'];

  const results = await eslint.lintFiles(patterns);
  return mapResultsToDiagnostics(results, directory);
};
