import { performance } from "node:perf_hooks";
import picomatch from "picomatch";
import { runAngularDiagnosticsAnalyzer } from "./analyzers/angular-diagnostics.js";
import { runArchitectureAnalyzer } from "./analyzers/architecture.js";
import { runBestPracticesAnalyzer } from "./analyzers/best-practices.js";
import { runDeadCodeAnalyzer } from "./analyzers/dead-code.js";
import { runAngularDeadCodeAnalyzer } from "./analyzers/dead-code-angular.js";
import { runDeadMembersAnalyzer } from "./analyzers/dead-members.js";
import { runLintAnalyzer } from "./analyzers/lint.js";
import { runPerformanceAnalyzer } from "./analyzers/performance.js";
import { runLazyLoadingAnalyzer } from "./analyzers/lazy-loading.js";
import { runCircularInjectionAnalyzer } from "./analyzers/circular-injection.js";
import { runSecurityAnalyzer } from "./analyzers/security.js";
import { analyzeSignalReadiness, runSignalReadinessAnalyzer } from "./analyzers/signal-readiness.js";
import { EXPERIMENTAL_ANALYZERS } from "./constants.js";
import { discoverProject } from "./detection/discover-project.js";
import { calculateScore, generateRemediation } from "./scoring/calculate-score.js";
import { Project } from "ts-morph";
import type {
  AnalyzerRunInfo,
  ArchitectureAnalyzerConfig,
  Diagnostic,
  NgXrayConfig,
  ScanOptions,
  ScanResult,
  SignalReadinessReport,
} from "./types.js";
import { loadConfigWithPath } from "./utils/load-config.js";
import { logger } from "./utils/logger.js";
import { buildProjectClassMap, type ProjectClassMap } from "./utils/inheritance-resolver.js";
import { buildProjectTemplateMap, type ProjectTemplateMap } from "./utils/template-parser.js";
import { createSpinner } from "./utils/spinner.js";
import { loadBaseline, subtractBaseline } from "./baseline.js";
import { classifyDiagnostic, normalizeScanProfile, shouldIncludeInScore } from "./trust.js";

interface AnalyzerDef {
  id: string;
  label: string;
  enabled: boolean;
  run: (signal?: AbortSignal) => Promise<Diagnostic[]>;
}

const ANGULAR_ESLINT_OVERLAP: Record<string, string> = {
  NG8101: "@angular-eslint/template/banana-in-box",
};

const dedupeAngularOverlaps = (diagnostics: Diagnostic[]): Diagnostic[] => {
  const angularKeys = new Set<string>();
  for (const d of diagnostics) {
    if (d.source !== "angular") continue;
    const eslintRule = ANGULAR_ESLINT_OVERLAP[d.rule];
    if (eslintRule) {
      angularKeys.add(`${d.filePath}:${d.line}:${eslintRule}`);
    }
  }
  if (angularKeys.size === 0) return diagnostics;
  return diagnostics.filter((d) => {
    if (d.source === "angular") return true;
    return !angularKeys.has(`${d.filePath}:${d.line}:${d.rule}`);
  });
};

const filterDiagnostics = (diagnostics: Diagnostic[], config: NgXrayConfig | null): Diagnostic[] => {
  if (!config?.ignore) return diagnostics;

  const ignoredRules = new Set(config.ignore.rules ?? []);
  const ignoredFilePatterns = config.ignore.files ?? [];
  const isIgnoredFile = ignoredFilePatterns.length > 0 ? picomatch(ignoredFilePatterns) : null;

  return diagnostics.filter((diag) => {
    if (ignoredRules.has(diag.rule)) return false;
    if (isIgnoredFile?.(diag.filePath)) return false;
    return true;
  });
};

interface SharedContext {
  classMap: ProjectClassMap;
  templateMap: ProjectTemplateMap;
  morphProject: Project;
}

const buildSharedMaps = (directory: string, silent: boolean): SharedContext | null => {
  const spinner = silent ? null : createSpinner("Building class & template maps...");
  spinner?.start();

  try {
    const classMap = buildProjectClassMap(directory);
    const templateMap = buildProjectTemplateMap(directory);
    const morphProject = new Project({ useInMemoryFileSystem: true });
    spinner?.succeed("Building class & template maps.");
    return { classMap, templateMap, morphProject };
  } catch (error) {
    spinner?.fail("Class & template map build failed.");
    logger.error(`Class & template map build: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

const getArchitectureAnalyzerConfig = (config: NgXrayConfig | null): ArchitectureAnalyzerConfig | undefined =>
  config?.architecture != null && typeof config.architecture === "object" ? config.architecture : undefined;

const resolveBooleanOption = (option: boolean | undefined, configValue: boolean | undefined): boolean | undefined =>
  typeof option === "boolean" ? option : configValue;

export const scan = async (directory: string, options: ScanOptions = {}, silent = false): Promise<ScanResult> => {
  const timestamp = new Date().toISOString();
  const startTime = performance.now();
  const profile = normalizeScanProfile(options.profile);
  const project = discoverProject(directory);
  const { config, configPath } = loadConfigWithPath(directory);
  const architectureConfig = getArchitectureAnalyzerConfig(config);

  const noExec = options.noExec === true;

  const effective = {
    lint: noExec ? false : resolveBooleanOption(options.lint, config?.lint),
    deadCode: resolveBooleanOption(options.deadCode, config?.deadCode),
    deadCodeGeneric: noExec ? false : resolveBooleanOption(options.deadCode, config?.deadCode),
    architecture:
      typeof options.architecture === "boolean"
        ? options.architecture
        : typeof config?.architecture === "boolean"
          ? config.architecture
          : undefined,
    performance: resolveBooleanOption(options.performance, config?.performance),
  };

  if (!project.angularVersion) {
    throw new Error("No @angular/core dependency found in package.json. Is this an Angular project?");
  }

  const sharedMaps = effective.deadCode !== false ? buildSharedMaps(directory, silent) : null;
  if (!sharedMaps && effective.deadCode !== false) {
    logger.warn("Class & template maps unavailable — some analyzers will build their own or return partial results.");
  }
  const sharedMorphProject = sharedMaps?.morphProject ?? new Project({ useInMemoryFileSystem: true });

  const analyzers: AnalyzerDef[] = [
    {
      id: "angular-diagnostics",
      label: "Angular diagnostics",
      enabled: !noExec,
      run: (signal) => runAngularDiagnosticsAnalyzer(directory, signal),
    },
    {
      id: "lint",
      label: "Lint checks",
      enabled: effective.lint !== false,
      run: () => runLintAnalyzer(directory),
    },
    {
      id: "dead-code-generic",
      label: "Dead code (generic)",
      enabled: effective.deadCodeGeneric !== false,
      run: (signal) => runDeadCodeAnalyzer(directory, signal),
    },
    {
      id: "dead-code-angular",
      label: "Dead code (Angular)",
      enabled: effective.deadCode !== false,
      run: () => runAngularDeadCodeAnalyzer(directory, sharedMaps?.classMap, sharedMaps?.templateMap),
    },
    {
      id: "dead-class-members",
      label: "Dead class members",
      enabled: effective.deadCode !== false,
      run: () => runDeadMembersAnalyzer(directory, sharedMaps?.classMap, sharedMaps?.templateMap),
    },
    {
      id: "performance",
      label: "Performance",
      enabled: effective.performance !== false,
      run: () =>
        runPerformanceAnalyzer(
          directory,
          {
            componentLocThreshold: config?.thresholds?.["component-loc"],
          },
          sharedMorphProject,
        ),
    },
    {
      id: "lazy-loading",
      label: "Lazy loading",
      enabled: effective.performance !== false,
      run: () => runLazyLoadingAnalyzer(directory),
    },
    {
      id: "architecture",
      label: "Architecture",
      enabled: effective.architecture !== false,
      run: () => runArchitectureAnalyzer(directory, architectureConfig),
    },
    {
      id: "circular-injection",
      label: "Circular injection",
      enabled: effective.architecture !== false,
      run: () => runCircularInjectionAnalyzer(directory, sharedMaps?.classMap),
    },
    {
      id: "best-practices",
      label: "Best practices",
      enabled: true,
      run: () => runBestPracticesAnalyzer(directory, sharedMorphProject),
    },
    {
      id: "security",
      label: "Security",
      enabled: true,
      run: () => runSecurityAnalyzer(directory, sharedMorphProject),
    },
    {
      id: "signal-readiness",
      label: "Signal readiness",
      enabled: true,
      run: () => runSignalReadinessAnalyzer(directory),
    },
  ];

  const analyzerRuns: AnalyzerRunInfo[] = [];
  const failedAnalyzers: string[] = [];
  const enabledAnalyzers = analyzers.filter((a) => a.enabled);

  for (const a of analyzers) {
    if (!a.enabled) {
      analyzerRuns.push({
        id: a.id,
        label: a.label,
        status: "skipped",
        findingsCount: 0,
        durationMs: 0,
        experimental: EXPERIMENTAL_ANALYZERS.has(a.id),
        skipReason: "disabled",
      });
    }
  }

  const ANALYZER_TIMEOUT_MS = 120_000;

  const withTimeout = <T>(
    promise: Promise<T>,
    ms: number,
    label: string,
    onTimeout?: () => void,
  ): Promise<T> => {
    let timer: ReturnType<typeof setTimeout>;
    return Promise.race([
      promise.finally(() => clearTimeout(timer)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          onTimeout?.();
          reject(new Error(`${label} timed out after ${ms / 1000}s`));
        }, ms);
      }),
    ]);
  };

  const results = await Promise.all(
    enabledAnalyzers.map(async (analyzer) => {
      const spinner = silent ? null : createSpinner(`Running ${analyzer.label}...`);
      spinner?.start();
      const t0 = performance.now();
      const controller = new AbortController();
      try {
        const diagnostics = await withTimeout(
          analyzer.run(controller.signal),
          ANALYZER_TIMEOUT_MS,
          analyzer.label,
          () => controller.abort(),
        );
        const durationMs = performance.now() - t0;
        spinner?.succeed(`Running ${analyzer.label}.`);
        analyzerRuns.push({
          id: analyzer.id,
          label: analyzer.label,
          status: "ran",
          findingsCount: diagnostics.length,
          durationMs,
          experimental: EXPERIMENTAL_ANALYZERS.has(analyzer.id),
        });
        return diagnostics;
      } catch (error) {
        const durationMs = performance.now() - t0;
        const msg = error instanceof Error ? error.message : String(error);
        spinner?.fail(`${analyzer.label} failed.`);
        logger.error(`${analyzer.label}: ${msg}`);
        failedAnalyzers.push(analyzer.label);
        analyzerRuns.push({
          id: analyzer.id,
          label: analyzer.label,
          status: "failed",
          findingsCount: 0,
          durationMs,
          experimental: EXPERIMENTAL_ANALYZERS.has(analyzer.id),
          errorMessage: msg,
        });
        return [] as Diagnostic[];
      }
    }),
  );

  let allDiagnostics = dedupeAngularOverlaps(filterDiagnostics(results.flat(), config));

  if (!options.ignoreBaseline) {
    const baseline = loadBaseline(directory);
    if (baseline) {
      const before = allDiagnostics.length;
      allDiagnostics = subtractBaseline(allDiagnostics, baseline);
      if (!silent) {
        const suppressed = before - allDiagnostics.length;
        if (suppressed > 0) {
          logger.dim(`  Baseline: ${suppressed} known issues suppressed.`);
        }
      }
    }
  }

  let signalReadiness: SignalReadinessReport | undefined;
  try {
    signalReadiness = analyzeSignalReadiness(directory);
  } catch (error) {
    logger.debug(`Signal readiness report: ${error instanceof Error ? error.message : String(error)}`);
  }

  allDiagnostics.sort(
    (a, b) => a.filePath.localeCompare(b.filePath) || a.line - b.line || a.rule.localeCompare(b.rule),
  );

  allDiagnostics = allDiagnostics.map((diagnostic) => {
    const classified = classifyDiagnostic(diagnostic);
    return {
      ...classified,
      includedInScore: shouldIncludeInScore(classified, profile),
    };
  });

  const analyzerOrder = new Map(analyzers.map((a, i) => [a.id, i]));
  analyzerRuns.sort((a, b) => (analyzerOrder.get(a.id) ?? Infinity) - (analyzerOrder.get(b.id) ?? Infinity));

  const scoredDiagnostics = allDiagnostics.filter((diagnostic) => diagnostic.includedInScore);
  const advisoryDiagnosticsCount = allDiagnostics.filter((diagnostic) => diagnostic.trust === "advisory").length;
  const excludedDiagnosticsCount = allDiagnostics.filter((diagnostic) => diagnostic.includedInScore === false).length;

  const score = calculateScore(scoredDiagnostics, {
    fileCount: project.sourceFileCount,
  });
  const remediation = generateRemediation(allDiagnostics, {
    fileCount: project.sourceFileCount,
  });
  const elapsedMs = performance.now() - startTime;

  return {
    scanStatus: failedAnalyzers.length > 0 ? "partial" : "complete",
    failedAnalyzers,
    diagnostics: allDiagnostics,
    score,
    project,
    remediation,
    elapsedMs,
    signalReadiness,
    timestamp,
    configPath,
    analyzerRuns,
    profile,
    scoredDiagnosticsCount: scoredDiagnostics.length,
    advisoryDiagnosticsCount,
    excludedDiagnosticsCount,
  };
};
