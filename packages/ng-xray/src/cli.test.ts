import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, "..", "dist", "cli.mjs");
const fixtureDir = (name: string) => path.join(__dirname, "__fixtures__", name);

const run = async (args: string[], options?: { cwd?: string }) => {
  try {
    const { stdout, stderr } = await execFileAsync("node", [CLI, ...args], {
      cwd: options?.cwd ?? fixtureDir("clean-project"),
      encoding: "utf-8",
      timeout: 60_000,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", exitCode: e.code ?? 1 };
  }
};

describe("CLI integration", () => {
  it("--help exits 0 and shows usage", async () => {
    const { stdout, exitCode } = await run(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("ng-xray");
  });

  it("--score prints a numeric score and exits 0", async () => {
    const { stdout, exitCode } = await run(["--score", "."]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/\d+/);
  });

  it("exits 1 for a non-Angular directory", async () => {
    const { exitCode } = await run(["/tmp"]);
    expect(exitCode).toBe(1);
  });

  it("--fail-under 999 exits 3 when score is below threshold", async () => {
    const { exitCode } = await run(["--fail-under", "999", "--quiet", "."]);
    expect(exitCode).toBe(3);
  });

  it("--json outputs valid JSON with scanStatus", async () => {
    const { stdout, exitCode } = await run(["--json", "."]);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty("scanStatus");
    expect(parsed).toHaveProperty("score");
  });

  it("--quiet suppresses verbose output", async () => {
    const { stdout, exitCode } = await run(["--quiet", "--score", "."]);
    expect(exitCode).toBe(0);
    expect(stdout).not.toContain("Analyzing");
    expect(stdout).toMatch(/\d+/);
  });
});
