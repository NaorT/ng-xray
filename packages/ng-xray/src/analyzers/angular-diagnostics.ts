import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { Category, Diagnostic, Severity } from '../types.js';
import { logger } from '../utils/logger.js';

const NG_DIAG_PATTERN = /^(.+?):(\d+):(\d+)\s+-\s+(error|warning)\s+(NG\d+):\s+(.+)$/;

interface ParsedDiagnostic {
  filePath: string;
  line: number;
  column: number;
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

const CATEGORY_MAP: Record<string, Category> = {
  NG8101: 'best-practices',
  NG8102: 'best-practices',
  NG8103: 'best-practices',
  NG8104: 'best-practices',
  NG8105: 'best-practices',
  NG8106: 'best-practices',
  NG8107: 'performance',
  NG8108: 'performance',
  NG8109: 'best-practices',
  NG8111: 'best-practices',
};

const HELP_MAP: Record<string, string> = {
  NG8101: 'Fix the banana-in-box syntax: use [(ngModel)] instead of ([ngModel]).',
  NG8102: 'The left side of the nullish coalescing operator is not nullable. Remove the ?? operator.',
  NG8103: 'Import the required control flow directive (NgIf, NgFor, etc.) or use the standalone imports array.',
  NG8104: 'This attribute looks like a binding but is being treated as a plain string. Use [attr]="value" syntax.',
  NG8105: 'Add the "let" keyword to the *ngFor expression.',
  NG8106: 'This suffix is not supported. Check the Angular template syntax documentation.',
  NG8107: 'The left side of the optional chain is not nullable. Remove the ?. operator.',
  NG8108: 'The ngSkipHydration attribute must be a static string, not a binding.',
  NG8109: 'This signal is used in interpolation but not invoked. Add () to call it.',
  NG8111: 'This function is referenced in an event binding but not invoked. Add () to call it.',
};

const resolveNgcBinary = (directory: string): string | null => {
  const localNgc = path.join(directory, 'node_modules', '.bin', 'ngc');
  if (existsSync(localNgc)) return localNgc;
  return null;
};

const resolveTsConfig = (directory: string): string | null => {
  for (const name of ['tsconfig.app.json', 'tsconfig.json']) {
    const full = path.join(directory, name);
    if (existsSync(full)) return full;
  }
  return null;
};

const parseDiagnosticOutput = (output: string): ParsedDiagnostic[] => {
  const diagnostics: ParsedDiagnostic[] = [];
  for (const line of output.split('\n')) {
    const match = NG_DIAG_PATTERN.exec(line.trim());
    if (!match) continue;
    const [, filePath, lineStr, colStr, severity, code, message] = match;
    if (!code.startsWith('NG8')) continue;
    diagnostics.push({
      filePath,
      line: parseInt(lineStr, 10),
      column: parseInt(colStr, 10),
      severity: severity as 'error' | 'warning',
      code,
      message,
    });
  }
  return diagnostics;
};

export const runAngularDiagnosticsAnalyzer = async (
  directory: string,
): Promise<Diagnostic[]> => {
  const ngcBinary = resolveNgcBinary(directory);
  if (!ngcBinary) {
    logger.debug('No local ngc binary found — skipping Angular diagnostics.');
    return [];
  }

  const tsConfig = resolveTsConfig(directory);
  if (!tsConfig) {
    logger.debug('No tsconfig found — skipping Angular diagnostics.');
    return [];
  }

  logger.debug(`Running Angular compiler: ${ngcBinary} -p ${tsConfig} --noEmit`);

  let output: string;
  try {
    execFileSync(ngcBinary, ['-p', tsConfig, '--noEmit'], {
      cwd: directory,
      encoding: 'utf-8',
      timeout: 120_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    output = '';
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; status?: number };
    output = [execError.stdout ?? '', execError.stderr ?? ''].join('\n');
    if (!output.includes('NG')) {
      throw new Error(
        `Angular compiler failed with exit code ${execError.status}: ${output.slice(0, 500)}`,
      );
    }
  }

  const parsed = parseDiagnosticOutput(output);
  const diagnostics: Diagnostic[] = [];

  for (const d of parsed) {
    const relPath = d.filePath.startsWith('/')
      ? path.relative(directory, d.filePath)
      : d.filePath;

    const severity: Severity = d.severity === 'error' ? 'error' : 'warning';
    const category = CATEGORY_MAP[d.code] ?? 'best-practices';
    const help = HELP_MAP[d.code] ?? 'See the Angular Extended Diagnostics documentation for details.';

    diagnostics.push({
      filePath: relPath,
      rule: d.code,
      category,
      severity,
      message: d.message,
      help,
      line: d.line,
      column: d.column,
      source: 'angular',
      stability: 'stable',
    });
  }

  return diagnostics;
};
