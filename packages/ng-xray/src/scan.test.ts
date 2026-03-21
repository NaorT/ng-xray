import { describe, expect, it, vi } from "vitest";
import { fixtureDir } from "./__fixtures__/helper.js";
import { scan } from "./scan.js";

vi.mock("./analyzers/security.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./analyzers/security.js")>();
  return {
    ...original,
    runSecurityAnalyzer: vi.fn().mockImplementation((...args: Parameters<typeof original.runSecurityAnalyzer>) => {
      if (process.env.__MOCK_SECURITY_FAIL === "1") {
        throw new Error("Mocked security analyzer failure");
      }
      return original.runSecurityAnalyzer(...args);
    }),
  };
});

describe("scan", () => {
  it("returns a complete result for a minimal clean Angular project", async () => {
    const result = await scan(fixtureDir("full-project"), {}, true);

    expect(result.scanStatus).toBe("complete");
    expect(result.failedAnalyzers).toEqual([]);
    expect(result.project.projectName).toBe("full-project-fixture");
    expect(result.project.angularVersion).toBe("19.0.0");
    expect(result.diagnostics).toEqual([]);
    expect(result.score.overall).toBe(100);
    expect(result.analyzerRuns.length).toBeGreaterThan(0);
    expect(result.signalReadiness?.score).toBe(100);
  });

  it("lets explicit scan options override disabled architecture config", async () => {
    const result = await scan(fixtureDir("full-project-config-disabled"), { architecture: true }, true);

    const architectureRun = result.analyzerRuns.find((run) => run.id === "architecture");

    expect(architectureRun).toBeDefined();
    expect(architectureRun?.status).toBe("ran");
  });

  it("lets explicit scan options override disabled lint, dead code, and performance config", async () => {
    const result = await scan(
      fixtureDir("full-project-config-disabled"),
      {
        lint: true,
        deadCode: true,
        performance: true,
      },
      true,
    );

    expect(result.analyzerRuns.find((run) => run.id === "lint")?.status).toBe("ran");
    expect(result.analyzerRuns.find((run) => run.id === "dead-code-generic")?.status).toBe("ran");
    expect(result.analyzerRuns.find((run) => run.id === "dead-code-angular")?.status).toBe("ran");
    expect(result.analyzerRuns.find((run) => run.id === "dead-class-members")?.status).toBe("ran");
    expect(result.analyzerRuns.find((run) => run.id === "performance")?.status).toBe("ran");
    expect(result.analyzerRuns.find((run) => run.id === "lazy-loading")?.status).toBe("ran");
  });

  it("scans projects that do not use a src directory", async () => {
    const result = await scan(fixtureDir("no-src-dir"), {}, true);

    expect(result.project.angularVersion).toBe("19.0.0");
    expect(result.project.sourceFileCount).toBeGreaterThan(0);
    expect(result.scanStatus).toBe("complete");
  });

  it("uses the conservative core profile by default while keeping advisory diagnostics visible", async () => {
    const result = await scan(fixtureDir("missing-onpush"), {}, true);
    const missingOnPush = result.diagnostics.find((diagnostic) => diagnostic.rule === "missing-onpush");

    expect(result.profile).toBe("core");
    expect(missingOnPush).toBeDefined();
    expect(missingOnPush?.trust).toBe("advisory");
    expect(missingOnPush?.includedInScore).toBe(false);
    expect(result.score.overall).toBe(100);
    expect(result.scoredDiagnosticsCount).toBe(0);
    expect(result.advisoryDiagnosticsCount).toBeGreaterThan(0);
    expect(result.excludedDiagnosticsCount).toBeGreaterThan(0);
  });

  it("reports partial scan when an analyzer throws", async () => {
    process.env.__MOCK_SECURITY_FAIL = "1";
    try {
      const result = await scan(fixtureDir("full-project"), {}, true);
      expect(result.scanStatus).toBe("partial");
      expect(result.failedAnalyzers).toContain("Security");
      const securityRun = result.analyzerRuns.find((r) => r.id === "security");
      expect(securityRun?.status).toBe("failed");
    } finally {
      delete process.env.__MOCK_SECURITY_FAIL;
    }
  });

  it("allows opting into the all profile for advisory scoring", async () => {
    const result = await scan(fixtureDir("missing-onpush"), { profile: "all" }, true);

    expect(result.profile).toBe("all");
    expect(result.score.overall).toBeLessThan(100);
    expect(result.scoredDiagnosticsCount).toBeGreaterThan(0);
    expect(result.advisoryDiagnosticsCount).toBeGreaterThan(0);
    expect(result.excludedDiagnosticsCount).toBe(0);
  });
});
