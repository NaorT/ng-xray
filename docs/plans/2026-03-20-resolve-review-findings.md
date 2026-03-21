# Resolve All Engineering Review Findings

> Plan created: 2026-03-20
> Source: Staff-level adoption-oriented architecture and engineering review
> Status: Pending

All 18 findings from the staff review, in execution order. Grouped by dependency so parallelizable work is clear.

**Cross-cutting constraint: README alignment.** Every phase that adds a CLI flag, changes a rule, modifies config shape, or alters behavior MUST update `README.md` in the same step. The README is the user contract — gaps between docs and implementation are treated as bugs. Phase 6.3 includes a final verification pass, but individual phases must not introduce new drift.

---

## Todos

| ID | Phase | Task | Status |
|----|-------|------|--------|
| p1-bare-catches | 1 | Fix bare catch blocks in scan.ts, circular-injection.ts, cli.ts + fix logger.debug in dead-code-angular.ts + remove no-op normalize | pending |
| p2-signal-contract | 2 | Refactor signal-readiness to return Diagnostic[], move into standard analyzer loop in scan.ts, update tests | pending |
| p3-vitest-config | 3.1 | Create vitest.config.ts with v8 coverage provider and thresholds, add @vitest/coverage-v8 dep | pending |
| p3-html-test | 3.2 | Create HTML report smoke test (html.test.ts) | pending |
| p3-lint-test | 3.3 | Create lint analyzer test + lint-built-in fixture | pending |
| p3-arch-test | 3.4 | Create architecture analyzer test + feature-cross-import fixture | pending |
| p3-dead-angular-test | 3.5 | Create dead-code-angular test + unused-angular-artifacts fixture | pending |
| p3-dead-members-test | 3.6 | Create dead-members test + unused-members fixture | pending |
| p3-angular-diag-test | 3.7 | Expand angular-diagnostics test with full-flow case | pending |
| p3-circular-test | 3.8 | Create circular-services fixture + positive-case test for circular-injection | pending |
| p3-ci-coverage | 3.9 | Add coverage step to CI workflow | pending |
| p4-dead-code-ast | 4.1 | Replace string matching with ts-morph AST in dead-code-angular.ts | pending |
| p4-forwardref-ast | 4.2 | Replace hasForwardRef string matching with AST in circular-injection.ts | pending |
| p4-secret-patterns | 4.3 | Expand SECRET_PATTERNS in security.ts + add test cases | pending |
| p4-timeout | 4.4 | Add per-analyzer timeout with Promise.race in scan.ts | pending |
| p4-history-rotation | 4.5 | Add MAX_HISTORY_ENTRIES cap in history.ts | pending |
| p5-output-flag | 5.1 | Add --output flag to CLI and update generateHtmlReport to accept outputPath | pending |
| p6-contributing | 6.1 | Create CONTRIBUTING.md | pending |
| p6-rule-docs | 6.2 | Generate per-rule markdown docs from RULE_DOCS + add rule URLs to diagnostics | pending |
| p6-readme-audit | 6.3 | Full README audit — fix unused-class ghost rule, add missing config options, update security description, add --output flag, verify every rule/flag/config matches implementation | pending |
| p7-dependabot | 7.1 | Add .github/dependabot.yml | pending |
| p7-release | 7.2 | Add release workflow (.github/workflows/release.yml) | pending |
| p8-dead-members-ast | 8.1 | (post-v1) Replace regex template matching in dead-members.ts with @angular/compiler AST | pending |

---

## Phase 1 — Error Handling Fixes (30 min)

Quick, surgical fixes to bare-catch violations and logging level issues. No new files needed.

### 1.1 Replace bare `catch` in `buildSharedMaps`

In `packages/ng-xray/src/scan.ts` line 97, the `catch` block swallows errors silently. Add logging:

```typescript
// scan.ts:97 — current
} catch {
  spinner?.fail('Class & template map build failed.');
  return null;
}

// target
} catch (error) {
  spinner?.fail('Class & template map build failed.');
  logger.error(`Class & template map build: ${error instanceof Error ? error.message : String(error)}`);
  return null;
}
```

### 1.2 Replace bare `catch` in `circular-injection.ts`

In `packages/ng-xray/src/analyzers/circular-injection.ts` line 130:

```typescript
// current
} catch { /* read errors */ }

// target
} catch (error) {
  logger.error(`Circular injection: failed to read ${classInfo.filePath} — ${error instanceof Error ? error.message : String(error)}`);
}
```

This also requires adding `import { logger } from '../utils/logger.js';` at the top.

### 1.3 Replace bare `catch` in `cli.ts` open handler

In `packages/ng-xray/src/cli.ts` lines 201-203:

```typescript
// current
} catch {
  // the link is already printed
}

// target
} catch (error) {
  logger.debug(`Could not open report: ${error instanceof Error ? error.message : String(error)}`);
}
```

### 1.4 Fix `logger.debug` to `logger.error` in dead-code-angular

In `packages/ng-xray/src/analyzers/dead-code-angular.ts` line 19:

```typescript
// current
logger.debug(`Dead code (Angular): failed to read ${filePath} — ...`);

// target
logger.error(`Dead code (Angular): failed to read ${filePath} — ...`);
```

### 1.5 Remove no-op `normalize` function in cli.ts

Line 100 of `packages/ng-xray/src/cli.ts` defines `const normalize = (flag?: boolean): boolean | undefined => flag;` which is an identity function. Remove it and use flags directly.

---

## Phase 2 — Signal Readiness Contract Normalization (1 hr)

### 2.1 Refactor `runSignalReadinessAnalyzer` to return `Diagnostic[]`

In `packages/ng-xray/src/analyzers/signal-readiness.ts`, split into two exports:

- `analyzeSignalReadiness(directory)` — already exists, returns `SignalReadinessReport` (no change)
- `runSignalReadinessAnalyzer(directory)` — change return to `Promise<Diagnostic[]>`

```typescript
export const runSignalReadinessAnalyzer = async (directory: string): Promise<Diagnostic[]> => {
  const report = analyzeSignalReadiness(directory);
  const diagnostics: Diagnostic[] = [];
  if (report.score < 50) {
    diagnostics.push({ /* same as now */ });
  }
  return diagnostics;
};
```

### 2.2 Update `scan.ts` to use the standard analyzer loop

Move signal-readiness into the `analyzers` array (lines 143-220), adding it alongside the others. Call `analyzeSignalReadiness` separately (only for the report data) after the main loop:

```typescript
// In the analyzers array:
{
  id: 'signal-readiness',
  label: 'Signal readiness',
  enabled: true,
  run: () => runSignalReadinessAnalyzer(directory),
},

// After Promise.all, get the report separately:
let signalReadiness: SignalReadinessReport | undefined;
try {
  signalReadiness = analyzeSignalReadiness(directory);
} catch (error) {
  logger.debug(`Signal readiness report: ${error instanceof Error ? error.message : String(error)}`);
}
```

Remove the entire block at lines 294-328. Update the import to include `analyzeSignalReadiness`.

### 2.3 Update signal-readiness tests

In `packages/ng-xray/src/analyzers/signal-readiness.test.ts`, update assertions to expect `Diagnostic[]` instead of `{ diagnostics, report }`.

---

## Phase 3 — Test Coverage (4-5 hr)

### 3.1 Create `vitest.config.ts` with coverage

Create `packages/ng-xray/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/__fixtures__/**', 'src/**/*.test.ts'],
      thresholds: {
        lines: 55,
        branches: 45,
      },
    },
  },
});
```

Add `@vitest/coverage-v8` to devDependencies. Add a `test:coverage` script to `packages/ng-xray/package.json`.

### 3.2 HTML report smoke test

Create `packages/ng-xray/src/report/html.test.ts`:

- Import `generateHtmlReport` and construct a minimal `ScanResult` mock
- Test cases:
  1. Returns a valid file path ending in `.html`
  2. File contains `<!doctype html>` and key sections (`ng-xray`, score display, category grid)
  3. User-facing strings are escaped (inject a `filePath` with `<script>` in it, verify `&lt;script&gt;` appears)
  4. Works with empty diagnostics array
  5. Works with history data passed

### 3.3 Lint analyzer tests

Create `packages/ng-xray/src/analyzers/lint.test.ts` and a fixture:

- **Fixture:** `__fixtures__/lint-built-in` — minimal Angular app with NO eslint config, a component missing `standalone: true`, and an `*ngFor` without `trackBy`. This forces built-in mode.
- **Tests:**
  1. Built-in mode returns diagnostics with `source: 'angular-eslint'` or `'eslint'`
  2. Clean project returns empty (use `clean-project` fixture)
  3. Diagnostics have valid `category`, `severity`, `help` fields

### 3.4 Architecture analyzer tests

Create `packages/ng-xray/src/analyzers/architecture.test.ts` and fixtures:

- **Fixture:** `__fixtures__/feature-cross-import` — two feature dirs (`features/auth/`, `features/dashboard/`) where dashboard imports from auth. Add `package.json` with `@angular/core`.
- **Tests:**
  1. Detects `feature-isolation` violation
  2. Clean project returns no architecture diagnostics (use `clean-project`)

### 3.5 Angular dead-code analyzer tests

Create `packages/ng-xray/src/analyzers/dead-code-angular.test.ts` and fixtures:

- **Fixture:** `__fixtures__/unused-angular-artifacts` — component with a selector not used in any template, a pipe not used anywhere, and a service never injected.
- **Tests:**
  1. Detects `unused-component`
  2. Detects `unused-pipe`
  3. Detects `unused-service`
  4. Clean project returns empty

### 3.6 Dead members analyzer tests

Create `packages/ng-xray/src/analyzers/dead-members.test.ts`:

- **Fixture:** `__fixtures__/unused-members` — component with a private method not referenced in template or TS.
- **Tests:**
  1. Detects `unused-class-member`
  2. Clean project returns empty

### 3.7 Angular diagnostics full-flow test

Expand `packages/ng-xray/src/analyzers/angular-diagnostics.test.ts`:

- The `full-project` fixture already has a tsconfig. Add a test that runs `runAngularDiagnosticsAnalyzer(fixtureDir('full-project'))` and asserts it returns `Diagnostic[]` (may be empty, but the function completes without throwing).

### 3.8 Circular injection positive-case test

Expand `packages/ng-xray/src/analyzers/circular-injection.test.ts`:

- **Fixture:** `__fixtures__/circular-services` — two services that inject each other (A injects B, B injects A).
- **Test:** Detects `circular-service-injection` or `forward-ref-usage`.

### 3.9 Add coverage step to CI

Update `.github/workflows/ci.yml` to run `pnpm test -- --coverage` (or add a separate step). The thresholds in vitest.config.ts will fail CI if coverage drops.

---

## Phase 4 — Analyzer Hardening (5-6 hr)

### 4.1 Replace string matching in `dead-code-angular.ts` with AST

Refactor the three string-matching helpers in `packages/ng-xray/src/analyzers/dead-code-angular.ts`:

- **`isClassImportedAnywhere`** (line 55): Replace `content.includes(className)` with ts-morph import declaration analysis. Parse each file, walk `ImportDeclaration` nodes, check if any named import matches `className`.
- **`isClassReferencedInRoutes`** (line 34): Parse route files with TypeScript AST. Look for `component:` or `loadComponent:` property assignments referencing the class name as an identifier.
- **`isClassReferencedInProviders`** (line 42): Parse with ts-morph, walk `PropertyAssignment` nodes named `providers`, check array elements for the class name as an identifier.
- **`extractPipeName`** (line 26): Replace regex with ts-morph: find `@Pipe` decorator, get `name` property from the decorator argument object literal.

Each helper should use the already-instantiated ts-morph `Project` (add a shared `morphProject` parameter or create one at the top of `runAngularDeadCodeAnalyzer`).

### 4.2 Replace `hasForwardRef` string matching in `circular-injection.ts`

In `packages/ng-xray/src/analyzers/circular-injection.ts` line 72, replace `content.includes('forwardRef')` with AST: parse the file with TypeScript compiler API (already imported), find `CallExpression` nodes where the callee is `forwardRef`.

### 4.3 Expand secret detection patterns in `security.ts`

Add patterns to `packages/ng-xray/src/analyzers/security.ts` `SECRET_PATTERNS` array:

```typescript
{ pattern: /ghp_[A-Za-z0-9]{36}/, label: 'GitHub personal access token' },
{ pattern: /gho_[A-Za-z0-9]{36}/, label: 'GitHub OAuth token' },
{ pattern: /ghs_[A-Za-z0-9]{36}/, label: 'GitHub App token' },
{ pattern: /xox[bpars]-[A-Za-z0-9-]{10,}/, label: 'Slack token' },
{ pattern: /npm_[A-Za-z0-9]{36}/, label: 'npm access token' },
{ pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/, label: 'Private key' },
{ pattern: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/, label: 'SendGrid API key' },
```

Add corresponding test cases in `packages/ng-xray/src/analyzers/security.test.ts`.

Update README `hardcoded-secret` description to mention the expanded patterns.

### 4.4 Add per-analyzer timeout

In `packages/ng-xray/src/scan.ts`, wrap each analyzer execution in a `Promise.race` with a timeout:

```typescript
const ANALYZER_TIMEOUT_MS = 120_000; // 2 minutes

const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms),
    ),
  ]);

// In the Promise.all map:
const diagnostics = await withTimeout(analyzer.run(), ANALYZER_TIMEOUT_MS, analyzer.label);
```

Timeout errors are caught by the existing catch block and become `failedAnalyzers` entries.

### 4.5 Add history rotation

In `packages/ng-xray/src/history.ts`, add a `MAX_HISTORY_ENTRIES = 100` constant. In `appendHistory`, after pushing the new entry, trim from the front if length exceeds the cap:

```typescript
if (data.entries.length > MAX_HISTORY_ENTRIES) {
  data.entries = data.entries.slice(-MAX_HISTORY_ENTRIES);
}
```

Update README "Baseline and History" section to note the 100-entry cap.

---

## Phase 5 — CLI & Report Improvements (1.5 hr)

### 5.1 Add `--output <path>` flag

In `packages/ng-xray/src/cli.ts`, add `.option('--output <path>', 'write HTML report to this path instead of tmpdir')`. Pass it to `generateHtmlReport`. In `packages/ng-xray/src/report/html.ts`, accept an optional `outputPath` parameter:

```typescript
export const generateHtmlReport = (
  result: ScanResult,
  history?: HistoryData,
  outputPath?: string,
): string => {
  const dir = outputPath
    ? path.dirname(outputPath)
    : path.join(tmpdir(), `ng-xray-${Date.now()}`);
  // ...
```

Update README CLI Reference section with the new flag.

---

## Phase 6 — Documentation (2-3 hr)

### 6.1 Create `CONTRIBUTING.md`

Create `CONTRIBUTING.md` at repo root covering:

- Prerequisites (Node 20+, pnpm 10+)
- Dev setup (`pnpm install`, `pnpm dev`, `pnpm test`)
- Adding an analyzer (reference the `add-analyzer` skill checklist)
- Running against fixtures (`pnpm test`, fixture conventions)
- PR expectations (tests, typecheck, lint pass)
- Code conventions (ESM, `.js` imports, AST over string matching)

### 6.2 Generate per-rule documentation

Create a script or build step that reads `RULE_DOCS` from `packages/ng-xray/src/report/rule-docs.ts` and generates markdown files in `docs/rules/`. Each file contains: title, category, severity, why it matters, before/after code, effort, estimated fix time.

Structure:
```
docs/rules/
  missing-onpush.md
  prefer-inject.md
  no-async-lifecycle.md
  ...
  README.md  (index with links to all rules)
```

Add the rule URL pattern to diagnostic `help` text where applicable.

### 6.3 Full README audit and alignment

The README must be a ground-truth reflection of the implementation at all times. Audit every section and fix the following confirmed gaps:

**Bug fixes (README claims something that doesn't exist):**

- **Line 160: Remove `unused-class` ghost rule.** The Dead Code (Angular) table lists `| unused-class | Classes with no usage |` but no such rule exists in `dead-code-angular.ts`. The analyzer only emits: `unused-component`, `unused-directive`, `unused-pipe`, `unused-service`, `unused-guard`, `unused-interceptor`, `unused-resolver`. Delete the `unused-class` row.

**Missing config options:**

- **Add `"architecture": true/false` boolean form** to the config example (line 240). Currently only the object form is shown, but `NgXrayConfig` in `packages/ng-xray/src/types.ts` line 166 supports `architecture?: boolean | ArchitectureAnalyzerConfig`.
- **Add `"verbose": true` option** to the config example. `NgXrayConfig` (types.ts line 168) supports `verbose?: boolean` but the README config example omits it.

**Updates required after other phases complete:**

- **Phase 4.3 (secret patterns):** Update the `hardcoded-secret` description (line 176) from "Hardcoded API keys, Bearer tokens, AWS keys, and secret variable assignments" to also mention GitHub tokens, Slack tokens, npm tokens, private keys, and SendGrid keys.
- **Phase 5.1 (--output flag):** Add `--output <path>` to the CLI Reference table (after `--open`) with description "Write HTML report to this path instead of tmpdir".
- **Phase 4.5 (history rotation):** Add a note in the "Baseline and History" section that history is capped at the most recent 100 entries.

**Full verification pass:**

After all phases are complete, do a final pass verifying:
1. Every rule listed in the README tables exists in the corresponding analyzer source file
2. Every CLI flag in the README matches the Commander options in `packages/ng-xray/src/cli.ts`
3. Every config key in the README example matches `NgXrayConfig` in `packages/ng-xray/src/types.ts`
4. Every exit code matches `EXIT_CODES` in `packages/ng-xray/src/constants.ts`
5. The scoring section matches the caps in `CATEGORY_MAX_DEDUCTIONS` and weights in `SEVERITY_WEIGHTS`
6. Angular version claims match the compatibility matrix and CI test cases
7. The "What It Does" section accurately counts analyzers

---

## Phase 7 — CI/CD & Supply Chain (1.5 hr)

### 7.1 Add Dependabot config

Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    groups:
      angular:
        patterns: ["@angular/*", "angular-eslint"]
      eslint:
        patterns: ["eslint*", "typescript-eslint"]
```

### 7.2 Add release workflow

Create `.github/workflows/release.yml` with manual dispatch:

- Trigger: `workflow_dispatch` with `version` input (patch/minor/major)
- Steps: checkout, pnpm install, build, test, `npm version`, `npm publish`, git tag, push tag
- Requires `NPM_TOKEN` secret

### 7.3 Add coverage reporting to CI

In `.github/workflows/ci.yml`, add after the test step:

```yaml
- name: Test with coverage
  run: pnpm test -- --coverage
```

The threshold enforcement comes from `vitest.config.ts`.

---

## Phase 8 — AST Hardening for Dead Members (3-4 hr, post-v1)

### 8.1 Replace regex template matching in `dead-members.ts`

Replace `ANGULAR_EXPRESSION_CONTEXTS` regex array in `packages/ng-xray/src/analyzers/dead-members.ts` with `@angular/compiler` AST walking. Parse each template with `parseTemplate`, then walk the AST nodes checking `AST` expression trees for `PropertyRead` and `MethodCall` nodes that reference the member name.

This is the most complex refactor and can be deferred post-v1. The current regex approach is documented as experimental.

---

## Execution Order and Parallelism

```
Phase 1 (error handling) ──┬──> Phase 3 (tests) ──> Phase 7 (CI/CD)
Phase 2 (signal contract) ─┘        │
Phase 1 ──> Phase 4 (hardening) ──> Phase 8 (post-v1)
Phase 5 (CLI) ──> Phase 6 (docs) ──> Phase 7 (CI/CD)
```

Phases 1 and 2 are independent and can run in parallel. Phase 3 depends on 1+2 (tests should validate the fixes). Phase 4 depends on 1. Phase 5 and 6 are independent of everything else. Phase 7 depends on 3+6. Phase 8 is post-v1.

## Estimated Total Effort

- Phase 1: 30 min
- Phase 2: 1 hr
- Phase 3: 4-5 hr
- Phase 4: 5-6 hr
- Phase 5: 1.5 hr
- Phase 6: 2-3 hr
- Phase 7: 1.5 hr
- Phase 8: 3-4 hr (post-v1)

**Total pre-v1: ~16-18 hours**
**Post-v1 (Phase 8): ~3-4 hours**
