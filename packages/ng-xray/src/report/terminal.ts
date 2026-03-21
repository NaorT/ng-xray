import { PERFECT_SCORE, SCORE_EXCELLENT_THRESHOLD, SCORE_GOOD_THRESHOLD, VERSION } from "../constants.js";
import type { AnalyzerRunInfo, Diagnostic, ProjectInfo, ScanResult } from "../types.js";
import { logger } from "../utils/logger.js";
import { RULE_DOCS } from "./rule-docs.js";

/* ── 24-bit ANSI helpers ─────────────────────────────────── */

const fg = (r: number, g: number, b: number) => (text: string) => `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;

/* ── Palette (6 intentional colors) ──────────────────────── */

const C = {
  accent: fg(59, 130, 246),
  red: fg(239, 68, 68),
  amber: fg(245, 158, 11),
  green: fg(34, 197, 94),
  zinc4: fg(161, 161, 170),
  zinc6: fg(63, 63, 70),
  white: fg(250, 250, 250),
};

/* ── Helpers ──────────────────────────────────────────────── */

const BAR_W = 25;

const sep = () => logger.log(`  ${C.zinc6("━".repeat(42))}`);

const colorByScore = (text: string, score: number): string => {
  if (score >= SCORE_EXCELLENT_THRESHOLD) return C.accent(text);
  if (score >= SCORE_GOOD_THRESHOLD) return C.amber(text);
  return C.red(text);
};

const renderBar = (value: number, max: number): string => {
  const ratio = max > 0 ? value / max : 0;
  const filled = Math.round(ratio * BAR_W);
  const empty = BAR_W - filled;
  const pct = Math.round(ratio * PERFECT_SCORE);
  const barColor = pct >= SCORE_EXCELLENT_THRESHOLD ? C.green : pct >= SCORE_GOOD_THRESHOLD ? C.amber : C.red;
  return barColor("█".repeat(filled)) + C.zinc6("░".repeat(empty));
};

const pad = (s: string, n: number) => s.padEnd(n);

const fmtMinutes = (mins: number): string => {
  if (mins < 60) return `~${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `~${h}h ${m}m` : `~${h}h`;
};

/* ── Exports ─────────────────────────────────────────────── */

export const printHeader = (): void => {
  logger.break();
  logger.log(`  ${C.accent("ng-xray")} ${C.zinc4(`v${VERSION}`)}`);
};

export const printProjectInfo = (project: ProjectInfo): void => {
  logger.break();
  const displayPath = `./${project.projectName || "src"}`;
  logger.log(`  ${C.white(displayPath)}`);

  const parts: string[] = [];
  if (project.angularVersion) parts.push(`Angular ${C.white(project.angularVersion)}`);
  parts.push(`${project.sourceFileCount} files`);
  parts.push(`${project.componentCount} components`);
  parts.push(`${project.serviceCount} services`);
  parts.push(`${project.standalonePercentage}% standalone`);
  logger.log(`  ${C.zinc4(parts.join(" · "))}`);

  logger.break();
  sep();
};

export const printDiagnostics = (diagnostics: Diagnostic[], verbose: boolean): void => {
  logger.break();

  const byCategory = new Map<string, Diagnostic[]>();
  for (const diag of diagnostics) {
    const list = byCategory.get(diag.category) ?? [];
    list.push(diag);
    byCategory.set(diag.category, list);
  }

  const categories = ["security", "architecture", "performance", "best-practices", "dead-code"];

  for (const cat of categories) {
    const diags = byCategory.get(cat) ?? [];
    const errors = diags.filter((d) => d.severity === "error").length;
    const warnings = diags.filter((d) => d.severity === "warning").length;

    let dot: string;
    let status: string;
    if (diags.length === 0) {
      dot = C.green("●");
      status = C.green("passed");
    } else if (errors === 0) {
      dot = C.amber("●");
      status = C.amber(`${warnings} warning${warnings !== 1 ? "s" : ""}`);
    } else {
      dot = C.red("●");
      const parts: string[] = [];
      if (errors > 0) parts.push(`${errors} error${errors !== 1 ? "s" : ""}`);
      if (warnings > 0) parts.push(`${warnings} warning${warnings !== 1 ? "s" : ""}`);
      status = C.red(parts.join(", "));
    }

    logger.log(`  ${dot}  ${C.white(pad(cat, 18))} ${status}`);

    if (verbose && diags.length > 0) {
      const grouped = new Map<string, Diagnostic[]>();
      for (const d of diags) {
        const list = grouped.get(d.rule) ?? [];
        list.push(d);
        grouped.set(d.rule, list);
      }
      for (const [rule, ruleDiags] of grouped) {
        const first = ruleDiags[0];
        const expTag = first.stability === "experimental" ? C.zinc6(" [experimental]") : "";
        const srcTag = C.zinc6(` [${first.source}]`);
        const provenanceTag = first.provenance ? C.zinc6(` [${first.provenance}]`) : "";
        const trustTag =
          first.includedInScore === false ? C.zinc6(" [advisory]") : first.trust === "core" ? C.zinc6(" [core]") : "";
        logger.log(
          C.zinc4(`       ${rule}  ${C.zinc6(`(${ruleDiags.length})`)}${srcTag}${provenanceTag}${trustTag}${expTag}`),
        );
        for (const d of ruleDiags.slice(0, 5)) {
          logger.log(C.zinc6(`         ${d.filePath}:${d.line}`));
        }
        if (ruleDiags.length > 5) {
          logger.log(C.zinc6(`         + ${ruleDiags.length - 5} more`));
        }
      }
    }
  }

  logger.break();
};

export const printSummary = (result: ScanResult): void => {
  const { score } = result;
  const profile = result.profile ?? "core";
  const advisoryCount = result.advisoryDiagnosticsCount ?? 0;
  const excludedCount = result.excludedDiagnosticsCount ?? 0;

  sep();
  logger.break();

  const scoreStr = colorByScore(String(score.overall), score.overall);
  const label = colorByScore(score.label.toUpperCase(), score.overall);
  const partial = result.scanStatus === "partial" ? C.amber(" (partial)") : "";
  logger.log(`  ${scoreStr}${C.zinc4("/100")}  ${label}${partial}`);
  const profileMeta =
    advisoryCount > 0
      ? `${advisoryCount} advisory${excludedCount > 0 ? `, ${excludedCount} excluded` : ""}`
      : "no advisory findings";
  logger.log(`  ${C.zinc4("Score profile")}  ${C.white(profile)}${C.zinc4(`  (${profileMeta})`)}`);
  logger.break();

  for (const cat of score.categories) {
    const catScore = cat.maxDeduction - cat.deduction;
    const bar = renderBar(catScore, cat.maxDeduction);
    const name = C.zinc4(cat.label.toLowerCase().padEnd(18));
    const pct = cat.maxDeduction > 0 ? Math.round((catScore / cat.maxDeduction) * PERFECT_SCORE) : 0;
    const num = colorByScore(`${catScore}/${cat.maxDeduction}`, pct);

    logger.log(`    ${name}${bar}  ${num}`);
  }

  logger.break();
};

export const printRemediation = (result: ScanResult): void => {
  if (result.remediation.length === 0) return;

  sep();
  logger.break();
  logger.log(`  ${C.white("Top fixes")}`);
  logger.break();

  const topItems = result.remediation.slice(0, 6);

  for (let i = 0; i < topItems.length; i++) {
    const item = topItems[i];
    const num = C.zinc6(String(i + 1).padStart(2));

    const dot = item.priority === "high" ? C.red("●") : item.priority === "medium" ? C.amber("●") : C.green("○");

    const desc = item.description.length > 38 ? item.description.slice(0, 37) + "…" : item.description;

    const rd = RULE_DOCS[item.rule];
    const mins = rd ? rd.estimatedMinutes * item.affectedFileCount : item.affectedFileCount * 5;

    const impact =
      item.includedInScore === false ? " advisory" : `+${String(item.estimatedScoreImpact).padStart(2)} pts`;
    const meta = C.zinc4(
      `${impact}  ${String(item.affectedFileCount).padStart(3)} files  ${fmtMinutes(mins).padStart(7)}`,
    );

    logger.log(`  ${num}  ${dot}  ${C.white(pad(desc, 38))} ${meta}`);
  }

  logger.break();
};

export const printAnalyzerSummary = (result: ScanResult, verbose: boolean): void => {
  const runs = result.analyzerRuns;
  if (!runs.length) return;

  const ran = runs.filter((a: AnalyzerRunInfo) => a.status === "ran").length;
  const skipped = runs.filter((a: AnalyzerRunInfo) => a.status === "skipped").length;
  const failed = runs.filter((a: AnalyzerRunInfo) => a.status === "failed").length;

  const parts: string[] = [`${ran} ran`];
  if (skipped > 0) parts.push(`${skipped} skipped`);
  if (failed > 0) parts.push(`${failed} failed`);

  logger.log(`  ${C.zinc4("Analyzers")}  ${C.white(parts.join(", "))}`);

  if (verbose) {
    for (const a of runs) {
      const statusStr =
        a.status === "ran" ? C.green("ran") : a.status === "failed" ? C.red("failed") : C.zinc6("skipped");
      const dur = a.status === "skipped" ? "" : C.zinc6(` ${(a.durationMs / 1000).toFixed(1)}s`);
      const count = a.status === "skipped" ? "" : C.zinc4(` ${a.findingsCount} findings`);
      const exp = a.experimental ? C.zinc6(" [experimental]") : "";
      logger.log(`    ${C.zinc4(a.label.padEnd(22))} ${statusStr}${count}${dur}${exp}`);
    }
  }

  logger.break();
};

export const printReportLink = (reportPath: string): void => {
  sep();
  logger.break();
  logger.log(`  ${C.white("Report")}  ${C.accent(`\x1b[4m${reportPath}\x1b[24m`)}`);
  logger.break();
};

export const printElapsed = (elapsedMs: number): void => {
  const secs = (elapsedMs / 1000).toFixed(1);
  logger.log(`  ${C.zinc6(`${secs}s`)}`);
  logger.break();
};

export const printScoreOnly = (score: number): void => {
  console.log(score);
};
