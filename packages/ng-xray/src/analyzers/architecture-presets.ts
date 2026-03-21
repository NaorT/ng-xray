import type { ArchitecturePreset, BoundaryRule, DeepImportRule, PublicApiRule } from "../types.js";

export const getPresetRules = (
  preset: ArchitecturePreset,
): {
  boundaries: BoundaryRule[];
  publicApi: PublicApiRule[];
  deepImports: DeepImportRule[];
} => {
  switch (preset) {
    case "angular-feature-shell":
      return {
        boundaries: [
          {
            from: "src/app/features/**",
            disallowImportFrom: ["src/app/features/**"],
            severity: "error",
            message: "Feature modules must not import from other features. Extract shared code to shared/ or core/.",
          },
          {
            from: "src/app/shared/**",
            disallowImportFrom: ["src/app/features/**"],
            severity: "error",
            message: "Shared modules must not import from feature modules.",
          },
          {
            from: "src/app/core/**",
            disallowImportFrom: ["src/app/features/**"],
            severity: "error",
            message: "Core modules must not import from feature modules.",
          },
        ],
        publicApi: [
          {
            zone: "src/app/features/*",
            onlyAllowImportFrom: ["index.ts"],
            severity: "warning",
            message: "Import from the feature's public API (index.ts) instead of internal files.",
          },
          {
            zone: "src/app/shared/*",
            onlyAllowImportFrom: ["index.ts"],
            severity: "warning",
            message: "Import from the shared module's public API (index.ts) instead of internal files.",
          },
        ],
        deepImports: [
          {
            pattern: "@angular/*/src/**",
            severity: "error",
            message: "Do not import from Angular internal paths.",
          },
          {
            pattern: "@ngrx/*/src/**",
            severity: "warning",
            message: "Do not import from NgRx internal paths.",
          },
        ],
      };
    case "angular-domain-driven":
      return {
        boundaries: [
          {
            from: "src/app/domains/**",
            disallowImportFrom: ["src/app/domains/**"],
            severity: "error",
            message: "Domain modules must not import from other domains. Use shared interfaces or a mediator.",
          },
          {
            from: "src/app/domains/**",
            disallowImportFrom: ["src/app/infrastructure/**"],
            severity: "warning",
            message: "Domain modules should not depend directly on infrastructure. Use dependency inversion.",
          },
        ],
        publicApi: [
          {
            zone: "src/app/domains/*",
            onlyAllowImportFrom: ["index.ts", "public-api.ts"],
            severity: "warning",
            message: "Import from the domain's public API instead of internal files.",
          },
          {
            zone: "src/app/libs/*",
            onlyAllowImportFrom: ["index.ts", "public-api.ts"],
            severity: "warning",
          },
        ],
        deepImports: [
          {
            pattern: "@angular/*/src/**",
            severity: "error",
            message: "Do not import from Angular internal paths.",
          },
        ],
      };
    default:
      return { boundaries: [], publicApi: [], deepImports: [] };
  }
};
