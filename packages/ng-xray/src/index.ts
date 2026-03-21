import path from "node:path";
import { scan } from "./scan.js";
import type {
  Category,
  Diagnostic,
  NgXrayConfig,
  ProjectInfo,
  RemediationItem,
  ScanOptions,
  ScanResult,
  ScoreResult,
  Severity,
  SignalReadinessReport,
} from "./types.js";
import type { HistoryData, HistoryEntry } from "./history.js";

/** Generate a self-contained HTML report file from a scan result. Returns the output file path. */
export { generateHtmlReport } from "./report/html.js";

/** Generate SARIF (Static Analysis Results Interchange Format) output for GitHub Code Scanning integration. */
export { generateSarif } from "./report/sarif.js";

/** Generate a Markdown PR summary suitable for posting as a GitHub PR comment. */
export { generatePrSummary } from "./report/pr-summary.js";

/** Compute the 0-100 health score from diagnostics, applying category/rule caps and density scaling. */
export { calculateScore } from "./scoring/calculate-score.js";

/** Generate a prioritized remediation plan sorted by marginal score impact. */
export { generateRemediation } from "./scoring/calculate-score.js";

/** Save the current diagnostics as a baseline file (.ng-xray-baseline.json) to suppress known issues. */
export { saveBaseline } from "./baseline.js";

/** Load a previously saved baseline, or null if none exists or the version is incompatible. */
export { loadBaseline } from "./baseline.js";

/** Remove the baseline file. Returns true if a file was deleted. */
export { clearBaseline } from "./baseline.js";

/** Load scan history entries from .ng-xray/history.json. */
export { loadHistory } from "./history.js";

/** Append a new scan entry to the history file. */
export { appendHistory } from "./history.js";

/** Remove all scan history. */
export { clearHistory } from "./history.js";

export type {
  Category,
  Diagnostic,
  HistoryData,
  HistoryEntry,
  NgXrayConfig,
  ProjectInfo,
  RemediationItem,
  ScanOptions,
  ScanResult,
  ScoreResult,
  Severity,
  SignalReadinessReport,
};

/** Options for the `diagnose()` programmatic entry point. */
export interface DiagnoseOptions {
  lint?: boolean;
  deadCode?: boolean;
  architecture?: boolean;
  performance?: boolean;
  profile?: "core" | "all";
  noExec?: boolean;
}

/**
 * Run a full ng-xray scan on an Angular project directory.
 * Returns diagnostics, score, remediation, and project metadata.
 * This is the primary programmatic entry point — equivalent to `npx ng-xray` but silent.
 */
export const diagnose = async (directory: string, options: DiagnoseOptions = {}): Promise<ScanResult> => {
  return scan(path.resolve(directory), { ...options }, true);
};
