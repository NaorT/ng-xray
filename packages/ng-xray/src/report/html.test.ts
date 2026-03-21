import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import type { HistoryData } from "../history.js";
import type { ScanResult } from "../types.js";
import { generateHtmlReport } from "./html.js";

const baseScanResult = (): ScanResult => ({
  scanStatus: "complete",
  failedAnalyzers: [],
  diagnostics: [],
  score: { overall: 85, label: "Good", categories: [] },
  project: {
    rootDirectory: "/test",
    projectName: "test",
    angularVersion: "19.0.0",
    hasSSR: false,
    hasSignals: false,
    standalonePercentage: 100,
    hasTypeScript: true,
    sourceFileCount: 10,
    componentCount: 5,
    serviceCount: 2,
  },
  remediation: [],
  elapsedMs: 1000,
  timestamp: new Date().toISOString(),
  configPath: null,
  analyzerRuns: [],
  profile: "core",
  scoredDiagnosticsCount: 0,
  advisoryDiagnosticsCount: 0,
  excludedDiagnosticsCount: 0,
});

describe("generateHtmlReport", () => {
  it("returns a valid file path ending in .html", () => {
    const result = baseScanResult();
    const filePath = generateHtmlReport(result);

    expect(filePath).toMatch(/\.html$/i);
    expect(existsSync(filePath)).toBe(true);
  });

  it("writes HTML with doctype and ng-xray branding", () => {
    const result = baseScanResult();
    const filePath = generateHtmlReport(result);
    const html = readFileSync(filePath, "utf-8");

    expect(html.toLowerCase()).toContain("<!doctype html>");
    expect(html.toLowerCase()).toContain("ng-xray");
  });

  it("escapes malicious file paths in the report", () => {
    const result: ScanResult = {
      ...baseScanResult(),
      diagnostics: [
        {
          filePath: '<script>alert("xss")</script>',
          rule: "test-rule",
          category: "security",
          severity: "error",
          message: "test",
          help: "test",
          line: 1,
          column: 1,
          source: "ng-xray",
          stability: "stable",
        },
      ],
    };
    const filePath = generateHtmlReport(result);
    const html = readFileSync(filePath, "utf-8");

    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("works with empty diagnostics", () => {
    const result = baseScanResult();
    expect(() => generateHtmlReport(result)).not.toThrow();
    const filePath = generateHtmlReport(result);
    expect(existsSync(filePath)).toBe(true);
  });

  it("escapes single quotes and script tags in diagnostic content", () => {
    const result: ScanResult = {
      ...baseScanResult(),
      diagnostics: [
        {
          filePath: "src/it's/bad.ts",
          rule: "test-rule",
          category: "security",
          severity: "error",
          message: "<script>alert(1)</script>",
          help: "don't trust this",
          line: 1,
          column: 1,
          source: "ng-xray",
          stability: "stable",
        },
      ],
    };
    const filePath = generateHtmlReport(result);
    const html = readFileSync(filePath, "utf-8");

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&#39;");
    expect(html).not.toMatch(/onclick="[^"]*'[^"]*src\/it's/);
  });

  it("works when history data is passed", () => {
    const result = baseScanResult();
    const history: HistoryData = {
      version: 1,
      entries: [
        {
          timestamp: "2024-01-01T00:00:00Z",
          score: 80,
          totalIssues: 5,
          elapsedMs: 1000,
          profile: "core",
          categories: {},
          totalErrors: 0,
          totalWarnings: 0,
          filesAffected: 0,
        },
      ],
    };

    expect(() => generateHtmlReport(result, history)).not.toThrow();
    const filePath = generateHtmlReport(result, history);
    const html = readFileSync(filePath, "utf-8");

    expect(existsSync(filePath)).toBe(true);
    expect(html.toLowerCase()).toContain("<!doctype html>");
  });

  it("includes partial scan banner when scanStatus is partial", () => {
    const result: ScanResult = {
      ...baseScanResult(),
      scanStatus: "partial",
      failedAnalyzers: ["Lint checks"],
    };
    const html = readFileSync(generateHtmlReport(result), "utf-8");

    expect(html).toContain("Partial scan");
    expect(html).toContain("Lint checks");
  });

  it("renders signal readiness card when data is present", () => {
    const result: ScanResult = {
      ...baseScanResult(),
      signalReadiness: { score: 60, counts: {}, migrationPlan: [] },
    };
    const html = readFileSync(generateHtmlReport(result), "utf-8");

    expect(html).toContain("Signal Readiness");
  });

  it("renders remediation section with multiple priorities", () => {
    const result: ScanResult = {
      ...baseScanResult(),
      remediation: [
        { priority: "high", rule: "missing-onpush", description: "Fix onpush", estimatedScoreImpact: 8, affectedFileCount: 5 },
        { priority: "low", rule: "test-rule", description: "Low fix", estimatedScoreImpact: 1, affectedFileCount: 1 },
      ],
    };
    const html = readFileSync(generateHtmlReport(result), "utf-8");

    expect(html).toContain("Remediation");
  });

  it("renders analyzer summary with mixed statuses", () => {
    const result: ScanResult = {
      ...baseScanResult(),
      analyzerRuns: [
        { id: "lint", label: "Lint", status: "ran", findingsCount: 3, durationMs: 500, experimental: false },
        { id: "security", label: "Security", status: "failed", findingsCount: 0, durationMs: 100, experimental: true, errorMessage: "err" },
        { id: "dead-code", label: "Dead code", status: "skipped", findingsCount: 0, durationMs: 0, experimental: true, skipReason: "disabled" },
      ],
    };
    const html = readFileSync(generateHtmlReport(result), "utf-8");

    expect(html).toContain("Lint");
    expect(html).toContain("Security");
  });

  it("writes to custom output path", () => {
    const result = baseScanResult();
    const customPath = path.join(tmpdir(), `ng-xray-test-${Date.now()}`, "custom-report.html");
    const filePath = generateHtmlReport(result, undefined, customPath);

    expect(filePath).toBe(customPath);
    expect(existsSync(filePath)).toBe(true);
  });

  it("renders diagnostics grouped by category", () => {
    const result: ScanResult = {
      ...baseScanResult(),
      diagnostics: [
        { filePath: "a.ts", rule: "missing-onpush", category: "performance", severity: "warning", message: "No OnPush", help: "Add it", line: 1, column: 1, source: "ng-xray", stability: "stable" },
        { filePath: "b.ts", rule: "eval-usage", category: "security", severity: "error", message: "eval found", help: "Remove", line: 1, column: 1, source: "ng-xray", stability: "experimental" },
      ],
    };
    const html = readFileSync(generateHtmlReport(result), "utf-8");

    expect(html).toContain("Performance");
    expect(html).toContain("Security");
  });
});
