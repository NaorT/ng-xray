import { describe, expect, it } from "vitest";
import type { Diagnostic } from "./types.js";
import { classifyDiagnostic, normalizeScanProfile } from "./trust.js";

const makeDiagnostic = (overrides: Partial<Diagnostic> = {}): Diagnostic => ({
  filePath: "src/app/app.component.ts",
  rule: "test-rule",
  category: "best-practices",
  severity: "warning",
  message: "test",
  help: "fix it",
  line: 1,
  column: 1,
  source: "ng-xray",
  stability: "stable",
  ...overrides,
});

describe("normalizeScanProfile", () => {
  it("accepts core and all profiles", () => {
    expect(normalizeScanProfile(undefined)).toBe("core");
    expect(normalizeScanProfile("core")).toBe("core");
    expect(normalizeScanProfile("all")).toBe("all");
  });

  it("rejects invalid profile values", () => {
    expect(() => normalizeScanProfile("everything")).toThrow('Invalid profile "everything". Use "core" or "all".');
  });
});

describe("classifyDiagnostic", () => {
  it("keeps stable architecture rules in the core trust bucket", () => {
    const diagnostic = classifyDiagnostic(
      makeDiagnostic({
        rule: "boundary-violation",
        category: "architecture",
      }),
    );

    expect(diagnostic.provenance).toBe("ng-xray-native-stable");
    expect(diagnostic.trust).toBe("core");
  });

  it("keeps opinionated performance rules advisory by default", () => {
    const diagnostic = classifyDiagnostic(
      makeDiagnostic({
        rule: "missing-onpush",
        category: "performance",
      }),
    );

    expect(diagnostic.provenance).toBe("ng-xray-heuristic");
    expect(diagnostic.trust).toBe("advisory");
  });
});
