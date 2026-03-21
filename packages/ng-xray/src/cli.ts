#!/usr/bin/env node

import path from "node:path";
import { Command } from "commander";
import { EXIT_CODES, VERSION } from "./constants.js";
import { applyOutputSideEffects, type OutputMode } from "./cli-output.js";
import { discoverProject } from "./detection/discover-project.js";
import { detectWorkspace, resolveProjectDirectory, resolveWorkspaceProject } from "./detection/detect-workspace.js";
import { generateHtmlReport } from "./report/html.js";
import { generateSarif } from "./report/sarif.js";
import { generatePrSummary } from "./report/pr-summary.js";
import {
  printAnalyzerSummary,
  printHeader,
  printDiagnostics,
  printProjectInfo,
  printRemediation,
  printReportLink,
  printScoreOnly,
  printSummary,
  printElapsed,
} from "./report/terminal.js";
import { scan } from "./scan.js";
import { saveBaseline, clearBaseline } from "./baseline.js";
import { appendHistory, clearHistory, loadHistory, getHistoryDelta } from "./history.js";
import type { ScanOptions } from "./types.js";
import { normalizeScanProfile } from "./trust.js";
import { logger } from "./utils/logger.js";

interface CliFlags {
  lint?: boolean;
  deadCode?: boolean;
  architecture?: boolean;
  performance?: boolean;
  profile?: string;
  verbose: boolean;
  score: boolean;
  json: boolean;
  sarif: boolean;
  prSummary: boolean;
  open: boolean;
  output?: string;
  watch: boolean;
  failUnder?: number;
  project?: string;
  ignoreBaseline: boolean;
  noExec: boolean;
  quiet: boolean;
}

const getOutputMode = (flags: CliFlags): OutputMode => {
  if (flags.score) return "score";
  if (flags.json) return "json";
  if (flags.sarif) return "sarif";
  if (flags.prSummary) return "pr-summary";
  return "terminal";
};

const program = new Command()
  .name("ng-xray")
  .description("Diagnose Angular project health")
  .version(VERSION, "-v, --version");

program
  .argument("[directory]", "project directory to scan", ".")
  .option("--lint", "run lint checks")
  .option("--no-lint", "skip lint checks")
  .option("--dead-code", "run dead code checks")
  .option("--no-dead-code", "skip dead code detection")
  .option("--architecture", "run architecture checks")
  .option("--no-architecture", "skip architecture checks")
  .option("--performance", "run performance checks")
  .option("--no-performance", "skip performance checks")
  .option("--profile <profile>", "score profile: core (default) or all")
  .option("--verbose", "show file details per rule", false)
  .option("--score", "output only the score", false)
  .option("--json", "output full results as JSON", false)
  .option("--sarif", "output results as SARIF 2.1.0 JSON for GitHub Code Scanning", false)
  .option("--pr-summary", "output results as PR comment markdown", false)
  .option("--open", "open HTML report in browser after scan", false)
  .option("--output <path>", "write HTML report to this path instead of tmpdir")
  .option("--watch", "watch for changes and re-scan", false)
  .option("--fail-under <score>", "exit with code 3 if score is below threshold", parseFloat)
  .option("--project <name>", "scan a specific project in an Angular workspace")
  .option("--ignore-baseline", "ignore baseline, show all issues", false)
  .option("--no-exec", "disable analyzers that execute third-party tools (ngc, eslint, knip)", false)
  .option("--quiet", "suppress all output except the summary line", false)
  .action(async (directory: string, flags: CliFlags) => {
    try {
      const resolvedDir = path.resolve(directory);
      const workspace = detectWorkspace(resolvedDir);
      const outputMode = getOutputMode(flags);
      const workspaceProject = resolveWorkspaceProject(workspace, flags.project);

      if (workspace.projects.length > 1 && !flags.project) {
        const names = workspace.projects.map((p) => p.name).join(", ");
        logger.warn(`Workspace with ${workspace.projects.length} projects detected: ${names}`);
        logger.warn("Use --project <name> to scan a specific project. Scanning default project.");
        logger.break();
      }

      const scanDir = workspace.projects.length > 1 ? resolveProjectDirectory(workspace, flags.project) : resolvedDir;

      const scanOptions: ScanOptions = {
        lint: flags.lint,
        deadCode: flags.deadCode,
        architecture: flags.architecture,
        performance: flags.performance,
        profile: normalizeScanProfile(flags.profile),
        verbose: flags.verbose,
        ignoreBaseline: flags.ignoreBaseline,
        noExec: flags.noExec,
      };

      if (flags.watch) {
        const { startWatch } = await import("./watch.js");
        await startWatch(scanDir, scanOptions, workspaceProject.sourceRoot);
        return;
      }

      if (flags.score) {
        const result = await scan(scanDir, scanOptions, true);
        printScoreOnly(result.score.overall);
        if (result.scanStatus === "partial") process.exit(EXIT_CODES.PARTIAL_SCAN);
        return;
      }

      if (flags.json) {
        const result = await scan(scanDir, scanOptions, true);
        console.log(JSON.stringify(result, null, 2));
        if (result.scanStatus === "partial") process.exit(EXIT_CODES.PARTIAL_SCAN);
        return;
      }

      if (flags.sarif) {
        const result = await scan(scanDir, scanOptions, true);
        console.log(generateSarif(result));
        if (result.scanStatus === "partial") process.exit(EXIT_CODES.PARTIAL_SCAN);
        return;
      }

      if (flags.prSummary) {
        const result = await scan(scanDir, scanOptions, true);
        console.log(generatePrSummary(result));
        if (result.scanStatus === "partial") process.exit(EXIT_CODES.PARTIAL_SCAN);
        return;
      }

      const quiet = flags.quiet;

      if (!quiet) printHeader();

      const project = discoverProject(scanDir);

      if (!project.angularVersion) {
        logger.error("No @angular/core found in package.json. Is this an Angular project?");
        process.exit(EXIT_CODES.FATAL);
      }

      if (!quiet) printProjectInfo(project);

      const result = await scan(scanDir, scanOptions, quiet);

      const historyBefore = loadHistory(resolvedDir);
      const deltaBefore = getHistoryDelta(historyBefore, result.profile ?? "core");

      const reportPath = applyOutputSideEffects(outputMode, {
        appendHistory: () => appendHistory(resolvedDir, result),
        generateHtmlReport: () => generateHtmlReport(result, loadHistory(resolvedDir), flags.output),
        printReportLink: quiet ? () => {} : printReportLink,
      });

      const history = loadHistory(resolvedDir);
      const delta = getHistoryDelta(history, result.profile ?? "core") ?? deltaBefore;

      if (!quiet && result.diagnostics.length > 0) {
        printDiagnostics(result.diagnostics, flags.verbose);
      }

      printSummary(result);

      if (!quiet) {
        printAnalyzerSummary(result, flags.verbose);

        if (delta) {
          const scoreSym = delta.scoreDelta >= 0 ? "+" : "";
          const issuesSym = delta.issuesDelta >= 0 ? "+" : "";
          logger.log(`  ${scoreSym}${delta.scoreDelta} pts, ${issuesSym}${delta.issuesDelta} issues since last scan`);
          logger.break();
        }

        printRemediation(result);
      }

      if (result.failedAnalyzers.length > 0) {
        logger.break();
        logger.warn(`  ⚠ Partial scan — ${result.failedAnalyzers.length} analyzer(s) failed:`);
        for (const name of result.failedAnalyzers) {
          logger.warn(`    • ${name}`);
        }
        logger.warn("  Score may not reflect full project health.");
        logger.break();
      }

      if (reportPath && flags.open) {
        try {
          const open = (await import("open")).default;
          await open(reportPath);
        } catch (error) {
          logger.debug(`Could not open report: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (!quiet) printElapsed(result.elapsedMs);

      if (result.scanStatus === "partial") {
        process.exit(EXIT_CODES.PARTIAL_SCAN);
      }

      if (flags.failUnder != null && result.score.overall < flags.failUnder) {
        logger.error(`Score ${result.score.overall} is below threshold ${flags.failUnder}.`);
        process.exit(EXIT_CODES.THRESHOLD_FAILURE);
      }
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(EXIT_CODES.FATAL);
    }
  });

program
  .command("baseline [directory]")
  .description("Save current issues as baseline (future runs only show new issues)")
  .option("--clear", "remove existing baseline file")
  .option("--update", "alias for saving a new baseline")
  .action(async (directory: string = ".", flags: { clear?: boolean }) => {
    try {
      const resolvedDir = path.resolve(directory);

      if (flags.clear) {
        const removed = clearBaseline(resolvedDir);
        logger.log(removed ? "Baseline cleared." : "No baseline file found.");
        return;
      }

      logger.log("Running full scan for baseline...");
      const result = await scan(resolvedDir, {}, true);
      const filePath = saveBaseline(resolvedDir, result.diagnostics, result.score.overall);
      logger.success(`Baseline saved: ${result.diagnostics.length} issues fingerprinted.`);
      logger.dim(`  File: ${filePath}`);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(EXIT_CODES.FATAL);
    }
  });

program
  .command("history [directory]")
  .description("Manage scan history")
  .option("--clear", "clear scan history")
  .action(async (directory: string = ".", flags: { clear?: boolean }) => {
    try {
      const resolvedDir = path.resolve(directory);

      if (flags.clear) {
        const cleared = clearHistory(resolvedDir);
        logger.log(cleared ? "History cleared." : "No history file found.");
        return;
      }

      const history = loadHistory(resolvedDir);
      if (history.entries.length === 0) {
        logger.log("No scan history yet. Run a scan first.");
        return;
      }

      logger.log(`Scan history: ${history.entries.length} entries`);
      const recent = history.entries.slice(-5);
      for (const entry of recent) {
        const date = new Date(entry.timestamp).toLocaleDateString();
        const profileLabel = entry.profile ?? "core";
        logger.log(
          `  ${date}  Score: ${entry.score}  Issues: ${entry.totalIssues}  Profile: ${profileLabel}  (${Math.round((entry.elapsedMs / 1000) * 10) / 10}s)`,
        );
      }
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(EXIT_CODES.FATAL);
    }
  });

program.parseAsync();
