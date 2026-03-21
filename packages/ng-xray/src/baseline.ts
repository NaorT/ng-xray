import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import type { Diagnostic } from "./types.js";

const BASELINE_FILENAME = ".ng-xray-baseline.json";
const BASELINE_VERSION = 3;

interface BaselineData {
  version: 3;
  createdAt: string;
  fingerprints: string[];
  meta: { totalIssues: number; score: number };
}

export const fingerprintDiagnostic = (d: Diagnostic): string =>
  createHash("sha256").update(`${d.source}::${d.rule}::${d.filePath}::${d.message}`).digest("hex").slice(0, 16);

export const getBaselinePath = (directory: string): string => path.join(directory, BASELINE_FILENAME);

export const baselineExists = (directory: string): boolean => existsSync(getBaselinePath(directory));

export const saveBaseline = (directory: string, diagnostics: Diagnostic[], score: number): string => {
  const baselinePath = getBaselinePath(directory);
  const data: BaselineData = {
    version: BASELINE_VERSION,
    createdAt: new Date().toISOString(),
    fingerprints: diagnostics.map(fingerprintDiagnostic),
    meta: { totalIssues: diagnostics.length, score },
  };
  writeFileSync(baselinePath, JSON.stringify(data, null, 2), "utf-8");
  return baselinePath;
};

export const loadBaseline = (directory: string): BaselineData | null => {
  const baselinePath = getBaselinePath(directory);
  if (!existsSync(baselinePath)) return null;
  try {
    const baseline = JSON.parse(readFileSync(baselinePath, "utf-8")) as Partial<BaselineData> & { version?: number };
    return baseline.version === BASELINE_VERSION ? (baseline as BaselineData) : null;
  } catch {
    return null;
  }
};

export const clearBaseline = (directory: string): boolean => {
  const baselinePath = getBaselinePath(directory);
  if (!existsSync(baselinePath)) return false;
  unlinkSync(baselinePath);
  return true;
};

export const subtractBaseline = (diagnostics: Diagnostic[], baseline: BaselineData): Diagnostic[] => {
  const baselineSet = new Set(baseline.fingerprints);
  return diagnostics.filter((d) => !baselineSet.has(fingerprintDiagnostic(d)));
};
