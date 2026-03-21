import { describe, it, expect } from "vitest";
import { runCircularInjectionAnalyzer } from "./circular-injection.js";
import { fixtureDir } from "../__fixtures__/helper.js";
import { buildProjectClassMap } from "../utils/inheritance-resolver.js";

describe("runCircularInjectionAnalyzer", () => {
  it("returns empty for clean project without class map", async () => {
    const diags = await runCircularInjectionAnalyzer(fixtureDir("clean-project"));
    expect(diags).toHaveLength(0);
  });

  it("detects circular service injection", async () => {
    const dir = fixtureDir("circular-services");
    const classMap = buildProjectClassMap(dir);
    const diags = await runCircularInjectionAnalyzer(dir, classMap);
    const circular = diags.filter((d) => d.rule === "circular-service-injection");
    expect(circular.length).toBeGreaterThanOrEqual(1);
    expect(circular[0].category).toBe("architecture");
    expect(circular[0].filePath).toBeTruthy();
  });
});
