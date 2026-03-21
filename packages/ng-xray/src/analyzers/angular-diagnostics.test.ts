import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveAngularCompilerContext,
  runAngularDiagnosticsAnalyzer,
  parseDiagnosticOutput,
  CATEGORY_MAP,
  HELP_MAP,
} from "./angular-diagnostics.js";
import { fixtureDir } from "../__fixtures__/helper.js";

const createAngularWorkspace = (): { workspaceDir: string; projectDir: string } => {
  const workspaceDir = mkdtempSync(path.join(tmpdir(), "ng-xray-angular-diags-"));
  const projectDir = path.join(workspaceDir, "libs", "ui");
  mkdirSync(path.join(workspaceDir, "node_modules", ".bin"), { recursive: true });
  mkdirSync(projectDir, { recursive: true });
  return { workspaceDir, projectDir };
};

describe("resolveAngularCompilerContext", () => {
  it("finds ngc in the workspace root and tsconfig in the project root", () => {
    const { workspaceDir, projectDir } = createAngularWorkspace();
    const ngcBinary = path.join(workspaceDir, "node_modules", ".bin", "ngc");
    writeFileSync(ngcBinary, "", "utf-8");
    writeFileSync(path.join(projectDir, "tsconfig.lib.json"), JSON.stringify({}), "utf-8");

    const context = resolveAngularCompilerContext(projectDir);

    expect(context).toEqual({
      ngcBinary,
      tsConfig: path.join(projectDir, "tsconfig.lib.json"),
    });
  });
});

describe("parseDiagnosticOutput", () => {
  it("parses a single NG8101 line into correct fields", () => {
    const output = "src/app/app.component.html:5:3 - error NG8101: Banana in box syntax detected.\n";
    const parsed = parseDiagnosticOutput(output);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual({
      filePath: "src/app/app.component.html",
      line: 5,
      column: 3,
      severity: "error",
      code: "NG8101",
      message: "Banana in box syntax detected.",
    });
  });

  it("parses multiple NG codes from multiline output", () => {
    const output = [
      "src/a.html:1:1 - error NG8101: Issue one.",
      "src/b.html:2:4 - warning NG8107: Issue two.",
      "other noise",
    ].join("\n");
    const parsed = parseDiagnosticOutput(output);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].code).toBe("NG8101");
    expect(parsed[1].code).toBe("NG8107");
    expect(parsed[1].severity).toBe("warning");
  });

  it("ignores non-NG8 codes", () => {
    const output = "src/a.ts:1:1 - error TS2345: Something wrong.\n";
    expect(parseDiagnosticOutput(output)).toHaveLength(0);
  });

  it("returns empty for output with no diagnostics", () => {
    expect(parseDiagnosticOutput("")).toHaveLength(0);
    expect(parseDiagnosticOutput("Some random text")).toHaveLength(0);
  });

  it("handles absolute file paths", () => {
    const output = "/users/dev/project/src/app.html:10:2 - error NG8109: Signal not invoked.\n";
    const parsed = parseDiagnosticOutput(output);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].filePath).toBe("/users/dev/project/src/app.html");
  });
});

describe("CATEGORY_MAP and HELP_MAP", () => {
  it("maps NG8101 to best-practices with correct help text", () => {
    expect(CATEGORY_MAP.NG8101).toBe("best-practices");
    expect(HELP_MAP.NG8101).toContain("banana");
  });

  it("maps NG8107 to performance with correct help text", () => {
    expect(CATEGORY_MAP.NG8107).toBe("performance");
    expect(HELP_MAP.NG8107).toContain("optional chain");
  });

  it("returns undefined for unknown codes (fallback used elsewhere)", () => {
    expect(CATEGORY_MAP.NG9999).toBeUndefined();
    expect(HELP_MAP.NG9999).toBeUndefined();
  });
});

describe("runAngularDiagnosticsAnalyzer", () => {
  it("completes without throwing on full-project fixture", async () => {
    const diags = await runAngularDiagnosticsAnalyzer(fixtureDir("full-project"));
    expect(Array.isArray(diags)).toBe(true);
  });
});
