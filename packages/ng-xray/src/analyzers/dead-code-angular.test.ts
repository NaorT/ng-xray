import { describe, it, expect } from "vitest";
import { runAngularDeadCodeAnalyzer } from "./dead-code-angular.js";
import { fixtureDir } from "../__fixtures__/helper.js";

describe("runAngularDeadCodeAnalyzer", () => {
  it("detects unused component", async () => {
    const diags = await runAngularDeadCodeAnalyzer(fixtureDir("unused-angular-artifacts"));
    const components = diags.filter((d) => d.rule === "unused-component");
    expect(components.length).toBeGreaterThanOrEqual(1);
    expect(components[0].category).toBe("dead-code");
    expect(components[0].filePath).toBeTruthy();
  });

  it("detects unused pipe", async () => {
    const diags = await runAngularDeadCodeAnalyzer(fixtureDir("unused-angular-artifacts"));
    const pipes = diags.filter((d) => d.rule === "unused-pipe");
    expect(pipes.length).toBeGreaterThanOrEqual(1);
    expect(pipes[0].category).toBe("dead-code");
  });

  it("detects unused service", async () => {
    const diags = await runAngularDeadCodeAnalyzer(fixtureDir("unused-angular-artifacts"));
    const services = diags.filter((d) => d.rule === "unused-service");
    expect(services.length).toBeGreaterThanOrEqual(1);
    expect(services[0].category).toBe("dead-code");
  });

  it("returns empty for clean project", async () => {
    const diags = await runAngularDeadCodeAnalyzer(fixtureDir("clean-project"));
    expect(diags).toHaveLength(0);
  });
});
