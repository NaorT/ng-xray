import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AnalyzerRunInfo, Diagnostic, ScanResult } from "../types.js";

vi.mock("../utils/logger.js", () => ({
  logger: {
    log: vi.fn(),
    break: vi.fn(),
    dim: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import { logger } from "../utils/logger.js";
import {
  printHeader,
  printProjectInfo,
  printDiagnostics,
  printSummary,
  printRemediation,
  printAnalyzerSummary,
  printElapsed,
  printReportLink,
  printScoreOnly,
} from "./terminal.js";

const mockLog = logger.log as ReturnType<typeof vi.fn>;

const makeDiag = (overrides: Partial<Diagnostic> = {}): Diagnostic => ({
  filePath: "app/foo.ts",
  rule: "test-rule",
  category: "best-practices",
  severity: "warning",
  message: "test",
  help: "test",
  line: 1,
  column: 1,
  source: "ng-xray",
  stability: "stable",
  ...overrides,
});

const makeResult = (overrides: Partial<ScanResult> = {}): ScanResult => ({
  scanStatus: "complete",
  failedAnalyzers: [],
  diagnostics: [],
  score: {
    overall: 92,
    label: "Excellent",
    categories: [
      { category: "security", label: "Security", score: 20, maxDeduction: 20, deduction: 0, issueCount: 0 },
      {
        category: "best-practices",
        label: "Best Practices",
        score: 25,
        maxDeduction: 25,
        deduction: 0,
        issueCount: 0,
      },
    ],
  },
  project: {
    rootDirectory: "/tmp/test",
    projectName: "demo",
    angularVersion: "17.0.0",
    hasSSR: false,
    hasSignals: true,
    standalonePercentage: 100,
    hasTypeScript: true,
    sourceFileCount: 50,
    componentCount: 10,
    serviceCount: 5,
  },
  remediation: [],
  elapsedMs: 1234,
  timestamp: new Date().toISOString(),
  configPath: null,
  analyzerRuns: [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("printHeader", () => {
  it("logs a version string", () => {
    printHeader();
    const output = mockLog.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(output).toContain("ng-xray");
  });
});

describe("printProjectInfo", () => {
  it("logs project name, Angular version, and counts", () => {
    const result = makeResult();
    printProjectInfo(result.project);
    const output = mockLog.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(output).toContain("demo");
    expect(output).toContain("17.0.0");
    expect(output).toContain("50 files");
    expect(output).toContain("10 components");
    expect(output).toContain("5 services");
  });
});

describe("printDiagnostics", () => {
  it("produces no per-category output for empty diagnostics", () => {
    printDiagnostics([], false);
    const output = mockLog.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(output).toContain("passed");
  });

  it("shows correct dot colors for mixed errors and warnings", () => {
    printDiagnostics(
      [
        makeDiag({ category: "security", severity: "error" }),
        makeDiag({ category: "security", severity: "warning" }),
      ],
      false,
    );
    const output = mockLog.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(output).toContain("1 error");
    expect(output).toContain("1 warning");
  });

  it("lists rules and files in verbose mode", () => {
    printDiagnostics(
      [makeDiag({ category: "security", rule: "hardcoded-secret", filePath: "app/my.ts", line: 42 })],
      true,
    );
    const output = mockLog.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(output).toContain("hardcoded-secret");
    expect(output).toContain("app/my.ts:42");
  });
});

describe("printSummary", () => {
  it("logs score and label", () => {
    printSummary(makeResult());
    const output = mockLog.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(output).toContain("92");
    expect(output).toContain("/100");
  });

  it("shows (partial) marker for partial scans", () => {
    printSummary(makeResult({ scanStatus: "partial" }));
    const output = mockLog.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(output).toContain("partial");
  });
});

describe("printRemediation", () => {
  it("produces no output for empty remediation", () => {
    printRemediation(makeResult({ remediation: [] }));
    expect(mockLog).not.toHaveBeenCalled();
  });

  it("renders items with priority and impact", () => {
    printRemediation(
      makeResult({
        remediation: [
          {
            priority: "high",
            rule: "hardcoded-secret",
            description: "Remove hardcoded secrets",
            estimatedScoreImpact: 5,
            affectedFileCount: 2,
          },
          {
            priority: "low",
            rule: "unused-import",
            description: "Clean up unused imports",
            estimatedScoreImpact: 1,
            affectedFileCount: 10,
          },
        ],
      }),
    );
    const output = mockLog.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(output).toContain("Top fixes");
    expect(output).toContain("Remove hardcoded secrets");
  });
});

describe("printAnalyzerSummary", () => {
  const runs: AnalyzerRunInfo[] = [
    { id: "security", label: "Security", status: "ran", findingsCount: 2, durationMs: 100, experimental: false },
    {
      id: "lint",
      label: "Lint",
      status: "skipped",
      findingsCount: 0,
      durationMs: 0,
      experimental: false,
      skipReason: "disabled",
    },
    { id: "dead-code", label: "Dead Code", status: "failed", findingsCount: 0, durationMs: 50, experimental: true },
  ];

  it("shows ran/skipped/failed counts", () => {
    printAnalyzerSummary(makeResult({ analyzerRuns: runs }), false);
    const output = mockLog.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(output).toContain("1 ran");
    expect(output).toContain("1 skipped");
    expect(output).toContain("1 failed");
  });

  it("shows per-analyzer details in verbose mode", () => {
    printAnalyzerSummary(makeResult({ analyzerRuns: runs }), true);
    const output = mockLog.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(output).toContain("Security");
    expect(output).toContain("Lint");
    expect(output).toContain("Dead Code");
  });
});

describe("printScoreOnly", () => {
  it("writes a raw number to stdout", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    printScoreOnly(88);
    expect(spy).toHaveBeenCalledWith(88);
    spy.mockRestore();
  });
});

describe("printElapsed", () => {
  it("shows seconds", () => {
    printElapsed(2345);
    const output = mockLog.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(output).toContain("2.3");
  });
});

describe("printReportLink", () => {
  it("shows the report path", () => {
    printReportLink("/tmp/report.html");
    const output = mockLog.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(output).toContain("/tmp/report.html");
  });
});
