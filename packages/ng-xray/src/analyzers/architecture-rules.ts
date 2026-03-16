import { readFileSync } from 'node:fs';
import path from 'node:path';
import picomatch from 'picomatch';
import { Project } from 'ts-morph';
import type { BoundaryRule, DeepImportRule, Diagnostic, PublicApiRule } from '../types.js';
import { logger } from '../utils/logger.js';
import { walkFiles } from '../utils/walk.js';

const toPosix = (p: string): string => p.replace(/\\/g, '/');

const resolveImportPath = (
  directory: string,
  filePath: string,
  specifier: string,
): string => {
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    const resolved = path.resolve(path.dirname(filePath), specifier);
    return toPosix(path.relative(directory, resolved));
  }
  return specifier;
};

const isAllowedBarrel = (resolvedPath: string, barrelFiles: string[]): boolean => {
  const basename = path.basename(resolvedPath);
  if (barrelFiles.includes(basename)) return true;
  if (!path.extname(resolvedPath) && barrelFiles.some((b) => path.basename(b, path.extname(b)) === basename)) return true;
  return false;
};

const isSameBoundaryZone = (filePath: string, importPath: string, fromPattern: string): boolean => {
  const prefix = fromPattern.replace(/\*\*.*$/, '');
  if (!filePath.startsWith(prefix) || !importPath.startsWith(prefix)) return false;
  const fileRest = filePath.slice(prefix.length);
  const importRest = importPath.slice(prefix.length);
  const fileZone = fileRest.split('/')[0];
  const importZone = importRest.split('/')[0];
  return fileZone === importZone && fileZone !== '';
};

export const runArchitectureRules = (
  directory: string,
  boundaries: BoundaryRule[],
  publicApi: PublicApiRule[],
  deepImports: DeepImportRule[],
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const tsFiles = walkFiles(directory, ['.ts']);
  const project = new Project({ useInMemoryFileSystem: true });

  const boundaryMatchers = boundaries.map((r) => ({
    fromMatch: picomatch(r.from),
    disallowMatch: r.disallowImportFrom.map((p) => picomatch(p)),
    rule: r,
  }));

  const publicApiMatchers = publicApi.map((r) => ({
    zoneMatch: picomatch(r.zone),
    allowed: r.onlyAllowImportFrom ?? ['index.ts', 'index.js'],
    rule: r,
  }));

  const deepImportMatchers = deepImports.map((r) => ({
    patternMatch: picomatch(r.pattern),
    rule: r,
  }));

  for (const filePath of tsFiles) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const relPath = toPosix(path.relative(directory, filePath));
      const sourceFile = project.createSourceFile(filePath, content, { overwrite: true });

      for (const importDecl of sourceFile.getImportDeclarations()) {
        const specifier = importDecl.getModuleSpecifierValue();
        if (!specifier) continue;

        const resolvedPath = resolveImportPath(directory, filePath, specifier);
        const line = importDecl.getStartLineNumber();

        for (const { fromMatch, disallowMatch, rule } of boundaryMatchers) {
          if (!fromMatch(relPath)) continue;
          if (isSameBoundaryZone(relPath, resolvedPath, rule.from)) continue;
          const isDisallowed = disallowMatch.some((m) => m(resolvedPath));
          if (isDisallowed) {
            diagnostics.push({
              filePath: relPath,
              rule: 'boundary-violation',
              category: 'architecture',
              severity: rule.severity ?? 'error',
              message: rule.message ?? `Boundary violation: ${relPath} imports from ${resolvedPath} which is disallowed`,
              help: 'Move shared code to an allowed zone, or update the boundary rule if this import is intentional.',
              source: 'ng-xray',
              stability: 'stable',
              line,
              column: 1,
            });
          }
        }

        if (specifier.startsWith('.') || specifier.startsWith('/')) {
          for (const { zoneMatch, allowed, rule } of publicApiMatchers) {
            if (!zoneMatch(resolvedPath)) continue;
            if (isAllowedBarrel(resolvedPath, allowed)) continue;
            diagnostics.push({
              filePath: relPath,
              rule: 'public-api-violation',
              category: 'architecture',
              severity: rule.severity ?? 'warning',
              message: rule.message ?? `Import bypasses public API: ${resolvedPath}. Import from the barrel file instead.`,
              help: "Import from the zone's barrel file (e.g., index.ts) instead of reaching into internal files.",
              source: 'ng-xray',
              stability: 'stable',
              line,
              column: 1,
            });
          }
        } else {
          for (const { patternMatch, rule } of deepImportMatchers) {
            if (!patternMatch(specifier)) continue;
            diagnostics.push({
              filePath: relPath,
              rule: 'deep-import',
              category: 'architecture',
              severity: rule.severity ?? 'warning',
              message: rule.message ?? `Deep import detected: ${specifier}. Use the package's public API instead.`,
              help: "Import from the package's top-level entry point instead of reaching into internal paths.",
              source: 'ng-xray',
              stability: 'stable',
              line,
              column: 1,
            });
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to read ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return diagnostics;
};
