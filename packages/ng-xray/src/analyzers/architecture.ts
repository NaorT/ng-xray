import { existsSync } from "node:fs";
import path from "node:path";
import type { ICruiseResult } from "dependency-cruiser";
import { Project } from "ts-morph";
import type { ArchitectureAnalyzerConfig, Diagnostic, Severity } from "../types.js";
import { logger } from "../utils/logger.js";
import { runArchitectureRules } from "./architecture-rules.js";
import { getPresetRules } from "./architecture-presets.js";

const HELP: Record<string, string> = {
  "feature-isolation": "Move shared code to `shared/` or `core/`, or create a shared sub-module.",
  "core-shared-boundary": "Move the needed code to `shared/` or `core/`, or refactor the dependency.",
  "circular-dependency": "Break the circular dependency by extracting shared code or using dependency injection.",
};

function buildForbiddenRules(config?: ArchitectureAnalyzerConfig) {
  const featurePaths = config?.featurePaths?.length ? config.featurePaths : ["features"];
  const sharedPaths = config?.sharedPaths?.length ? config.sharedPaths : ["shared", "core"];

  const featurePattern = `(${featurePaths.join("|")})/([^/]+)`;
  const sharedPattern = `(^|/)app/(${sharedPaths.join("|")})/`;

  return [
    {
      name: "feature-isolation",
      severity: "error" as const,
      from: { path: featurePattern },
      to: {
        path: `(${featurePaths.join("|")})/`,
        pathNot: `$1/$2`,
      },
    },
    {
      name: "core-shared-boundary",
      severity: "error" as const,
      from: { path: sharedPattern },
      to: { path: "(^|/)app/features/" },
    },
    {
      name: "circular-dependency",
      severity: "error" as const,
      from: {},
      to: { circular: true },
    },
  ];
}

function resolveTsConfig(directory: string): string | undefined {
  for (const name of ["tsconfig.json", "tsconfig.app.json"]) {
    const full = path.join(directory, name);
    if (existsSync(full)) return full;
  }
  return undefined;
}

function buildMessage(ruleName: string, from: string, to: string, cycle?: { name: string }[]): string {
  switch (ruleName) {
    case "feature-isolation":
      return `Feature module imports from another feature module: ${from} → ${to}. Features must not import from each other.`;
    case "core-shared-boundary":
      return `Shared/core module imports from a feature module: ${from} → ${to}.`;
    case "circular-dependency": {
      const chain = cycle?.length ? cycle.map((c) => c.name).join(" → ") : `${from} → ${to}`;
      return `Circular dependency detected: ${chain}`;
    }
    default:
      return `${ruleName}: ${from} → ${to}`;
  }
}

function normalizedCycleKey(cycle: { name: string }[]): string {
  const names = cycle.map((c) => c.name);
  const min = names.reduce((a, b) => (a < b ? a : b));
  const idx = names.indexOf(min);
  const rotated = [...names.slice(idx), ...names.slice(0, idx)];
  return rotated.join(",");
}

function featureModuleName(relPosix: string, featurePaths: string[]): string | null {
  const parts = relPosix.split("/");
  for (const fp of featurePaths) {
    const idx = parts.indexOf(fp);
    if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];
  }
  return null;
}

/** Fills gaps where dependency-cruiser misses edges (e.g. constructor param types elided under TS 5 emit). */
function appendFeatureIsolationFromProgram(
  directory: string,
  tsConfigFile: string,
  config: ArchitectureAnalyzerConfig | undefined,
  seen: Set<string>,
  diagnostics: Diagnostic[],
): void {
  const featurePaths = config?.featurePaths?.length ? config.featurePaths : ["features"];
  const project = new Project({ tsConfigFilePath: tsConfigFile });

  for (const sourceFile of project.getSourceFiles()) {
    try {
      const absPath = sourceFile.getFilePath();
      if (absPath.includes(`${path.sep}node_modules${path.sep}`)) continue;

      const rel = path.relative(directory, absPath);
      if (rel.startsWith("..")) continue;
      const relPosix = rel.split(path.sep).join("/");

      const fromFeature = featureModuleName(relPosix, featurePaths);
      if (!fromFeature) continue;

      for (const decl of sourceFile.getImportDeclarations()) {
        const targetFile = decl.getModuleSpecifierSourceFile();
        if (!targetFile) continue;

        const targetAbs = targetFile.getFilePath();
        if (targetAbs.includes(`${path.sep}node_modules${path.sep}`)) continue;

        const targetRel = path.relative(directory, targetAbs).split(path.sep).join("/");
        const toFeature = featureModuleName(targetRel, featurePaths);
        if (!toFeature || toFeature === fromFeature) continue;

        const key = `feature-isolation:${relPosix}:${targetRel}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const { line, column } = sourceFile.getLineAndColumnAtPos(decl.getStart());

        diagnostics.push({
          filePath: relPosix,
          rule: "feature-isolation",
          category: "architecture",
          severity: "error",
          message: buildMessage("feature-isolation", relPosix, targetRel),
          help: HELP["feature-isolation"],
          line,
          column,
          source: "ng-xray",
          stability: "stable",
        });
      }
    } catch (error) {
      const filePath = sourceFile.getFilePath?.() ?? "unknown";
      logger.error(
        `Architecture (feature isolation): failed to process ${filePath} — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const runArchitectureAnalyzer = async (
  directory: string,
  config?: ArchitectureAnalyzerConfig,
): Promise<Diagnostic[]> => {
  const srcDir = path.join(directory, "src");
  const scanDir = existsSync(srcDir) ? "src" : ".";
  const tsConfigFile = resolveTsConfig(directory);
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();

  let cruise: typeof import("dependency-cruiser")["cruise"] | undefined;
  try {
    ({ cruise } = await import("dependency-cruiser"));
  } catch {
    logger.debug("dependency-cruiser not installed — skipping circular/boundary analysis via cruise.");
  }

  if (cruise) {
    const forbiddenRules = buildForbiddenRules(config);

    const result = await cruise([scanDir], {
      baseDir: directory,
      validate: true,
      ruleSet: { forbidden: forbiddenRules },
      exclude: { path: "node_modules|dist|\\.git|\\.spec\\.ts$|\\.test\\.ts$" },
      ...(tsConfigFile ? { tsConfig: { fileName: tsConfigFile } } : {}),
    });

    const cruiseResult = result.output as ICruiseResult;
    if (typeof cruiseResult !== "string") {
      for (const violation of cruiseResult.summary.violations) {
        const { name: ruleName, severity: dcSeverity } = violation.rule;
        if (!(ruleName in HELP)) continue;

        const key =
          ruleName === "circular-dependency" && violation.cycle?.length
            ? `circular:${normalizedCycleKey(violation.cycle)}`
            : `${ruleName}:${violation.from}:${violation.to}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const severity: Severity = dcSeverity === "error" ? "error" : "warning";

        diagnostics.push({
          filePath: violation.from,
          rule: ruleName,
          category: "architecture",
          severity,
          message: buildMessage(ruleName, violation.from, violation.to, violation.cycle),
          help: HELP[ruleName],
          line: 1,
          column: 1,
          source: "ng-xray",
          stability: "stable",
        });
      }
    }
  }

  if (tsConfigFile) {
    appendFeatureIsolationFromProgram(directory, tsConfigFile, config, seen, diagnostics);
  }

  const presetRules = config?.preset ? getPresetRules(config.preset) : null;

  const boundaries = [...(presetRules?.boundaries ?? []), ...(config?.boundaries ?? [])];
  const publicApi = [...(presetRules?.publicApi ?? []), ...(config?.publicApi ?? [])];
  const deepImports = [...(presetRules?.deepImports ?? []), ...(config?.deepImports ?? [])];

  if (boundaries.length > 0 || publicApi.length > 0 || deepImports.length > 0) {
    const ruleDiagnostics = runArchitectureRules(directory, boundaries, publicApi, deepImports);
    diagnostics.push(...ruleDiagnostics);
  }

  return diagnostics;
};
