import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import type { Diagnostic } from "../types.js";
import { logger } from "../utils/logger.js";
import { resolveSrcDir } from "../utils/resolve-src.js";
import { buildProjectTemplateMap, type ProjectTemplateMap } from "../utils/template-parser.js";
import { buildProjectClassMap, type ProjectClassMap } from "../utils/inheritance-resolver.js";
import { walkFiles } from "../utils/walk.js";

interface ParsedFile {
  filePath: string;
  content: string;
  sourceFile: ts.SourceFile;
}

const collectAllParsedFiles = (directory: string): ParsedFile[] => {
  const srcDir = resolveSrcDir(directory);
  const files = walkFiles(srcDir, [".ts"]);
  const parsed: ParsedFile[] = [];

  for (const filePath of files) {
    if (filePath.endsWith(".spec.ts") || filePath.endsWith(".test.ts")) continue;
    try {
      const content = readFileSync(filePath, "utf-8");
      const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
      parsed.push({ filePath, content, sourceFile });
    } catch (error) {
      logger.error(
        `Dead code (Angular): failed to read ${filePath} — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return parsed;
};

const extractPipeName = (sourceFile: ts.SourceFile): string | null => {
  let pipeName: string | null = null;
  const visit = (node: ts.Node): void => {
    if (pipeName) return;
    if (ts.isDecorator(node) && ts.isCallExpression(node.expression)) {
      const expr = node.expression.expression;
      if (ts.isIdentifier(expr) && expr.text === "Pipe") {
        const arg = node.expression.arguments[0];
        if (arg && ts.isObjectLiteralExpression(arg)) {
          for (const prop of arg.properties) {
            if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === "name") {
              if (ts.isStringLiteral(prop.initializer)) {
                pipeName = prop.initializer.text;
              }
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return pipeName;
};

const isClassReferencedInRoutes = (className: string, parsedFiles: ParsedFile[]): boolean => {
  for (const { filePath, sourceFile } of parsedFiles) {
    if (!filePath.includes("route") && !filePath.includes("routing")) continue;
    let found = false;
    const visit = (node: ts.Node): void => {
      if (found) return;
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
        const name = node.name.text;
        if (
          (name === "component" || name === "loadComponent") &&
          ts.isIdentifier(node.initializer) &&
          node.initializer.text === className
        ) {
          found = true;
          return;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    if (found) return true;
  }
  return false;
};

const isClassReferencedInProviders = (className: string, parsedFiles: ParsedFile[]): boolean => {
  for (const { sourceFile } of parsedFiles) {
    let found = false;
    const visit = (node: ts.Node): void => {
      if (found) return;

      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "inject") {
        const arg = node.arguments[0];
        if (arg && ts.isIdentifier(arg) && arg.text === className) {
          found = true;
          return;
        }
      }

      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === "provide") {
        if (ts.isIdentifier(node.initializer) && node.initializer.text === className) {
          found = true;
          return;
        }
      }

      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === "providers") {
        if (ts.isArrayLiteralExpression(node.initializer)) {
          for (const el of node.initializer.elements) {
            if (ts.isIdentifier(el) && el.text === className) {
              found = true;
              return;
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    if (found) return true;
  }
  return false;
};

const isClassImportedAnywhere = (className: string, parsedFiles: ParsedFile[], ownFilePath: string): boolean => {
  for (const { filePath, sourceFile } of parsedFiles) {
    if (filePath === ownFilePath) continue;
    for (const stmt of sourceFile.statements) {
      if (
        ts.isImportDeclaration(stmt) &&
        stmt.importClause?.namedBindings &&
        ts.isNamedImports(stmt.importClause.namedBindings)
      ) {
        for (const spec of stmt.importClause.namedBindings.elements) {
          if (spec.name.text === className) return true;
        }
      }
    }
  }
  return false;
};

export const runAngularDeadCodeAnalyzer = async (
  directory: string,
  prebuiltClassMap?: ProjectClassMap,
  prebuiltTemplateMap?: ProjectTemplateMap,
): Promise<Diagnostic[]> => {
  const templateMap = prebuiltTemplateMap ?? buildProjectTemplateMap(directory);
  const classMap = prebuiltClassMap ?? buildProjectClassMap(directory);
  const parsedFiles = collectAllParsedFiles(directory);
  const diagnostics: Diagnostic[] = [];

  for (const [className, classInfo] of classMap.classes) {
    const relPath = path.relative(directory, classInfo.filePath);

    if (classInfo.isComponent && classInfo.selector) {
      const selectorTag = classInfo.selector.replace(/[[\]]/g, "");
      const isUsedInTemplate =
        templateMap.allUsedSelectors.has(selectorTag) || templateMap.allUsedSelectors.has(classInfo.selector);
      const isUsedInRoutes = isClassReferencedInRoutes(className, parsedFiles);
      const isEntryComponent = relPath.includes("app.component") || relPath.includes("app-shell");
      const hasSubclasses = [...classMap.classes.values()].some((c) => c.extendsClass === className);

      if (!isUsedInTemplate && !isUsedInRoutes && !isEntryComponent && !hasSubclasses) {
        diagnostics.push({
          filePath: relPath,
          rule: "unused-component",
          category: "dead-code",
          severity: "warning",
          message: `Component "${className}" (selector: ${classInfo.selector}) is not used in any template or route.`,
          help: "Remove this component if it is no longer needed, or verify it is loaded dynamically.",
          line: 1,
          column: 1,
          source: "ng-xray",
          stability: "experimental",
        });
      }
    }

    if (classInfo.isDirective && classInfo.selector) {
      const selectorTag = classInfo.selector.replace(/[[\]]/g, "");
      const isUsedInTemplate =
        templateMap.allUsedSelectors.has(selectorTag) || templateMap.allUsedSelectors.has(classInfo.selector);

      if (!isUsedInTemplate) {
        diagnostics.push({
          filePath: relPath,
          rule: "unused-directive",
          category: "dead-code",
          severity: "warning",
          message: `Directive "${className}" (selector: ${classInfo.selector}) is not used in any template.`,
          help: "Remove this directive if it is no longer needed.",
          line: 1,
          column: 1,
          source: "ng-xray",
          stability: "experimental",
        });
      }
    }

    if (classInfo.isPipe) {
      const pipeFile = parsedFiles.find((f) => f.filePath === classInfo.filePath);
      const pipeName = pipeFile ? extractPipeName(pipeFile.sourceFile) : null;
      if (pipeName && !templateMap.allUsedPipes.has(pipeName)) {
        diagnostics.push({
          filePath: relPath,
          rule: "unused-pipe",
          category: "dead-code",
          severity: "warning",
          message: `Pipe "${className}" (name: ${pipeName}) is not used in any template.`,
          help: "Remove this pipe if it is no longer needed, or check if it is used programmatically.",
          line: 1,
          column: 1,
          source: "ng-xray",
          stability: "experimental",
        });
      }
    }

    if (classInfo.isService) {
      const isInjected = isClassReferencedInProviders(className, parsedFiles);
      const isImported = isClassImportedAnywhere(className, parsedFiles, classInfo.filePath);
      const hasSubclasses = [...classMap.classes.values()].some((c) => c.extendsClass === className);

      if (!isInjected && !isImported && !hasSubclasses) {
        diagnostics.push({
          filePath: relPath,
          rule: "unused-service",
          category: "dead-code",
          severity: "warning",
          message: `Service "${className}" is never injected or referenced anywhere.`,
          help: "Remove this service if it is no longer needed.",
          line: 1,
          column: 1,
          source: "ng-xray",
          stability: "experimental",
        });
      }
    }

    if (classInfo.isGuard) {
      const isUsed =
        isClassReferencedInRoutes(className, parsedFiles) ||
        isClassImportedAnywhere(className, parsedFiles, classInfo.filePath);
      if (!isUsed) {
        diagnostics.push({
          filePath: relPath,
          rule: "unused-guard",
          category: "dead-code",
          severity: "warning",
          message: `Guard "${className}" is not referenced in any route configuration.`,
          help: "Remove this guard if it is no longer needed.",
          line: 1,
          column: 1,
          source: "ng-xray",
          stability: "experimental",
        });
      }
    }

    if (classInfo.isInterceptor) {
      const isUsed =
        isClassReferencedInProviders(className, parsedFiles) ||
        isClassImportedAnywhere(className, parsedFiles, classInfo.filePath);
      if (!isUsed) {
        diagnostics.push({
          filePath: relPath,
          rule: "unused-interceptor",
          category: "dead-code",
          severity: "warning",
          message: `Interceptor "${className}" is not registered in any providers.`,
          help: "Remove this interceptor if it is no longer needed.",
          line: 1,
          column: 1,
          source: "ng-xray",
          stability: "experimental",
        });
      }
    }

    if (classInfo.isResolver) {
      const isUsed =
        isClassReferencedInRoutes(className, parsedFiles) ||
        isClassImportedAnywhere(className, parsedFiles, classInfo.filePath);
      if (!isUsed) {
        diagnostics.push({
          filePath: relPath,
          rule: "unused-resolver",
          category: "dead-code",
          severity: "warning",
          message: `Resolver "${className}" is not referenced in any route configuration.`,
          help: "Remove this resolver if it is no longer needed.",
          line: 1,
          column: 1,
          source: "ng-xray",
          stability: "experimental",
        });
      }
    }
  }

  return diagnostics;
};
