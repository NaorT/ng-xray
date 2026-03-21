import { describe, it, expect } from "vitest";
import { runDeadMembersAnalyzer } from "./dead-members.js";
import { fixtureDir } from "../__fixtures__/helper.js";

describe("runDeadMembersAnalyzer", () => {
  it("detects unused class member", async () => {
    const diags = await runDeadMembersAnalyzer(fixtureDir("unused-members"));
    const unused = diags.filter((d) => d.rule === "unused-class-member");
    expect(unused.length).toBeGreaterThanOrEqual(1);
    expect(unused[0].category).toBe("dead-code");
    expect(unused[0].filePath).toBeTruthy();
  });

  it("does not flag members used via property bindings, event bindings, or control flow", async () => {
    const diags = await runDeadMembersAnalyzer(fixtureDir("unused-members"));
    const flagged = diags.map((d) => d.message);
    expect(flagged.some((m) => m.includes("isActive"))).toBe(false);
    expect(flagged.some((m) => m.includes("handleClick"))).toBe(false);
    expect(flagged.some((m) => m.includes("showExtra"))).toBe(false);
    expect(flagged.some((m) => m.includes("extraLabel"))).toBe(false);
  });

  it("flags private methods unused in code and template", async () => {
    const diags = await runDeadMembersAnalyzer(fixtureDir("unused-members"));
    const neverUsed = diags.filter((d) => d.message.includes("neverUsedMethod"));
    expect(neverUsed.length).toBeGreaterThanOrEqual(1);
    expect(neverUsed[0].rule).toBe("unused-class-member");
  });

  it("returns empty for clean project", async () => {
    const diags = await runDeadMembersAnalyzer(fixtureDir("clean-project"));
    expect(diags).toHaveLength(0);
  });
});
