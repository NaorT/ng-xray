import { describe, it, expect } from "vitest";
import { runPerformanceAnalyzer } from "./performance.js";
import { fixtureDir } from "../__fixtures__/helper.js";

describe("runPerformanceAnalyzer", () => {
  it("flags components without OnPush", async () => {
    const diags = await runPerformanceAnalyzer(fixtureDir("missing-onpush"));
    const onpush = diags.filter((d) => d.rule === "missing-onpush");
    expect(onpush.length).toBeGreaterThanOrEqual(1);
    expect(onpush[0].category).toBe("performance");
    expect(onpush[0].filePath).toBeTruthy();
    expect(onpush[0].source).toBe("ng-xray");
    expect(onpush[0].stability).toBe("stable");
  });

  it("does not flag components with OnPush", async () => {
    const diags = await runPerformanceAnalyzer(fixtureDir("clean-project"));
    expect(diags.some((d) => d.rule === "missing-onpush")).toBe(false);
  });

  it("flags heavy constructors", async () => {
    const diags = await runPerformanceAnalyzer(fixtureDir("heavy-constructor"));
    const heavy = diags.filter((d) => d.rule === "heavy-constructor");
    expect(heavy.length).toBeGreaterThanOrEqual(1);
    expect(heavy[0].category).toBe("performance");
    expect(heavy[0].filePath).toBeTruthy();
  });

  it("returns empty for clean project", async () => {
    const diags = await runPerformanceAnalyzer(fixtureDir("clean-project"));
    expect(diags.length).toBe(0);
  });
});
