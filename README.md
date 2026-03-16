# ng-xray

Diagnose and fix health issues in your Angular app. One command, 0-100 score, actionable remediation.

[![Angular 15+](https://img.shields.io/badge/Angular-15%2B-DD0031?logo=angular&logoColor=white)](https://angular.dev)
[![Node 20+](https://img.shields.io/badge/Node-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![License MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Quick Start

```bash
npx ng-xray .
npx ng-xray --json
npx ng-xray --score
npx ng-xray --sarif > results.sarif
```

## What It Does

- Runs 10+ analyzers across lint, performance, architecture, dead code, and security
- Produces a 0-100 health score with per-category breakdown
- Generates a self-contained HTML report with a prioritized remediation plan
- Supports baseline and history for tracking progress over time
- Outputs JSON, SARIF (for GitHub Code Scanning), and PR summary markdown

## Lint Behavior

ng-xray supports two lint modes:

- **Ingest mode** (default when ESLint config exists): uses your project's own ESLint setup. This is the trusted path for CI.
- **Built-in mode** (fallback when no ESLint config found): runs a curated set of angular-eslint and rxjs-x rules. Useful for quick first-run discovery.

If your project has an ESLint config that is broken, the lint analyzer will fail and the scan becomes `partial`. ng-xray does not silently fall back to built-in rules when a project config exists but is broken.

## Analyzer Categories

### Stable analyzers

Each finding includes a `source` field (e.g., `angular`, `angular-eslint`, `eslint`, `ng-xray`, `knip`) and a `stability` field (`stable` or `experimental`). Stable findings have low false-positive rates and are suitable for CI gating.

**Angular Extended Diagnostics** — official Angular compiler checks (source: `angular`)

Runs the Angular compiler (`ngc --noEmit`) to capture extended diagnostics. These are the highest-trust signals — they come directly from the framework.

| Rule | What it catches |
|------|----------------|
| `NG8101` | Banana-in-box syntax error (`([ngModel])` instead of `[(ngModel)]`) |
| `NG8102` | Nullish coalescing on non-nullable value |
| `NG8103` | Missing control flow directive import |
| `NG8104` | Text attribute that looks like a binding |
| `NG8105` | Missing `let` in `*ngFor` |
| `NG8106` | Unsupported suffix |
| `NG8107` | Optional chain on non-nullable value |
| `NG8108` | Non-static `ngSkipHydration` |
| `NG8109` | Signal used in interpolation without invocation |
| `NG8111` | Function referenced in event binding without invocation |

When Angular diagnostics overlap with ESLint findings (e.g., NG8101 and `banana-in-box`), the Angular-sourced finding is preferred and the ESLint duplicate is dropped.

Requires `@angular/compiler-cli` in the project (standard for Angular projects). If `ngc` is not available or the project is not buildable, the analyzer is silently skipped.

**Lint** — angular-eslint rules, rxjs-x rules, template rules

| Rule | Severity | Category |
|------|----------|----------|
| `prefer-standalone` | warning | best-practices |
| `prefer-on-push-component-change-detection` | warning | performance |
| `use-lifecycle-interface` | warning | best-practices |
| `no-empty-lifecycle-method` | warning | dead-code |
| `contextual-lifecycle` | error | best-practices |
| `no-output-native` | warning | best-practices |
| `template/use-track-by-function` | warning | performance |
| `template/banana-in-box` | error | best-practices |
| `template/cyclomatic-complexity` | warning | performance |
| `template/conditional-complexity` | warning | performance |
| `template/no-duplicate-attributes` | warning | best-practices |
| `template/alt-text` | warning | best-practices |
| `template/click-events-have-key-events` | warning | best-practices |
| `rxjs-x/no-unsafe-takeuntil` | error | best-practices |
| `rxjs-x/no-ignored-subscription` | warning | best-practices |

**Performance** — missing OnPush, large components, heavy constructors, barrel bloat, eager routes

| Rule | What it catches |
|------|----------------|
| `missing-onpush` | Components without `ChangeDetectionStrategy.OnPush` |
| `large-component` | Component files exceeding the LOC threshold (default 300) |
| `heavy-constructor` | Constructors with more than 5 statements |
| `barrel-re-export-bloat` | Barrel files with wildcard re-exports that prevent tree-shaking |
| `eager-route-component` | Route definitions using `component:` instead of `loadComponent` |
| `eager-route-children` | Inlined `children:` arrays instead of `loadChildren` |

**Architecture** — feature isolation, core/shared boundary, circular dependencies, configurable boundary rules

| Rule | What it catches |
|------|----------------|
| `feature-isolation` | Feature module importing from another feature module |
| `core-shared-boundary` | `shared/` or `core/` importing from `features/` |
| `circular-dependency` | Circular import chains between files |
| `boundary-violation` | Import crossing a configured module boundary |
| `public-api-violation` | Import bypassing a zone's barrel file (index.ts) |
| `deep-import` | Import reaching into a package's internal paths |

The last three rules are powered by the **architecture rules engine** — see [Architecture Rules](#architecture-rules) below.

**Best Practices** — prefer inject(), no async lifecycle hooks

| Rule | What it catches |
|------|----------------|
| `prefer-inject` | Constructor injection instead of the `inject()` function |
| `no-async-lifecycle` | `async ngOnInit()` and other lifecycle hooks Angular will not await |

### Experimental analyzers

Heuristic-based. May produce false positives. Experimental findings are downweighted by 50% in score calculation so they cannot dominate the score.

**Dead Code (generic)** — unused files, exports, dependencies (via Knip)

Prefers the project's local Knip installation when available. Falls back to `npx knip`.

| Rule | What it catches |
|------|----------------|
| `unused-file` | Files not imported anywhere |
| `unused-export` | Exported symbols with no consumers |
| `unused-dependency` | Dependencies declared but never imported |
| `unused-dev-dependency` | Dev dependencies declared but never imported |
| `duplicate-export` | The same symbol exported from multiple files |
| `unused-type` | Exported types with no consumers |

**Dead Code (Angular)** — unused components, services, directives, pipes, guards

| Rule | What it catches |
|------|----------------|
| `unused-component` | Components with no selector usage or route reference |
| `unused-service` | Services never injected anywhere |
| `unused-directive` | Directives with no selector usage |
| `unused-pipe` | Pipes never referenced in templates |
| `unused-guard` | Guards not referenced in route definitions |
| `unused-interceptor` | Interceptors not registered |
| `unused-resolver` | Resolvers not referenced in route definitions |
| `unused-class` | Classes with no usage |

**Dead Members** — unused class properties and methods

| Rule | What it catches |
|------|----------------|
| `unused-class-member` | Properties and methods not referenced in the class body or template (inheritance-aware) |

**Security** — bypass sanitization, eval usage, hardcoded secrets, innerHTML binding

Detection uses AST analysis (ts-morph for TypeScript, @angular/compiler for templates).

| Rule | Severity | What it catches |
|------|----------|----------------|
| `bypass-security-trust` | error | `bypassSecurityTrust*` calls that disable Angular's built-in XSS sanitization |
| `eval-usage` | error | `eval()` and `new Function()` usage enabling code injection |
| `hardcoded-secret` | error | Hardcoded API keys, Bearer tokens, AWS keys, and secret variable assignments |
| `innerhtml-binding` | warning | `[innerHTML]` bindings in templates that can expose XSS risks |

**Signal Readiness** — legacy vs modern Angular pattern scoring

Counts legacy patterns (`@Input`, `@Output`, `BehaviorSubject`, `.subscribe()`) vs modern equivalents (`input()`, `output()`, `signal()`, `toSignal()`), and produces a percentage readiness score with a per-pattern migration plan.

**Circular Injection** — service injection cycle detection

| Rule | What it catches |
|------|----------------|
| `circular-service-injection` | Services with circular `inject()` or constructor injection |
| `forward-ref-usage` | `forwardRef()` calls (usually masking circular deps) |

## CLI Reference

```
ng-xray [directory]          Scan a project
ng-xray baseline [directory] Save/clear baseline
ng-xray history [directory]  View scan history

Options:
  --lint               Run lint checks (re-enable if disabled in config)
  --no-lint            Skip lint checks
  --dead-code          Run dead code checks
  --no-dead-code       Skip dead code detection
  --architecture       Run architecture checks
  --no-architecture    Skip architecture checks
  --performance        Run performance checks
  --no-performance     Skip performance checks
  --verbose            Show file details per rule
  --score              Output only the score (0-100)
  --json               Output full results as JSON
  --sarif              Output results as SARIF 2.1.0 JSON
  --pr-summary         Output results as PR comment markdown
  --open               Open HTML report in browser after scan
  --watch              Watch for changes and re-scan
  --fail-under <score> Exit with code 3 if score is below threshold
  --project <name>     Scan a specific project in an Angular workspace
  --ignore-baseline    Ignore baseline, show all issues
  -v, --version        Show version
```

## Configuration

Config file: `ng-xray.config.json` (plain JSON only — JSONC is not supported).

Or in `package.json` under the `"ngXray"` key.

Available options:

```json
{
  "lint": true,
  "deadCode": true,
  "performance": true,
  "ignore": {
    "rules": ["missing-onpush"],
    "files": ["**/legacy/**"]
  },
  "thresholds": {
    "component-loc": 300
  },
  "architecture": {
    "featurePaths": ["features"],
    "sharedPaths": ["shared", "core"],
    "preset": "angular-feature-shell",
    "boundaries": [],
    "publicApi": [],
    "deepImports": []
  }
}
```

Precedence: explicit CLI flags > config file > defaults.

## Scoring

- Score is 0-100, sum of 5 categories
- Categories: Best Practices (25), Performance (20), Architecture (20), Dead Code (20), Security (15)
- Per-rule and per-category caps prevent any single rule from dominating
- Density scaling adjusts deductions based on project size
- Experimental findings are downweighted by 50%
- Labels: Excellent (85+), Good (70+), Needs Work (50+), Critical (<50)

```
Category caps:
  Best Practices   -25 max
  Performance      -20 max
  Architecture     -20 max
  Dead Code        -20 max
  Security         -15 max
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Scan complete |
| `1` | Fatal error (not an Angular project, etc.) |
| `2` | Partial scan (one or more analyzers failed) |
| `3` | Score below `--fail-under` threshold |

Precedence: fatal (1) > partial (2) > threshold failure (3).

## CI Usage

```bash
# Gate on score threshold
npx ng-xray . --fail-under 70

# SARIF for GitHub Code Scanning
npx ng-xray . --sarif > ng-xray.sarif

# PR summary for GitHub Actions
npx ng-xray . --pr-summary > summary.md

# JSON for custom processing
npx ng-xray . --json > results.json

# Conservative (stable analyzers only)
npx ng-xray . --no-dead-code --json
```

Machine-readable modes (`--score`, `--json`, `--sarif`, `--pr-summary`) are side-effect free: they do not append scan history and they do not generate the HTML report.

When `scanStatus` is `"partial"` in JSON output, one or more analyzers failed. The score may not reflect full project health. Do not rely on score thresholds for CI gates when the scan is partial.

## Baseline and History

```bash
npx ng-xray baseline .           # Save current issues as baseline
npx ng-xray .                    # Future runs only show new issues
npx ng-xray . --ignore-baseline  # Show all issues anyway
npx ng-xray baseline . --clear   # Remove baseline
npx ng-xray history .            # View scan history
```

History entries are appended during the default terminal scan flow. Use the machine-readable output modes when you need side-effect-free CI automation.

## HTML Report

The HTML report is generated during the default terminal scan flow, and its path is printed to the terminal. Use `--open` to also open it in the browser.

The report is a single `.html` file with inline CSS and JS. It includes:

- Score hero with category breakdown
- Trend chart (when history exists)
- Signal readiness gauge
- File heatmap
- Prioritized remediation plan with "Fix in Cursor" integration
- Searchable findings with before/after code examples

The report uses system fonts and has no external dependencies. It works fully offline.

## Architecture Rules

ng-xray includes a configurable architecture rules engine that enforces module boundaries, public API discipline, and deep-import constraints — without requiring Nx.

### Presets

Use a preset to get started quickly. Presets provide boundary, public API, and deep-import rules for common Angular structures.

```json
{
  "architecture": {
    "preset": "angular-feature-shell"
  }
}
```

Available presets:

| Preset | Structure | What it enforces |
|--------|-----------|-----------------|
| `angular-feature-shell` | `features/`, `shared/`, `core/` | Feature isolation, shared/core boundaries, barrel imports, no Angular/NgRx deep imports |
| `angular-domain-driven` | `domains/`, `libs/`, `infrastructure/` | Domain isolation, infrastructure inversion, barrel imports |

### Custom Rules

Add custom rules alongside or instead of a preset:

```json
{
  "architecture": {
    "preset": "angular-feature-shell",
    "boundaries": [
      {
        "from": "src/app/features/**",
        "disallowImportFrom": ["src/app/legacy/**"],
        "severity": "warning",
        "message": "Features should not depend on legacy code."
      }
    ],
    "publicApi": [
      {
        "zone": "src/app/shared/*",
        "onlyAllowImportFrom": ["index.ts"],
        "severity": "warning"
      }
    ],
    "deepImports": [
      {
        "pattern": "@company/*/internal/**",
        "severity": "error",
        "message": "Do not import from internal package paths."
      }
    ]
  }
}
```

**Boundary rules** prevent imports from one zone to another. Self-imports within the same zone (e.g., `features/auth` importing from `features/auth`) are automatically allowed.

**Public API rules** require that imports into a zone go through a barrel file (e.g., `index.ts`). Direct imports into internal files are flagged.

**Deep import rules** catch imports that reach into third-party package internals (e.g., `@angular/core/src/...`).

Custom rules are merged with preset rules — presets run first, then your custom rules add on top.

## Workspace Support

ng-xray detects Angular workspaces via `angular.json`:

- **Single project**: scans automatically (no flag needed)
- **Multi-project workspace**: warns and scans the default project. Use `--project <name>` to target a specific project.

```bash
npx ng-xray . --project my-app
```

## Supported Project Shapes

- Standard Angular CLI app (`src/app/`)
- Standalone-heavy apps
- Projects without `src/` directory (analyzers auto-detect)
- Angular CLI multi-project workspaces (`angular.json`)
- Nx workspaces (detected via `nx.json`)
- Libraries with `src/` directory

## Requirements

- **Node.js** 20+
- **Angular** 15+ (detects 15.x through 21.x)
- Works with standalone and NgModule-based projects
- No build step required — scans source files directly

## License

[MIT](LICENSE)
