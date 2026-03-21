import { describe, expect, it } from "vitest";
import { parseKnipOutput, runDeadCodeAnalyzer } from "./dead-code.js";
import { fixtureDir } from "../__fixtures__/helper.js";

describe("runDeadCodeAnalyzer", () => {
  it("returns empty when Knip binary is not found", async () => {
    const diags = await runDeadCodeAnalyzer(fixtureDir("clean-project"));
    expect(diags).toEqual([]);
  });
});

describe("parseKnipOutput", () => {
  it("marks Knip results as trusted project provenance", () => {
    const diagnostics = parseKnipOutput(
      JSON.stringify({
        files: ["/repo/src/app/unused.ts"],
        issues: [],
      }),
      "/repo",
    );

    expect(diagnostics[0]?.source).toBe("knip");
    expect(diagnostics[0]?.provenance).toBe("project-knip");
    expect(diagnostics[0]?.trust).toBe("core");
  });

  it("parses issue entries into diagnostics", () => {
    const diagnostics = parseKnipOutput(
      JSON.stringify({
        files: [],
        issues: [
          {
            file: "/repo/src/app/my.service.ts",
            dependencies: [],
            devDependencies: [],
            optionalPeerDependencies: [],
            exports: [{ name: "unusedFn" }],
            types: [],
            duplicates: [],
          },
        ],
      }),
      "/repo",
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.rule).toBe("unused-export");
    expect(diagnostics[0]?.filePath).toBe("src/app/my.service.ts");
  });
});
