import { readFileSync } from "node:fs";
import path from "node:path";
import type ts from "typescript";
import { Project, Node } from "ts-morph";
import type { Diagnostic } from "../types.js";
import { logger } from "../utils/logger.js";
import { resolveSrcDir } from "../utils/resolve-src.js";
import { walkFiles } from "../utils/walk.js";

const DEFAULT_COMPONENT_LOC_THRESHOLD = 300;

const checkMissingOnPush = (
  filePath: string,
  sourceFile: ReturnType<Project["createSourceFile"]>,
): Diagnostic | null => {
  if (!filePath.endsWith(".component.ts")) return null;

  for (const classDecl of sourceFile.getClasses()) {
    const componentDecorator = classDecl.getDecorator("Component");
    if (!componentDecorator) continue;

    const args = componentDecorator.getArguments();
    if (args.length === 0) continue;

    const firstArg = args[0];
    if (!Node.isObjectLiteralExpression(firstArg)) continue;

    const changeDetectionProp = firstArg.getProperty("changeDetection");
    if (changeDetectionProp) continue;

    return {
      filePath,
      rule: "missing-onpush",
      category: "performance",
      severity: "warning",
      message: "Component does not use OnPush change detection strategy.",
      help: "Add `changeDetection: ChangeDetectionStrategy.OnPush` to the @Component decorator to improve performance.",
      line: classDecl.getStartLineNumber(),
      column: 1,
      source: "ng-xray",
      stability: "stable",
    };
  }

  return null;
};

const checkLargeComponent = (filePath: string, content: string, threshold: number): Diagnostic | null => {
  if (!filePath.endsWith(".component.ts")) return null;

  const lineCount = content.split("\n").length;
  if (lineCount <= threshold) return null;

  return {
    filePath,
    rule: "large-component",
    category: "performance",
    severity: "warning",
    message: `Component has ${lineCount} lines (threshold: ${threshold}). Large components are harder to maintain and slower to compile.`,
    help: "Break this component into smaller, focused child components.",
    line: 1,
    column: 1,
    source: "ng-xray",
    stability: "stable",
  };
};

const checkHeavyConstructor = (
  filePath: string,
  sourceFile: ReturnType<Project["createSourceFile"]>,
): Diagnostic | null => {
  for (const classDecl of sourceFile.getClasses()) {
    for (const ctor of classDecl.getConstructors()) {
      const body = (ctor.compilerNode as ts.ConstructorDeclaration).body;
      const statementCount = body ? body.statements.length : 0;

      if (statementCount <= 5) continue;

      return {
        filePath,
        rule: "heavy-constructor",
        category: "performance",
        severity: "warning",
        message: `Constructor has ${statementCount} statements. Heavy constructors slow down component creation.`,
        help: "Move initialization logic to ngOnInit or dedicated methods. Use inject() instead of constructor injection.",
        line: ctor.getStartLineNumber(),
        column: 1,
        source: "ng-xray",
        stability: "stable",
      };
    }
  }

  return null;
};

const checkBarrelBloat = (
  filePath: string,
  sourceFile: ReturnType<Project["createSourceFile"]>,
): Diagnostic | null => {
  if (!filePath.endsWith("index.ts")) return null;

  const exportDecls = sourceFile.getExportDeclarations();
  const exportedDeclarations = sourceFile.getExportedDeclarations();
  const totalExports = exportDecls.length + exportedDeclarations.size;
  if (totalExports <= 10) return null;

  const hasWildcard = exportDecls.some((d) => !d.hasNamedExports() && !d.isTypeOnly());
  if (!hasWildcard) return null;

  return {
    filePath,
    rule: "barrel-re-export-bloat",
    category: "performance",
    severity: "warning",
    message: `Barrel file with ${totalExports} exports including wildcard re-exports. This can prevent tree-shaking.`,
    help: "Use specific named exports instead of `export *` to enable proper tree-shaking.",
    line: 1,
    column: 1,
    source: "ng-xray",
    stability: "stable",
  };
};

export const runPerformanceAnalyzer = async (
  directory: string,
  options?: { componentLocThreshold?: number },
  prebuiltMorphProject?: Project,
): Promise<Diagnostic[]> => {
  const threshold = options?.componentLocThreshold ?? DEFAULT_COMPONENT_LOC_THRESHOLD;
  const diagnostics: Diagnostic[] = [];
  const morphProject = prebuiltMorphProject ?? new Project({ useInMemoryFileSystem: true });

  const targetDir = resolveSrcDir(directory);
  const tsFiles = walkFiles(targetDir, [".ts"]);

  for (const filePath of tsFiles) {
    try {
      const content = readFileSync(filePath, "utf-8");
      const relPath = path.relative(directory, filePath);

      const sourceFile = morphProject.createSourceFile(filePath, content, { overwrite: true });

      const onPush = checkMissingOnPush(relPath, sourceFile);
      if (onPush) diagnostics.push(onPush);

      const largeComp = checkLargeComponent(relPath, content, threshold);
      if (largeComp) diagnostics.push(largeComp);

      const heavyCtor = checkHeavyConstructor(relPath, sourceFile);
      if (heavyCtor) diagnostics.push(heavyCtor);

      const barrel = checkBarrelBloat(relPath, sourceFile);
      if (barrel) diagnostics.push(barrel);
    } catch (error) {
      logger.error(
        `Performance analyzer: failed to read ${filePath} — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return diagnostics;
};
