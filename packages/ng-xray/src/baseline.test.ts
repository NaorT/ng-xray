import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import type { Diagnostic } from "./types.js";
import { clearBaseline, fingerprintDiagnostic, loadBaseline, saveBaseline, subtractBaseline } from "./baseline.js";

const makeDiag = (overrides: Partial<Diagnostic> = {}): Diagnostic => ({
  filePath: "test.ts",
  rule: "test-rule",
  category: "best-practices",
  severity: "warning",
  message: "test",
  help: "fix it",
  line: 1,
  column: 1,
  source: "ng-xray",
  stability: "stable",
  ...overrides,
});

const makeBaseline = (fingerprints: string[]) => ({
  version: 3 as const,
  createdAt: "2025-01-01T00:00:00.000Z",
  fingerprints,
  meta: { totalIssues: fingerprints.length, score: 100 },
});

describe("fingerprintDiagnostic", () => {
  it("produces a stable hash for the same diagnostic", () => {
    const d = makeDiag();
    expect(fingerprintDiagnostic(d)).toBe(fingerprintDiagnostic(d));
  });

  it("produces different hashes for different rules", () => {
    const h1 = fingerprintDiagnostic(makeDiag({ rule: "rule-a" }));
    const h2 = fingerprintDiagnostic(makeDiag({ rule: "rule-b" }));
    expect(h1).not.toBe(h2);
  });

  it("produces different hashes for different files", () => {
    const h1 = fingerprintDiagnostic(makeDiag({ filePath: "a.ts" }));
    const h2 = fingerprintDiagnostic(makeDiag({ filePath: "b.ts" }));
    expect(h1).not.toBe(h2);
  });

  it("produces the same hash when only line/column changes (content-based)", () => {
    const h1 = fingerprintDiagnostic(makeDiag({ filePath: "a.ts", line: 10, column: 2 }));
    const h2 = fingerprintDiagnostic(makeDiag({ filePath: "a.ts", line: 20, column: 4 }));
    expect(h1).toBe(h2);
  });

  it("produces different hashes when the message differs", () => {
    const h1 = fingerprintDiagnostic(makeDiag({ filePath: "a.ts", message: "old wording" }));
    const h2 = fingerprintDiagnostic(makeDiag({ filePath: "a.ts", message: "new wording" }));
    expect(h1).not.toBe(h2);
  });

  it("distinguishes same-file same-rule findings using their message", () => {
    const h1 = fingerprintDiagnostic(
      makeDiag({
        rule: "boundary-violation",
        filePath: "src/app/features/auth/auth.routes.ts",
        message: "Boundary violation: auth imports from legacy/a.ts",
      }),
    );
    const h2 = fingerprintDiagnostic(
      makeDiag({
        rule: "boundary-violation",
        filePath: "src/app/features/auth/auth.routes.ts",
        message: "Boundary violation: auth imports from legacy/b.ts",
      }),
    );
    expect(h1).not.toBe(h2);
  });

  it("hash is 16 characters long", () => {
    const hash = fingerprintDiagnostic(makeDiag());
    expect(hash).toHaveLength(16);
    expect(hash).toMatch(/^[a-f0-9]{16}$/);
  });
});

describe("subtractBaseline", () => {
  it("removes diagnostics whose fingerprint is in the baseline", () => {
    const d1 = makeDiag({ rule: "rule-1", filePath: "a.ts", message: "msg1" });
    const d2 = makeDiag({ rule: "rule-2", filePath: "b.ts", message: "msg2" });
    const baseline = makeBaseline([fingerprintDiagnostic(d1)]);
    const result = subtractBaseline([d1, d2], baseline);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(d2);
  });

  it("keeps diagnostics not in the baseline", () => {
    const d = makeDiag({ rule: "unknown", filePath: "x.ts", message: "msg" });
    const baseline = makeBaseline([]);
    const result = subtractBaseline([d], baseline);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(d);
  });

  it("handles empty baseline", () => {
    const d = makeDiag();
    const baseline = makeBaseline([]);
    const result = subtractBaseline([d], baseline);
    expect(result).toHaveLength(1);
  });

  it("handles empty diagnostics", () => {
    const baseline = makeBaseline(["abc123"]);
    const result = subtractBaseline([], baseline);
    expect(result).toEqual([]);
  });
});

describe("loadBaseline", () => {
  it("ignores unsupported baseline versions", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "ng-xray-baseline-"));
    writeFileSync(
      path.join(directory, ".ng-xray-baseline.json"),
      JSON.stringify({
        version: 1,
        createdAt: "2025-01-01T00:00:00.000Z",
        fingerprints: ["abc123"],
        meta: { totalIssues: 1, score: 99 },
      }),
      "utf-8",
    );

    expect(loadBaseline(directory)).toBeNull();
  });

  it("returns null when baseline file does not exist", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "ng-xray-no-baseline-"));
    expect(loadBaseline(directory)).toBeNull();
  });

  it("returns null for corrupted JSON", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "ng-xray-corrupt-"));
    writeFileSync(path.join(directory, ".ng-xray-baseline.json"), "{not valid json!!!", "utf-8");
    expect(loadBaseline(directory)).toBeNull();
  });
});

describe("saveBaseline", () => {
  it("writes a valid baseline file with correct version and fingerprints", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "ng-xray-save-"));
    const diags = [makeDiag({ rule: "r1", message: "m1" }), makeDiag({ rule: "r2", message: "m2" })];
    const resultPath = saveBaseline(directory, diags, 90);

    expect(existsSync(resultPath)).toBe(true);
    const data = JSON.parse(readFileSync(resultPath, "utf-8"));
    expect(data.version).toBe(3);
    expect(data.fingerprints).toHaveLength(2);
    expect(data.meta.totalIssues).toBe(2);
    expect(data.meta.score).toBe(90);
  });
});

describe("clearBaseline", () => {
  it("removes the baseline file and returns true", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "ng-xray-clear-"));
    saveBaseline(directory, [makeDiag()], 100);
    expect(clearBaseline(directory)).toBe(true);
    expect(existsSync(path.join(directory, ".ng-xray-baseline.json"))).toBe(false);
  });

  it("returns false when no baseline exists", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "ng-xray-no-clear-"));
    expect(clearBaseline(directory)).toBe(false);
  });
});
