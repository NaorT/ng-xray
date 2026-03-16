import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { Diagnostic } from '../types.js';
import { logger } from '../utils/logger.js';
import { buildProjectTemplateMap, type ProjectTemplateMap } from '../utils/template-parser.js';
import { buildProjectClassMap, type ClassInfo, type ProjectClassMap } from '../utils/inheritance-resolver.js';
import { walkFiles } from '../utils/walk.js';

const collectAllFileContents = (directory: string): Map<string, string> => {
  const srcDir = existsSync(path.join(directory, 'src')) ? path.join(directory, 'src') : directory;
  const files = walkFiles(srcDir, ['.ts']);
  const contents = new Map<string, string>();

  for (const filePath of files) {
    if (filePath.endsWith('.spec.ts') || filePath.endsWith('.test.ts')) continue;
    try {
      contents.set(filePath, readFileSync(filePath, 'utf-8'));
    } catch (error) {
      logger.debug(`Dead code (Angular): failed to read ${filePath} — ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return contents;
};

const extractPipeName = (content: string): string | null => {
  const pipeMatch = content.match(/name\s*:\s*['"](\w+)['"]/);
  if (!pipeMatch) return null;
  const decoratorBefore = content.lastIndexOf('@Pipe', content.indexOf(pipeMatch[0]));
  if (decoratorBefore === -1) return null;
  return pipeMatch[1];
};

const isClassReferencedInRoutes = (className: string, allContents: Map<string, string>): boolean => {
  for (const [filePath, content] of allContents) {
    if (!filePath.includes('route') && !filePath.includes('routing')) continue;
    if (content.includes(className)) return true;
  }
  return false;
};

const isClassReferencedInProviders = (className: string, allContents: Map<string, string>): boolean => {
  for (const [, content] of allContents) {
    if (content.includes(`inject(${className})`) || content.includes(`provide: ${className}`)) return true;

    const providerArrayRegex = /providers\s*:\s*\[([^\]]*)\]/gs;
    let match: RegExpExecArray | null;
    while ((match = providerArrayRegex.exec(content)) !== null) {
      if (match[1].includes(className)) return true;
    }
  }
  return false;
};

const isClassImportedAnywhere = (className: string, allContents: Map<string, string>, ownFilePath: string): boolean => {
  for (const [filePath, content] of allContents) {
    if (filePath === ownFilePath) continue;
    if (content.includes(className)) return true;
  }
  return false;
};

const entityTypeLabel = (cls: ClassInfo): string => {
  if (cls.isComponent) return 'component';
  if (cls.isDirective) return 'directive';
  if (cls.isPipe) return 'pipe';
  if (cls.isService) return 'service';
  if (cls.isGuard) return 'guard';
  if (cls.isInterceptor) return 'interceptor';
  if (cls.isResolver) return 'resolver';
  return 'class';
};

const diagnosticRule = (cls: ClassInfo): string => {
  if (cls.isComponent) return 'unused-component';
  if (cls.isDirective) return 'unused-directive';
  if (cls.isPipe) return 'unused-pipe';
  if (cls.isService) return 'unused-service';
  if (cls.isGuard) return 'unused-guard';
  if (cls.isInterceptor) return 'unused-interceptor';
  if (cls.isResolver) return 'unused-resolver';
  return 'unused-class';
};

export const runAngularDeadCodeAnalyzer = async (
  directory: string,
  prebuiltClassMap?: ProjectClassMap,
  prebuiltTemplateMap?: ProjectTemplateMap,
): Promise<Diagnostic[]> => {
  const templateMap = prebuiltTemplateMap ?? buildProjectTemplateMap(directory);
  const classMap = prebuiltClassMap ?? buildProjectClassMap(directory);
  const allContents = collectAllFileContents(directory);
  const diagnostics: Diagnostic[] = [];

  for (const [className, classInfo] of classMap.classes) {
    const relPath = path.relative(directory, classInfo.filePath);

    if (classInfo.isComponent && classInfo.selector) {
      const selectorTag = classInfo.selector.replace(/[\[\]]/g, '');
      const isUsedInTemplate = templateMap.allUsedSelectors.has(selectorTag) || templateMap.allUsedSelectors.has(classInfo.selector);
      const isUsedInRoutes = isClassReferencedInRoutes(className, allContents);
      const isEntryComponent = relPath.includes('app.component') || relPath.includes('app-shell');
      const hasSubclasses = [...classMap.classes.values()].some((c) => c.extendsClass === className);

      if (!isUsedInTemplate && !isUsedInRoutes && !isEntryComponent && !hasSubclasses) {
        diagnostics.push({
          filePath: relPath,
          rule: 'unused-component',
          category: 'dead-code',
          severity: 'warning',
          message: `Component "${className}" (selector: ${classInfo.selector}) is not used in any template or route.`,
          help: 'Remove this component if it is no longer needed, or verify it is loaded dynamically.',
          line: 1,
          column: 1,
          source: 'ng-xray',
          stability: 'experimental',
        });
      }
    }

    if (classInfo.isDirective && classInfo.selector) {
      const selectorTag = classInfo.selector.replace(/[\[\]]/g, '');
      const isUsedInTemplate = templateMap.allUsedSelectors.has(selectorTag) || templateMap.allUsedSelectors.has(classInfo.selector);

      if (!isUsedInTemplate) {
        diagnostics.push({
          filePath: relPath,
          rule: 'unused-directive',
          category: 'dead-code',
          severity: 'warning',
          message: `Directive "${className}" (selector: ${classInfo.selector}) is not used in any template.`,
          help: 'Remove this directive if it is no longer needed.',
          line: 1,
          column: 1,
          source: 'ng-xray',
          stability: 'experimental',
        });
      }
    }

    if (classInfo.isPipe) {
      const pipeName = extractPipeName(readFileSync(classInfo.filePath, 'utf-8'));
      if (pipeName && !templateMap.allUsedPipes.has(pipeName)) {
        diagnostics.push({
          filePath: relPath,
          rule: 'unused-pipe',
          category: 'dead-code',
          severity: 'warning',
          message: `Pipe "${className}" (name: ${pipeName}) is not used in any template.`,
          help: 'Remove this pipe if it is no longer needed, or check if it is used programmatically.',
          line: 1,
          column: 1,
          source: 'ng-xray',
          stability: 'experimental',
        });
      }
    }

    if (classInfo.isService) {
      const isInjected = isClassReferencedInProviders(className, allContents);
      const isImported = isClassImportedAnywhere(className, allContents, classInfo.filePath);
      const hasSubclasses = [...classMap.classes.values()].some((c) => c.extendsClass === className);

      if (!isInjected && !isImported && !hasSubclasses) {
        diagnostics.push({
          filePath: relPath,
          rule: 'unused-service',
          category: 'dead-code',
          severity: 'warning',
          message: `Service "${className}" is never injected or referenced anywhere.`,
          help: 'Remove this service if it is no longer needed.',
          line: 1,
          column: 1,
          source: 'ng-xray',
          stability: 'experimental',
        });
      }
    }

    if (classInfo.isGuard) {
      const isUsed = isClassReferencedInRoutes(className, allContents) || isClassImportedAnywhere(className, allContents, classInfo.filePath);
      if (!isUsed) {
        diagnostics.push({
          filePath: relPath,
          rule: 'unused-guard',
          category: 'dead-code',
          severity: 'warning',
          message: `Guard "${className}" is not referenced in any route configuration.`,
          help: 'Remove this guard if it is no longer needed.',
          line: 1,
          column: 1,
          source: 'ng-xray',
          stability: 'experimental',
        });
      }
    }

    if (classInfo.isInterceptor) {
      const isUsed = isClassReferencedInProviders(className, allContents) || isClassImportedAnywhere(className, allContents, classInfo.filePath);
      if (!isUsed) {
        diagnostics.push({
          filePath: relPath,
          rule: 'unused-interceptor',
          category: 'dead-code',
          severity: 'warning',
          message: `Interceptor "${className}" is not registered in any providers.`,
          help: 'Remove this interceptor if it is no longer needed.',
          line: 1,
          column: 1,
          source: 'ng-xray',
          stability: 'experimental',
        });
      }
    }

    if (classInfo.isResolver) {
      const isUsed = isClassReferencedInRoutes(className, allContents) || isClassImportedAnywhere(className, allContents, classInfo.filePath);
      if (!isUsed) {
        diagnostics.push({
          filePath: relPath,
          rule: 'unused-resolver',
          category: 'dead-code',
          severity: 'warning',
          message: `Resolver "${className}" is not referenced in any route configuration.`,
          help: 'Remove this resolver if it is no longer needed.',
          line: 1,
          column: 1,
          source: 'ng-xray',
          stability: 'experimental',
        });
      }
    }
  }

  return diagnostics;
};
