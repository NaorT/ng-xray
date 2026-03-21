import type { Diagnostic, DiagnosticProvenance, DiagnosticTrust, ScanProfile } from "./types.js";

export const normalizeScanProfile = (profile: string | undefined): ScanProfile =>
  profile == null || profile === "core"
    ? "core"
    : profile === "all"
      ? "all"
      : (() => {
          throw new Error(`Invalid profile "${profile}". Use "core" or "all".`);
        })();

export const isCoreDiagnostic = (diagnostic: Pick<Diagnostic, "trust">): boolean => diagnostic.trust === "core";

export const shouldIncludeInScore = (diagnostic: Pick<Diagnostic, "trust">, profile: ScanProfile): boolean =>
  profile === "all" || isCoreDiagnostic(diagnostic);

export const classifyDiagnostic = (
  diagnostic: Diagnostic,
  overrides?: {
    provenance?: DiagnosticProvenance;
    trust?: DiagnosticTrust;
  },
): Diagnostic => {
  const provenance = overrides?.provenance ?? diagnostic.provenance ?? inferDiagnosticProvenance(diagnostic);
  const trust = overrides?.trust ?? diagnostic.trust ?? inferDiagnosticTrust(provenance);

  return {
    ...diagnostic,
    provenance,
    trust,
  };
};

const inferDiagnosticProvenance = (diagnostic: Diagnostic): DiagnosticProvenance => {
  if (diagnostic.source === "angular") {
    return "angular-compiler";
  }

  if (diagnostic.source === "knip") {
    return "project-knip";
  }

  if (diagnostic.source === "angular-eslint" || diagnostic.source === "eslint") {
    return "ng-xray-built-in-lint";
  }

  if (diagnostic.source === "ng-xray" && CORE_NATIVE_RULES.has(diagnostic.rule)) {
    return "ng-xray-native-stable";
  }

  return "ng-xray-heuristic";
};

const inferDiagnosticTrust = (provenance: DiagnosticProvenance): DiagnosticTrust =>
  provenance === "angular-compiler" ||
  provenance === "project-eslint" ||
  provenance === "project-knip" ||
  provenance === "ng-xray-native-stable"
    ? "core"
    : "advisory";

const CORE_NATIVE_RULES = new Set([
  "prefer-inject",
  "no-async-lifecycle",
  "feature-isolation",
  "core-shared-boundary",
  "circular-dependency",
  "boundary-violation",
  "public-api-violation",
  "deep-import",
]);
