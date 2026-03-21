import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import type { Diagnostic } from "../types.js";
import { logger } from "../utils/logger.js";
import { resolveSrcDir } from "../utils/resolve-src.js";
import { walkFiles } from "../utils/walk.js";

const isRoutingFile = (filePath: string): boolean => {
  const name = path.basename(filePath);
  return name.includes("route") || name.includes("routing");
};

const isRouteFile = (content: string): boolean =>
  content.includes("Routes") || content.includes("provideRouter") || content.includes("RouterModule");

const analyzeRouteObject = (
  node: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
  filePath: string,
  directory: string,
  diagnostics: Diagnostic[],
): void => {
  let hasPath = false;
  let pathValue = "";
  let hasComponent = false;
  let hasLoadComponent = false;
  let hasChildren = false;
  let hasLoadChildren = false;
  let hasRedirectTo = false;
  let componentName = "";

  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
    const name = prop.name.text;

    if (name === "path" && ts.isStringLiteral(prop.initializer)) {
      hasPath = true;
      pathValue = prop.initializer.text;
    }
    if (name === "component") {
      hasComponent = true;
      componentName = prop.initializer.getText(sourceFile);
    }
    if (name === "loadComponent") hasLoadComponent = true;
    if (name === "children") hasChildren = true;
    if (name === "loadChildren") hasLoadChildren = true;
    if (name === "redirectTo") hasRedirectTo = true;
  }

  if (hasRedirectTo || !hasPath || pathValue === "") return;

  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const relPath = path.relative(directory, filePath);

  if (hasComponent && !hasLoadComponent) {
    diagnostics.push({
      filePath: relPath,
      rule: "eager-route-component",
      category: "performance",
      severity: "warning",
      message: `Route "${pathValue}" eagerly loads ${componentName}. Use loadComponent for lazy loading.`,
      help: `Replace \`component: ${componentName}\` with \`loadComponent: () => import('...').then(m => m.${componentName})\` to reduce initial bundle size.`,
      line,
      column: 1,
      source: "ng-xray",
      stability: "stable",
    });
  }

  if (hasChildren && !hasLoadChildren) {
    diagnostics.push({
      filePath: relPath,
      rule: "eager-route-children",
      category: "performance",
      severity: "warning",
      message: `Route "${pathValue}" eagerly loads children. Use loadChildren for lazy loading.`,
      help: `Replace \`children: [...]\` with \`loadChildren: () => import('...').then(m => m.routes)\` to split this route into a separate bundle.`,
      line,
      column: 1,
      source: "ng-xray",
      stability: "stable",
    });
  }
};

const findRouteArrays = (sourceFile: ts.SourceFile): ts.ArrayLiteralExpression[] => {
  const arrays: ts.ArrayLiteralExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isArrayLiteralExpression(node.initializer)) {
      const typeText = node.type?.getText(sourceFile) ?? "";
      const nameText = node.name.getText(sourceFile);
      if (typeText.includes("Route") || nameText.toLowerCase().includes("route")) {
        arrays.push(node.initializer);
      }
    }
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "children" &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      arrays.push(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return arrays;
};

export const runLazyLoadingAnalyzer = async (directory: string): Promise<Diagnostic[]> => {
  const srcDir = resolveSrcDir(directory);
  const files = walkFiles(srcDir, [".ts"]).filter(isRoutingFile);
  const diagnostics: Diagnostic[] = [];

  for (const filePath of files) {
    try {
      const content = readFileSync(filePath, "utf-8");
      if (!isRouteFile(content)) continue;

      const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
      const routeArrays = findRouteArrays(sourceFile);

      for (const arr of routeArrays) {
        for (const element of arr.elements) {
          if (ts.isObjectLiteralExpression(element)) {
            analyzeRouteObject(element, sourceFile, filePath, directory, diagnostics);
          }
        }
      }
    } catch (error) {
      logger.error(
        `Lazy loading analyzer: failed to read ${filePath} — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return diagnostics;
};
