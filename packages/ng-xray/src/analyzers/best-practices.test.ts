import { describe, it, expect } from "vitest";
import { runBestPracticesAnalyzer } from "./best-practices.js";
import { fixtureDir } from "../__fixtures__/helper.js";

describe("runBestPracticesAnalyzer", () => {
  it("flags constructor injection", async () => {
    const diags = await runBestPracticesAnalyzer(fixtureDir("constructor-injection"));
    const inject = diags.filter((d) => d.rule === "prefer-inject");
    expect(inject.length).toBeGreaterThanOrEqual(1);
    expect(inject[0].category).toBe("best-practices");
    expect(inject[0].filePath).toBeTruthy();
  });

  it("flags async lifecycle hooks", async () => {
    const diags = await runBestPracticesAnalyzer(fixtureDir("async-lifecycle"));
    const asyncHooks = diags.filter((d) => d.rule === "no-async-lifecycle");
    expect(asyncHooks.length).toBeGreaterThanOrEqual(1);
    expect(asyncHooks[0].category).toBe("best-practices");
    expect(asyncHooks[0].filePath).toBeTruthy();
  });

  it("returns empty for clean project", async () => {
    const diags = await runBestPracticesAnalyzer(fixtureDir("clean-project"));
    expect(diags.length).toBe(0);
  });
});
