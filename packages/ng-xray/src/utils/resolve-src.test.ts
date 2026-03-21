import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { resolveSrcDir } from "./resolve-src.js";

describe("resolveSrcDir", () => {
  it("returns directory/src when src/ exists", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ng-xray-src-"));
    mkdirSync(path.join(dir, "src"));
    expect(resolveSrcDir(dir)).toBe(path.join(dir, "src"));
  });

  it("returns directory when src/ does not exist", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ng-xray-nosrc-"));
    expect(resolveSrcDir(dir)).toBe(dir);
  });
});
