import { describe, it, expect } from "vitest";
import { runLintAnalyzer } from "./lint.js";
import { fixtureDir } from "../__fixtures__/helper.js";

describe("runLintAnalyzer", () => {
  it("returns diagnostics in built-in mode when no eslint config is present", async () => {
    const diags = await runLintAnalyzer(fixtureDir("lint-built-in"));
    expect(diags.length).toBeGreaterThan(0);
    for (const d of diags) {
      expect(d.category).toBeDefined();
      expect(d.severity).toMatch(/^(error|warning)$/);
      expect(d.help).toBeTruthy();
    }
  });

  it("returns empty for clean project", async () => {
    const diags = await runLintAnalyzer(fixtureDir("clean-project"));
    expect(diags).toHaveLength(0);
  });

  it("uses ingest mode when ESLint config file is present", async () => {
    const diags = await runLintAnalyzer(fixtureDir("partial-scan-eslint-config"));
    expect(Array.isArray(diags)).toBe(true);
    for (const d of diags) {
      expect(d.provenance).toBe("project-eslint");
      expect(d.trust).toBe("core");
    }
  });
});
