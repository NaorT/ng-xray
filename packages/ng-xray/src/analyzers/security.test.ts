import { describe, it, expect } from "vitest";
import { runSecurityAnalyzer } from "./security.js";
import { fixtureDir } from "../__fixtures__/helper.js";

describe("runSecurityAnalyzer", () => {
  it("flags bypassSecurityTrust calls", async () => {
    const diags = await runSecurityAnalyzer(fixtureDir("security-issues"));
    expect(diags).toContainEqual(
      expect.objectContaining({
        rule: "bypass-security-trust",
        source: "ng-xray",
        stability: "experimental",
      }),
    );
  });

  it("flags eval() usage", async () => {
    const diags = await runSecurityAnalyzer(fixtureDir("security-issues"));
    const evalUsage = diags.filter((d) => d.rule === "eval-usage");
    expect(evalUsage.length).toBeGreaterThanOrEqual(1);
    expect(evalUsage[0].category).toBe("security");
    expect(evalUsage[0].filePath).toBeTruthy();
  });

  it("flags hardcoded secrets", async () => {
    const diags = await runSecurityAnalyzer(fixtureDir("security-issues"));
    const secrets = diags.filter((d) => d.rule === "hardcoded-secret");
    expect(secrets.length).toBeGreaterThanOrEqual(3);
  });

  it("detects GitHub, Slack, and npm tokens", async () => {
    const diags = await runSecurityAnalyzer(fixtureDir("security-issues"));
    const secretMessages = diags.filter((d) => d.rule === "hardcoded-secret").map((d) => d.message);
    expect(secretMessages.some((m) => m.includes("GitHub"))).toBe(true);
    expect(secretMessages.some((m) => m.includes("Slack"))).toBe(true);
    expect(secretMessages.some((m) => m.includes("npm"))).toBe(true);
  });

  it("flags innerHTML bindings in templates", async () => {
    const diags = await runSecurityAnalyzer(fixtureDir("security-issues"));
    const innerHtml = diags.filter((d) => d.rule === "innerhtml-binding");
    expect(innerHtml.length).toBeGreaterThan(0);
  });

  it("returns empty for clean project", async () => {
    const diags = await runSecurityAnalyzer(fixtureDir("clean-project"));
    expect(diags).toHaveLength(0);
  });

  it("produces diagnostics with correct security category", async () => {
    const diags = await runSecurityAnalyzer(fixtureDir("security-issues"));
    for (const d of diags) {
      expect(d.category).toBe("security");
    }
  });

  it("does not flag placeholder secret values", async () => {
    const diags = await runSecurityAnalyzer(fixtureDir("clean-project"));
    const secrets = diags.filter((d) => d.rule === "hardcoded-secret");
    expect(secrets).toHaveLength(0);
  });
});
