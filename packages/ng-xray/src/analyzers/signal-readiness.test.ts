import { describe, it, expect } from "vitest";
import { analyzeSignalReadiness } from "./signal-readiness.js";
import { fixtureDir } from "../__fixtures__/helper.js";

describe("analyzeSignalReadiness", () => {
  it("reports 100% for project with no legacy/modern patterns", () => {
    const report = analyzeSignalReadiness(fixtureDir("clean-project"));
    expect(report.score).toBe(100);
  });

  it("returns migration plan for legacy patterns", () => {
    const report = analyzeSignalReadiness(fixtureDir("constructor-injection"));
    expect(report.counts.Injection.legacy).toBeGreaterThan(0);
  });
});
