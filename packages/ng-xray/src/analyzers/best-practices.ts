import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Project } from 'ts-morph';
import type { Diagnostic } from '../types.js';
import { logger } from '../utils/logger.js';
import { walkFiles } from '../utils/walk.js';

const LIFECYCLE_HOOKS = new Set([
  'ngOnInit',
  'ngOnDestroy',
  'ngAfterViewInit',
  'ngAfterContentInit',
  'ngOnChanges',
  'ngDoCheck',
  'ngAfterViewChecked',
  'ngAfterContentChecked',
]);

const checkConstructorInjection = (filePath: string, content: string, morphProject: Project): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];

  const sourceFile = morphProject.createSourceFile(filePath, content, { overwrite: true });

  for (const classDecl of sourceFile.getClasses()) {
    for (const ctor of classDecl.getConstructors()) {
      const hasInjection = ctor.getParameters().some(
        (param) => param.isParameterProperty() && param.getTypeNode() !== undefined,
      );
      if (hasInjection) {
        diagnostics.push({
          filePath,
          rule: 'prefer-inject',
          category: 'best-practices',
          severity: 'warning',
          message: 'Uses constructor injection instead of the inject() function.',
          help: 'Migrate to `inject()`: replace `constructor(private svc: MyService)` with `private svc = inject(MyService)`.',
          line: ctor.getStartLineNumber(),
          column: 1,
          source: 'ng-xray',
          stability: 'stable',
        });
      }
    }
  }

  return diagnostics;
};

const checkAsyncLifecycle = (filePath: string, content: string, morphProject: Project): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];

  const sourceFile = morphProject.createSourceFile(filePath, content, { overwrite: true });

  for (const classDecl of sourceFile.getClasses()) {
    for (const method of classDecl.getMethods()) {
      const name = method.getName();
      if (!LIFECYCLE_HOOKS.has(name)) continue;
      if (!method.isAsync()) continue;

      diagnostics.push({
        filePath,
        rule: 'no-async-lifecycle',
        category: 'best-practices',
        severity: 'error',
        message: `Lifecycle hook ${name}() is async. Angular does not await lifecycle hooks.`,
        help: 'Remove async from the lifecycle hook and handle async operations explicitly.',
        line: method.getStartLineNumber(),
        column: 1,
        source: 'ng-xray',
        stability: 'stable',
      });
    }
  }

  return diagnostics;
};

export const runBestPracticesAnalyzer = async (directory: string): Promise<Diagnostic[]> => {
  const srcDir = path.join(directory, 'src');
  const targetDir = existsSync(srcDir) ? srcDir : directory;
  const files = walkFiles(targetDir, ['.ts']);
  const diagnostics: Diagnostic[] = [];
  const morphProject = new Project({ useInMemoryFileSystem: true });

  for (const filePath of files) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const relPath = path.relative(directory, filePath);

      diagnostics.push(...checkConstructorInjection(relPath, content, morphProject));
      diagnostics.push(...checkAsyncLifecycle(relPath, content, morphProject));
    } catch (error) {
      logger.error(`Best practices analyzer: failed to read ${filePath} — ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return diagnostics;
};
