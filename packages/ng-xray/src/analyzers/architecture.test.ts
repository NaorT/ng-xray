import { describe, it, expect } from "vitest";
import { runArchitectureAnalyzer } from "./architecture.js";
import { fixtureDir } from "../__fixtures__/helper.js";

describe("runArchitectureAnalyzer", () => {
  it("detects feature-isolation violation", async () => {
    const diags = await runArchitectureAnalyzer(fixtureDir("feature-cross-import"));
    const violations = diags.filter((d) => d.rule === "feature-isolation");
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].filePath).toContain("features/");
    expect(violations[0].category).toBe("architecture");
    expect(violations[0].severity).toBe("error");
  });

  it("returns empty for clean project", async () => {
    const diags = await runArchitectureAnalyzer(fixtureDir("clean-project"));
    expect(diags.filter((d) => d.category === "architecture")).toHaveLength(0);
  });
});
