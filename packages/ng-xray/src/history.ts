import type { ScanProfile } from "./types.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { ScanResult } from "./types.js";

const HISTORY_DIR = ".ng-xray";
const HISTORY_FILENAME = "history.json";
const MAX_ENTRIES = 100;

export interface HistoryEntry {
  timestamp: string;
  score: number;
  categories: Record<string, { score: number; issues: number }>;
  totalIssues: number;
  totalErrors: number;
  totalWarnings: number;
  filesAffected: number;
  elapsedMs: number;
  profile?: ScanProfile;
  scoredDiagnosticsCount?: number;
  advisoryDiagnosticsCount?: number;
  excludedDiagnosticsCount?: number;
}

export interface HistoryData {
  version: 1;
  entries: HistoryEntry[];
}

const getHistoryPath = (directory: string): string => {
  const dir = path.join(directory, HISTORY_DIR);
  return path.join(dir, HISTORY_FILENAME);
};

export const loadHistory = (directory: string): HistoryData => {
  const historyPath = getHistoryPath(directory);
  if (!existsSync(historyPath)) return { version: 1, entries: [] };
  try {
    return JSON.parse(readFileSync(historyPath, "utf-8"));
  } catch {
    return { version: 1, entries: [] };
  }
};

export const appendHistory = (directory: string, result: ScanResult): void => {
  const historyDir = path.join(directory, HISTORY_DIR);
  if (!existsSync(historyDir)) mkdirSync(historyDir, { recursive: true });

  const history = loadHistory(directory);
  const uniqueFiles = new Set(result.diagnostics.map((d) => d.filePath));

  const entry: HistoryEntry = {
    timestamp: new Date().toISOString(),
    score: result.score.overall,
    categories: Object.fromEntries(
      result.score.categories.map((c) => [c.category, { score: c.score, issues: c.issueCount }]),
    ),
    totalIssues: result.diagnostics.length,
    totalErrors: result.diagnostics.filter((d) => d.severity === "error").length,
    totalWarnings: result.diagnostics.filter((d) => d.severity === "warning").length,
    filesAffected: uniqueFiles.size,
    elapsedMs: result.elapsedMs,
    profile: result.profile ?? "core",
    scoredDiagnosticsCount: result.scoredDiagnosticsCount,
    advisoryDiagnosticsCount: result.advisoryDiagnosticsCount,
    excludedDiagnosticsCount: result.excludedDiagnosticsCount,
  };

  history.entries.push(entry);

  if (history.entries.length > MAX_ENTRIES) {
    history.entries = history.entries.slice(-MAX_ENTRIES);
  }

  const historyPath = getHistoryPath(directory);
  writeFileSync(historyPath, JSON.stringify(history, null, 2), "utf-8");
};

export const clearHistory = (directory: string): boolean => {
  const historyPath = getHistoryPath(directory);
  if (!existsSync(historyPath)) return false;
  writeFileSync(historyPath, JSON.stringify({ version: 1, entries: [] }, null, 2), "utf-8");
  return true;
};

export const getHistoryDelta = (
  history: HistoryData,
  profile: ScanProfile = "core",
): { scoreDelta: number; issuesDelta: number } | null => {
  const entries = history.entries.filter((entry) => (entry.profile ?? "core") === profile);
  if (entries.length < 2) return null;
  const current = entries[entries.length - 1];
  const previous = entries[entries.length - 2];
  return {
    scoreDelta: current.score - previous.score,
    issuesDelta: current.totalIssues - previous.totalIssues,
  };
};
