import { describe, expect, it } from "vitest";
import { fixtureDir } from "./__fixtures__/helper.js";
import { resolveWatchPath, fingerprintDiag, diffDiagnostics } from "./watch.js";
import type { Diagnostic } from "./types.js";

const diag = (overrides: Partial<Diagnostic> = {}): Diagnostic => ({
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

describe("resolveWatchPath", () => {
  it("uses src when a conventional source directory exists", () => {
    expect(resolveWatchPath(fixtureDir("full-project"))).toBe(fixtureDir("full-project/src"));
  });

  it("falls back to the project root when no src directory exists", () => {
    expect(resolveWatchPath(fixtureDir("no-src-dir"))).toBe(fixtureDir("no-src-dir"));
  });

  it("honors an explicit source root for workspace projects", () => {
    expect(resolveWatchPath("/workspace/apps/demo", "/workspace/apps/demo/custom-src")).toBe(
      "/workspace/apps/demo/custom-src",
    );
  });
});

describe("fingerprintDiag", () => {
  it("produces a deterministic string from rule, filePath, line", () => {
    const d = diag({ rule: "unused-import", filePath: "src/app.ts", line: 42 });
    expect(fingerprintDiag(d)).toBe("unused-import::src/app.ts::42");
  });

  it("produces different fingerprints for different lines", () => {
    const a = diag({ line: 1 });
    const b = diag({ line: 2 });
    expect(fingerprintDiag(a)).not.toBe(fingerprintDiag(b));
  });
});

describe("diffDiagnostics", () => {
  it("treats empty previous + new current as all added", () => {
    const current = [diag({ rule: "a", line: 1 })];
    const { added, removed } = diffDiagnostics([], current);
    expect(added).toHaveLength(1);
    expect(removed).toHaveLength(0);
  });

  it("returns empty added and removed for identical diagnostics", () => {
    const diags = [diag({ rule: "a", line: 1 }), diag({ rule: "b", line: 2 })];
    const { added, removed } = diffDiagnostics(diags, diags);
    expect(added).toHaveLength(0);
    expect(removed).toHaveLength(0);
  });

  it("detects a removed diagnostic", () => {
    const prev = [diag({ rule: "a", line: 1 }), diag({ rule: "b", line: 2 })];
    const curr = [diag({ rule: "a", line: 1 })];
    const { added, removed } = diffDiagnostics(prev, curr);
    expect(added).toHaveLength(0);
    expect(removed).toHaveLength(1);
    expect(removed[0].rule).toBe("b");
  });

  it("detects an added diagnostic", () => {
    const prev = [diag({ rule: "a", line: 1 })];
    const curr = [diag({ rule: "a", line: 1 }), diag({ rule: "c", line: 3 })];
    const { added, removed } = diffDiagnostics(prev, curr);
    expect(added).toHaveLength(1);
    expect(added[0].rule).toBe("c");
    expect(removed).toHaveLength(0);
  });

  it("handles mixed adds and removes", () => {
    const prev = [diag({ rule: "a", line: 1 }), diag({ rule: "b", line: 2 })];
    const curr = [diag({ rule: "a", line: 1 }), diag({ rule: "c", line: 3 })];
    const { added, removed } = diffDiagnostics(prev, curr);
    expect(added).toHaveLength(1);
    expect(added[0].rule).toBe("c");
    expect(removed).toHaveLength(1);
    expect(removed[0].rule).toBe("b");
  });
});
