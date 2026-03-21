import { describe, expect, it } from "vitest";
import { generatePrSummary } from "./pr-summary.js";
import type { Diagnostic, ScanResult } from "../types.js";

const makeDiagnostic = (overrides: Partial<Diagnostic> = {}): Diagnostic => ({
  filePath: "src/app/app.component.ts",
  rule: "missing-onpush",
  category: "performance",
  severity: "warning",
  message: "Component does not use OnPush change detection strategy.",
  help: "Add OnPush.",
  line: 1,
  column: 1,
  source: "ng-xray",
  stability: "stable",
  provenance: "ng-xray-heuristic",
  trust: "advisory",
  includedInScore: false,
  ...overrides,
});

const makeScanResult = (overrides: Partial<ScanResult> = {}): ScanResult => ({
  scanStatus: "complete",
  failedAnalyzers: [],
  diagnostics: [],
  score: {
    overall: 95,
    label: "Excellent",
    categories: [
      {
        category: "performance",
        label: "Performance",
        score: 19,
        maxDeduction: 20,
        deduction: 1,
        issueCount: 1,
      },
    ],
  },
  project: {
    rootDirectory: "/tmp/project",
    projectName: "project",
    angularVersion: "19.0.0",
    hasSSR: false,
    hasSignals: false,
    standalonePercentage: 100,
    hasTypeScript: true,
    sourceFileCount: 1,
    componentCount: 1,
    serviceCount: 0,
  },
  remediation: [],
  elapsedMs: 100,
  timestamp: "2026-01-01T00:00:00.000Z",
  configPath: null,
  analyzerRuns: [],
  profile: "core",
  scoredDiagnosticsCount: 0,
  advisoryDiagnosticsCount: 1,
  excludedDiagnosticsCount: 1,
  ...overrides,
});

describe("generatePrSummary", () => {
  it("adds an explicit score disclaimer for partial scans", () => {
    const summary = generatePrSummary(
      makeScanResult({
        scanStatus: "partial",
        failedAnalyzers: ["Lint checks"],
        diagnostics: [makeDiagnostic()],
      }),
    );

    expect(summary).toContain("Partial scan");
    expect(summary).toContain("Score may not reflect full project health.");
  });

  it("describes the active score profile and advisory findings", () => {
    const summary = generatePrSummary(
      makeScanResult({
        diagnostics: [makeDiagnostic()],
        advisoryDiagnosticsCount: 1,
        scoredDiagnosticsCount: 0,
      }),
    );

    expect(summary).toContain("Score profile: `core`");
    expect(summary).toContain("Advisory findings: 1");
    expect(summary).toContain("Advisory findings excluded from score: 1");
  });
});
