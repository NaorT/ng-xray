import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../types.js";
import { buildHeatmapData, getTopHotspots } from "./heatmap.js";

const diag = (filePath: string, severity: "error" | "warning" = "warning"): Diagnostic => ({
  filePath,
  rule: "test-rule",
  category: "best-practices",
  severity,
  message: "test",
  help: "test",
  line: 1,
  column: 1,
  source: "ng-xray",
  stability: "stable",
});

describe("buildHeatmapData", () => {
  it("returns a root node with zero counts for empty diagnostics", () => {
    const root = buildHeatmapData([]);
    expect(root.name).toBe("src");
    expect(root.issueCount).toBe(0);
    expect(root.errorCount).toBe(0);
    expect(root.warningCount).toBe(0);
  });

  it("builds correct tree structure for a single file diagnostic", () => {
    const root = buildHeatmapData([diag("app/foo.ts")]);
    expect(root.issueCount).toBe(1);
    expect(root.children).toHaveLength(1);
    expect(root.children![0].name).toBe("app");
    expect(root.children![0].children![0].name).toBe("foo.ts");
    expect(root.children![0].children![0].issueCount).toBe(1);
  });

  it("creates correct directory nesting for deeply nested paths", () => {
    const root = buildHeatmapData([diag("app/features/auth/auth.service.ts")]);
    const app = root.children!.find((c) => c.name === "app")!;
    const features = app.children!.find((c) => c.name === "features")!;
    const auth = features.children!.find((c) => c.name === "auth")!;
    const file = auth.children!.find((c) => c.name === "auth.service.ts")!;
    expect(file.issueCount).toBe(1);
  });

  it("skips project-wide diagnostics", () => {
    const root = buildHeatmapData([diag("project-wide")]);
    expect(root.issueCount).toBe(0);
  });

  it("aggregates multiple diagnostics in the same file", () => {
    const root = buildHeatmapData([
      diag("app/foo.ts", "error"),
      diag("app/foo.ts", "warning"),
      diag("app/foo.ts", "error"),
    ]);
    const file = root.children![0].children![0];
    expect(file.issueCount).toBe(3);
    expect(file.errorCount).toBe(2);
    expect(file.warningCount).toBe(1);
  });

  it("rolls up parent counts from children", () => {
    const root = buildHeatmapData([diag("app/a.ts", "error"), diag("app/b.ts", "warning")]);
    expect(root.issueCount).toBe(2);
    expect(root.errorCount).toBe(1);
    expect(root.warningCount).toBe(1);
  });

  it("prunes zero-issue branches", () => {
    const root = buildHeatmapData([diag("app/a.ts")]);
    expect(root.children!.every((c) => c.issueCount > 0)).toBe(true);
  });
});

describe("getTopHotspots", () => {
  it("returns empty array for empty diagnostics", () => {
    expect(getTopHotspots([])).toEqual([]);
  });

  it("returns files sorted by count descending", () => {
    const result = getTopHotspots([diag("a.ts"), diag("b.ts"), diag("b.ts"), diag("c.ts"), diag("c.ts"), diag("c.ts")]);
    expect(result[0].filePath).toBe("c.ts");
    expect(result[0].count).toBe(3);
    expect(result[1].filePath).toBe("b.ts");
    expect(result[1].count).toBe(2);
    expect(result[2].filePath).toBe("a.ts");
    expect(result[2].count).toBe(1);
  });

  it("respects limit parameter", () => {
    const result = getTopHotspots([diag("a.ts"), diag("b.ts"), diag("c.ts")], 2);
    expect(result).toHaveLength(2);
  });

  it("skips project-wide entries", () => {
    const result = getTopHotspots([diag("project-wide"), diag("a.ts")]);
    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe("a.ts");
  });

  it("counts errors and warnings separately", () => {
    const result = getTopHotspots([diag("a.ts", "error"), diag("a.ts", "warning"), diag("a.ts", "error")]);
    expect(result[0].errors).toBe(2);
    expect(result[0].warnings).toBe(1);
    expect(result[0].count).toBe(3);
  });
});
