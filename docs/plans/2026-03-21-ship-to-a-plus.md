# Ship ng-xray to A+ — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Resolve every finding from the 2026-03-21 staff engineering review (2 critical, 7 important, 8 minor) and bring the project from B+/A- to a clean A+ across security, reliability, architecture, DX, and testing.

**Architecture:** Fix-forward approach — each task is a standalone fix that doesn't break others. Tasks are grouped into 5 batches ordered by severity. Each batch can be committed independently. Within a batch, tasks are independent and can run in parallel.

**Tech Stack:** TypeScript, Vitest, ts-morph, Node.js 20+, ESM

**Review reference:** `.cursor/visual-explainer-output/staff-review-2026-03-21.html`

---

## Batch 1: Critical Security + Quick Reliability (ship-blockers)

### Task 1: S-2 — Remove unpinned `npx knip` fallback

When the scanned project doesn't have Knip installed locally, the analyzer currently falls back to `npx knip` which fetches arbitrary code from the registry. Remove this fallback — if Knip is missing, skip the analyzer gracefully.

**Files:**
- Modify: `packages/ng-xray/src/analyzers/dead-code.ts`
- Modify: `packages/ng-xray/src/analyzers/dead-code.test.ts`

**Step 1: Write a failing test**

In `dead-code.test.ts`, add a test that scans a fixture without Knip installed and verifies the analyzer returns `[]` without throwing:

```typescript
it('returns empty when knip is not installed (no fallback to npx)', async () => {
  // clean-project fixture has no local knip binary
  const diags = await runDeadCodeAnalyzer(fixtureDir('clean-project'));
  expect(diags).toEqual([]);
});
```

Run: `pnpm test -- --reporter=verbose dead-code.test`
Expected: Likely already passes since clean-project has no issues, but validates the path.

**Step 2: Modify `resolveKnipBinary` to return `null` instead of npx fallback**

In `dead-code.ts`, change `resolveKnipBinary`:

```typescript
const resolveKnipBinary = (directory: string): { command: string; args: string[]; mode: KnipMode } | null => {
  const localBin = path.join(directory, 'node_modules', '.bin', 'knip');
  if (existsSync(localBin)) {
    logger.debug(`Dead code: using local Knip at ${localBin}`);
    return { command: localBin, args: ['--reporter', 'json', '--no-progress'], mode: 'local' };
  }

  logger.debug('Dead code: no local Knip found — skipping dead code analysis. Install knip as a devDependency to enable.');
  return null;
};
```

**Step 3: Update `runDeadCodeAnalyzer` to handle `null`**

```typescript
export const runDeadCodeAnalyzer = async (directory: string): Promise<Diagnostic[]> => {
  const resolved = resolveKnipBinary(directory);
  if (!resolved) return [];

  const { command, args, mode } = resolved;
  // ... rest unchanged
};
```

**Step 4: Remove `KnipMode` type's `'fallback'` variant**

Change `type KnipMode = 'local' | 'fallback';` to `type KnipMode = 'local';` and remove the `classifyKnipDiagnostic` branch that handles `'fallback'`. Since only `'local'` remains, all Knip diagnostics get `provenance: 'project-knip'` and `trust: 'core'`.

Simplify `classifyKnipDiagnostic`:

```typescript
const classifyKnipDiagnostic = (diagnostic: Diagnostic): Diagnostic =>
  classifyDiagnostic(diagnostic, { provenance: 'project-knip', trust: 'core' });
```

Update all call sites to remove the `mode` parameter from `classifyKnipDiagnostic` and `parseKnipOutput`.

**Step 5: Run tests**

Run: `pnpm test -- --reporter=verbose dead-code`
Expected: All pass.

**Step 6: Commit**

```bash
git add packages/ng-xray/src/analyzers/dead-code.ts packages/ng-xray/src/analyzers/dead-code.test.ts
git commit -m "fix(security): remove unpinned npx knip fallback (S-2)

When Knip is not installed locally, the analyzer now skips gracefully
instead of falling back to npx (which fetches arbitrary code from npm).
All Knip diagnostics are now core trust since they require local install."
```

---

### Task 2: R-2 — Fix timer leak in `withTimeout`

**Files:**
- Modify: `packages/ng-xray/src/scan.ts`

**Step 1: Replace the `withTimeout` function**

Find (lines ~249–255):

```typescript
const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms),
    ),
  ]);
```

Replace with:

```typescript
const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    }),
  ]);
};
```

**Step 2: Run tests**

Run: `pnpm test -- --reporter=verbose scan.test`
Expected: All pass.

**Step 3: Commit**

```bash
git add packages/ng-xray/src/scan.ts
git commit -m "fix(reliability): clear timeout on successful analyzer completion (R-2)

Prevents 12 dangling 120s timers that could delay process exit."
```

---

### Task 3: A-4 — Replace `console.log` with `logger` in scan.ts

**Files:**
- Modify: `packages/ng-xray/src/scan.ts`

**Step 1: Find the console.log call**

Around line 305, find:

```typescript
console.log(`  Baseline: ${suppressed} known issues suppressed.`);
```

Replace with:

```typescript
logger.dim(`  Baseline: ${suppressed} known issues suppressed.`);
```

**Step 2: Run tests**

Run: `pnpm test -- --reporter=verbose scan.test`
Expected: All pass.

**Step 3: Commit**

```bash
git add packages/ng-xray/src/scan.ts
git commit -m "fix: use logger instead of console.log for baseline message (A-4)

Prevents output from leaking into JSON/SARIF modes."
```

---

## Batch 2: Security Hardening

### Task 4: S-1 — Add `--no-exec` safe mode + security trust model documentation

The tool runs external binaries (ngc, eslint, knip, dependency-cruiser) from the scanned project. This is inherent to its function but should be (a) documented and (b) skippable for auditing scenarios.

**Files:**
- Modify: `packages/ng-xray/src/types.ts`
- Modify: `packages/ng-xray/src/cli.ts`
- Modify: `packages/ng-xray/src/scan.ts`
- Modify: `packages/ng-xray/src/scan.test.ts`
- Modify: `README.md`

**Step 1: Add `noExec` to `ScanOptions`**

In `types.ts`, add to the `ScanOptions` interface:

```typescript
noExec?: boolean;
```

**Step 2: Wire up `--no-exec` CLI flag**

In `cli.ts`, add the option after the `--ignore-baseline` line:

```typescript
.option('--no-exec', 'skip analyzers that execute external tools (ngc, eslint, knip, dep-cruiser)', false)
```

Add `noExec` to `CliFlags` interface and pass it into `scanOptions`:

```typescript
noExec: flags.noExec,
```

**Step 3: Implement in `scan.ts`**

The analyzers that shell out are: `angular-diagnostics`, `lint`, `dead-code-generic`, `architecture`. When `options.noExec` is true, disable these by setting `enabled: false`.

In the `analyzers` array, modify the `enabled` condition for these four:

```typescript
{
  id: 'angular-diagnostics',
  label: 'Angular diagnostics',
  enabled: !options.noExec,
  run: () => runAngularDiagnosticsAnalyzer(directory),
},
{
  id: 'lint',
  label: 'Lint checks',
  enabled: effective.lint !== false && !options.noExec,
  run: () => runLintAnalyzer(directory),
},
{
  id: 'dead-code-generic',
  label: 'Dead code (generic)',
  enabled: effective.deadCode !== false && !options.noExec,
  run: () => runDeadCodeAnalyzer(directory),
},
// ... architecture stays the same since dependency-cruiser runs in-process
```

Note: `architecture` uses dependency-cruiser's JS API (not a child process), so it's safe. Leave it enabled. ESLint is also loaded as a JS API, but it loads project plugins (arbitrary code). Mark `lint` as exec-dependent.

**Step 4: Write test**

In `scan.test.ts`:

```typescript
it('skips exec-dependent analyzers when noExec is true', async () => {
  const result = await scan(fixtureDir('clean-project'), { noExec: true });
  const skippedIds = result.analyzerRuns
    .filter(a => a.status === 'skipped')
    .map(a => a.id);
  expect(skippedIds).toContain('angular-diagnostics');
  expect(skippedIds).toContain('lint');
  expect(skippedIds).toContain('dead-code-generic');
  expect(result.scanStatus).toBe('complete');
});
```

Run: `pnpm test -- --reporter=verbose scan.test`
Expected: Pass.

**Step 5: Add Security section to README.md**

After the "Requirements" section, add:

```markdown
## Security Model

ng-xray scans Angular projects by running a combination of static AST analysis and external tools. Some analyzers execute binaries from the scanned project's `node_modules`:

| Analyzer | Executes | Binary |
|---|---|---|
| Angular diagnostics | Yes | `node_modules/.bin/ngc` |
| Lint | Yes | ESLint (loads project plugins) |
| Dead code (generic) | Yes | `node_modules/.bin/knip` |
| Architecture | No | dependency-cruiser JS API |
| All others | No | Static AST analysis only |

**Trust boundary:** When you run `ng-xray` on a project, you are trusting that project's dependencies. This is the same trust model as running `npm test` or `npx eslint`.

**Safe mode:** Use `--no-exec` to skip all analyzers that execute external tools. This leaves only the static AST analyzers (best practices, performance, dead code Angular, dead members, circular injection, security, signal readiness) — useful for auditing untrusted codebases.
```

**Step 6: Run full test suite**

Run: `pnpm test`
Expected: All pass.

**Step 7: Commit**

```bash
git add packages/ng-xray/src/types.ts packages/ng-xray/src/cli.ts packages/ng-xray/src/scan.ts packages/ng-xray/src/scan.test.ts README.md
git commit -m "feat(security): add --no-exec safe mode and document trust model (S-1)

Adds a --no-exec flag that skips analyzers executing external binaries
(ngc, eslint, knip). Documents the security trust model in README."
```

---

### Task 5: S-3 — Reduce secret detection false positives

**Files:**
- Modify: `packages/ng-xray/src/analyzers/security.ts`
- Modify: `packages/ng-xray/src/analyzers/security.test.ts`

**Step 1: Add placeholder value exclusion**

In `security.ts`, add a set of known placeholder values that should not trigger the catch-all pattern, and a minimum length check. Above `checkHardcodedSecrets`, add:

```typescript
const PLACEHOLDER_VALUES = new Set([
  'todo', 'changeme', 'change-me', 'replace-me', 'placeholder',
  'xxx', 'yyy', 'zzz', 'test', 'dummy', 'fake', 'mock',
  'your-api-key', 'your-token', 'your-secret', 'insert-key-here',
  'process.env', 'environment',
]);

const looksLikePlaceholder = (value: string): boolean => {
  const cleaned = value.replace(/^['"`]|['"`]$/g, '').trim().toLowerCase();
  return PLACEHOLDER_VALUES.has(cleaned) || cleaned.length < 8;
};
```

**Step 2: Apply to catch-all pattern only**

In the `checkHardcodedSecrets` function, modify the loop to check `looksLikePlaceholder` only for the catch-all `apiKey|api_key|secret|token|password` pattern (the last item in SECRET_PATTERNS). The specific token patterns (AWS, GitHub, etc.) should not be filtered since their format alone is suspicious.

After `if (pattern.test(text))` and before pushing the diagnostic, add:

```typescript
if (label === 'Hardcoded secret in variable assignment') {
  const match = pattern.exec(text);
  if (match) {
    const assignedValue = match[0].split(/[:=]\s*['"]?/)[1]?.replace(/['"]$/, '');
    if (assignedValue && looksLikePlaceholder(assignedValue)) continue;
  }
}
```

**Step 3: Add test for false positive suppression**

In `security.test.ts`:

```typescript
it('does not flag placeholder values as secrets', async () => {
  const diags = await runSecurityAnalyzer(fixtureDir('security-issues'));
  const placeholderFlags = diags.filter(
    (d) => d.rule === 'hardcoded-secret' && d.message.includes('placeholder'),
  );
  expect(placeholderFlags).toHaveLength(0);
});
```

**Step 4: Run tests**

Run: `pnpm test -- --reporter=verbose security.test`
Expected: All pass.

**Step 5: Commit**

```bash
git add packages/ng-xray/src/analyzers/security.ts packages/ng-xray/src/analyzers/security.test.ts
git commit -m "fix(security): reduce false positives in hardcoded secret detection (S-3)

Excludes placeholder values (TODO, changeme, test, etc.) from the
catch-all secret pattern. Specific token patterns (AWS, GitHub) are
not affected."
```

---

## Batch 3: Reliability + Architecture

### Task 6: R-3 — Content-based baseline fingerprint

The current fingerprint includes `line` and `column`, which change on any code insertion above the diagnostic. Switch to a content-based fingerprint that's stable across refactors.

**Files:**
- Modify: `packages/ng-xray/src/baseline.ts`
- Modify: `packages/ng-xray/src/baseline.test.ts` (if exists, else the test file for baseline)

**Step 1: Write failing test**

Find or create `baseline.test.ts`. Add:

```typescript
import { describe, it, expect } from 'vitest';
import { fingerprintDiagnostic } from './baseline.js';
import type { Diagnostic } from './types.js';

const makeDiag = (overrides: Partial<Diagnostic> = {}): Diagnostic => ({
  filePath: 'src/app/app.component.ts',
  rule: 'missing-onpush',
  category: 'performance',
  severity: 'warning',
  message: 'Component does not use OnPush change detection strategy.',
  help: 'Add changeDetection.',
  line: 10,
  column: 1,
  source: 'ng-xray',
  stability: 'stable',
  ...overrides,
});

describe('fingerprintDiagnostic', () => {
  it('produces same fingerprint when line changes (stable across refactors)', () => {
    const a = fingerprintDiagnostic(makeDiag({ line: 10 }));
    const b = fingerprintDiagnostic(makeDiag({ line: 15 }));
    expect(a).toBe(b);
  });

  it('produces different fingerprint for different rules on same file', () => {
    const a = fingerprintDiagnostic(makeDiag({ rule: 'missing-onpush' }));
    const b = fingerprintDiagnostic(makeDiag({ rule: 'heavy-constructor' }));
    expect(a).not.toBe(b);
  });

  it('produces different fingerprint for different files with same rule', () => {
    const a = fingerprintDiagnostic(makeDiag({ filePath: 'a.ts' }));
    const b = fingerprintDiagnostic(makeDiag({ filePath: 'b.ts' }));
    expect(a).not.toBe(b);
  });
});
```

Run: `pnpm test -- --reporter=verbose baseline.test`
Expected: FAIL on the first test (same fingerprint when line changes).

**Step 2: Update fingerprint to be content-based**

In `baseline.ts`, change `fingerprintDiagnostic`:

```typescript
export const fingerprintDiagnostic = (d: Diagnostic): string =>
  createHash('sha256')
    .update(`${d.source}::${d.rule}::${d.filePath}::${d.message}`)
    .digest('hex')
    .slice(0, 16);
```

This removes `line` and `column` from the fingerprint. Two diagnostics with the same source, rule, file, and message will be considered identical regardless of their position. This is the desired behavior — if you add a blank line above a diagnostic, the baseline still suppresses it.

**Step 3: Bump BASELINE_VERSION to 3**

Since the fingerprint algorithm changed, existing baselines will produce different fingerprints. Bump `BASELINE_VERSION` to 3 so old baselines are auto-ignored (the `loadBaseline` function already checks version):

```typescript
const BASELINE_VERSION = 3;

interface BaselineData {
  version: 3;
  // ... rest unchanged
}
```

**Step 4: Run tests**

Run: `pnpm test -- --reporter=verbose baseline`
Expected: All pass.

**Step 5: Commit**

```bash
git add packages/ng-xray/src/baseline.ts packages/ng-xray/src/baseline.test.ts
git commit -m "fix(reliability): content-based baseline fingerprint (R-3)

Fingerprint now uses source+rule+filePath+message instead of
line+column. Baselines survive code insertions/deletions above
the diagnostic. Bumps baseline version to 3 (old baselines
auto-ignored)."
```

---

### Task 7: A-3 — Extract shared `resolveSrcDir` utility

**Files:**
- Create: `packages/ng-xray/src/utils/resolve-src.ts`
- Modify: `packages/ng-xray/src/analyzers/security.ts`
- Modify: `packages/ng-xray/src/analyzers/performance.ts`
- Modify: `packages/ng-xray/src/analyzers/best-practices.ts`
- Modify: `packages/ng-xray/src/analyzers/lint.ts`
- Modify: `packages/ng-xray/src/analyzers/dead-code-angular.ts`

**Step 1: Create the utility**

Create `packages/ng-xray/src/utils/resolve-src.ts`:

```typescript
import { existsSync } from 'node:fs';
import path from 'node:path';

export const resolveSrcDir = (directory: string): string => {
  const srcDir = path.join(directory, 'src');
  return existsSync(srcDir) ? srcDir : directory;
};
```

**Step 2: Replace in each analyzer**

In each of the 5 analyzer files, find the pattern:

```typescript
const srcDir = path.join(directory, 'src');
const targetDir = existsSync(srcDir) ? srcDir : directory;
```

Replace with:

```typescript
import { resolveSrcDir } from '../utils/resolve-src.js';
// ...
const targetDir = resolveSrcDir(directory);
```

Remove the now-unused `existsSync` import from files where it was only used for this pattern (check each file — some use `existsSync` elsewhere).

**Step 3: Run tests**

Run: `pnpm test`
Expected: All pass.

**Step 4: Commit**

```bash
git add packages/ng-xray/src/utils/resolve-src.ts packages/ng-xray/src/analyzers/security.ts packages/ng-xray/src/analyzers/performance.ts packages/ng-xray/src/analyzers/best-practices.ts packages/ng-xray/src/analyzers/lint.ts packages/ng-xray/src/analyzers/dead-code-angular.ts
git commit -m "refactor: extract shared resolveSrcDir utility (A-3)

Replaces duplicated src-directory detection across 5 analyzers."
```

---

### Task 8: A-1 — Share ts-morph Project across analyzers

Several analyzers create their own `new Project({ useInMemoryFileSystem: true })` and re-parse the same files. Share a single in-memory project instance via the scan orchestrator.

**Files:**
- Modify: `packages/ng-xray/src/scan.ts`
- Modify: `packages/ng-xray/src/analyzers/security.ts`
- Modify: `packages/ng-xray/src/analyzers/performance.ts`
- Modify: `packages/ng-xray/src/analyzers/best-practices.ts`

**Step 1: Create shared project in `buildSharedMaps`**

In `scan.ts`, extend the return type of `buildSharedMaps` to include a `morphProject`:

```typescript
import { Project } from 'ts-morph';

const buildSharedMaps = (
  directory: string,
  silent: boolean,
): { classMap: ProjectClassMap; templateMap: ProjectTemplateMap; morphProject: Project } | null => {
  const spinner = silent ? null : createSpinner('Building class & template maps...');
  spinner?.start();

  try {
    const classMap = buildProjectClassMap(directory);
    const templateMap = buildProjectTemplateMap(directory);
    const morphProject = new Project({ useInMemoryFileSystem: true });
    spinner?.succeed('Building class & template maps.');
    return { classMap, templateMap, morphProject };
  } catch (error) {
    spinner?.fail('Class & template map build failed.');
    logger.error(`Class & template map build: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};
```

**Step 2: Pass `morphProject` to analyzers**

Update analyzer signatures to accept an optional `morphProject` parameter:

In `security.ts`:
```typescript
export const runSecurityAnalyzer = async (
  directory: string,
  prebuiltMorphProject?: Project,
): Promise<Diagnostic[]> => {
  // ...
  const morphProject = prebuiltMorphProject ?? new Project({ useInMemoryFileSystem: true });
  // ... rest unchanged
};
```

Same for `performance.ts` and `best-practices.ts`.

**Step 3: Wire up in scan.ts analyzer definitions**

```typescript
{
  id: 'best-practices',
  label: 'Best practices',
  enabled: true,
  run: () => runBestPracticesAnalyzer(directory, sharedMaps?.morphProject),
},
{
  id: 'security',
  label: 'Security',
  enabled: true,
  run: () => runSecurityAnalyzer(directory, sharedMaps?.morphProject),
},
```

For performance:
```typescript
{
  id: 'performance',
  label: 'Performance',
  enabled: effective.performance !== false,
  run: () => runPerformanceAnalyzer(directory, {
    componentLocThreshold: config?.thresholds?.['component-loc'],
  }, sharedMaps?.morphProject),
},
```

Update `runPerformanceAnalyzer` to accept the third parameter:
```typescript
export const runPerformanceAnalyzer = async (
  directory: string,
  options?: { componentLocThreshold?: number },
  prebuiltMorphProject?: Project,
): Promise<Diagnostic[]> => {
  // ...
  const morphProject = prebuiltMorphProject ?? new Project({ useInMemoryFileSystem: true });
  // ...
};
```

**Step 4: Run tests**

Run: `pnpm test`
Expected: All pass.

**Step 5: Commit**

```bash
git add packages/ng-xray/src/scan.ts packages/ng-xray/src/analyzers/security.ts packages/ng-xray/src/analyzers/performance.ts packages/ng-xray/src/analyzers/best-practices.ts
git commit -m "perf: share ts-morph Project across analyzers (A-1)

Eliminates redundant file parsing by sharing a single in-memory
ts-morph project between security, performance, and best-practices
analyzers."
```

---

### Task 9: A-2 — Add config validation warnings

The config loader already normalizes and silently drops invalid fields. Improve it to warn users about unrecognized top-level keys.

**Files:**
- Modify: `packages/ng-xray/src/utils/load-config.ts`
- Modify: `packages/ng-xray/src/utils/load-config.test.ts`

**Step 1: Add unrecognized key warnings**

In `load-config.ts`, inside `normalizeConfig`, after the existing normalization, add:

```typescript
const KNOWN_KEYS = new Set(['ignore', 'thresholds', 'lint', 'deadCode', 'architecture', 'performance', 'verbose']);

const unknownKeys = Object.keys(value).filter((key) => !KNOWN_KEYS.has(key));
if (unknownKeys.length > 0) {
  logger.warn(`Config from ${sourceLabel} has unrecognized keys: ${unknownKeys.join(', ')}. These will be ignored.`);
}
```

**Step 2: Write test**

In `load-config.test.ts`, add a test using the `bad-config` or `invalid-architecture-config` fixture, or test `normalizeConfig` directly if it's exported. Since it's not exported, test via `loadConfig` with a fixture that has unknown keys.

If needed, create a minimal fixture or use a spy on `logger.warn`.

**Step 3: Run tests**

Run: `pnpm test -- --reporter=verbose load-config`
Expected: Pass.

**Step 4: Commit**

```bash
git add packages/ng-xray/src/utils/load-config.ts packages/ng-xray/src/utils/load-config.test.ts
git commit -m "fix(dx): warn on unrecognized config keys (A-2)

Helps users spot typos in ng-xray.config.json. Unrecognized keys
are logged as warnings instead of silently ignored."
```

---

## Batch 4: Testing + DX

### Task 10: T-2 — Add scoring model boundary tests

**Files:**
- Modify: `packages/ng-xray/src/scoring/calculate-score.test.ts`

**Step 1: Write boundary tests**

Add to `calculate-score.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { calculateScore } from './calculate-score.js';
import type { Diagnostic } from '../types.js';

const makeDiag = (overrides: Partial<Diagnostic> = {}): Diagnostic => ({
  filePath: 'src/app/app.component.ts',
  rule: 'missing-onpush',
  category: 'performance',
  severity: 'warning',
  message: 'Test diagnostic',
  help: 'Fix it',
  line: 1,
  column: 1,
  source: 'ng-xray',
  stability: 'stable',
  ...overrides,
});

describe('calculateScore boundary conditions', () => {
  it('returns 100 for empty diagnostics', () => {
    const result = calculateScore([]);
    expect(result.overall).toBe(100);
    expect(result.label).toBe('Excellent');
  });

  it('never returns a score below 0', () => {
    const manyErrors = Array.from({ length: 500 }, (_, i) =>
      makeDiag({ rule: `rule-${i}`, severity: 'error', category: 'performance' }),
    );
    const result = calculateScore(manyErrors);
    expect(result.overall).toBeGreaterThanOrEqual(0);
  });

  it('never returns a score above 100', () => {
    const result = calculateScore([]);
    expect(result.overall).toBeLessThanOrEqual(100);
  });

  it('category deduction never exceeds its cap', () => {
    const manyErrors = Array.from({ length: 100 }, (_, i) =>
      makeDiag({ rule: `perf-rule-${i}`, severity: 'error', category: 'performance' }),
    );
    const result = calculateScore(manyErrors);
    const perfCategory = result.categories.find(c => c.category === 'performance');
    expect(perfCategory).toBeDefined();
    expect(perfCategory!.deduction).toBeLessThanOrEqual(perfCategory!.maxDeduction);
  });

  it('rule deduction respects per-rule cap', () => {
    const manyOnPush = Array.from({ length: 50 }, () =>
      makeDiag({ rule: 'missing-onpush', severity: 'warning', category: 'performance' }),
    );
    const result = calculateScore(manyOnPush);
    const perfCategory = result.categories.find(c => c.category === 'performance');
    // missing-onpush cap is 10, so deduction should be <= 10
    expect(perfCategory!.deduction).toBeLessThanOrEqual(10);
  });

  it('density multiplier reduces deduction for low-density projects', () => {
    const fewWarnings = Array.from({ length: 2 }, () =>
      makeDiag({ rule: 'test-rule', severity: 'warning', category: 'best-practices' }),
    );
    const highDensity = calculateScore(fewWarnings, { fileCount: 2 });
    const lowDensity = calculateScore(fewWarnings, { fileCount: 200 });
    expect(lowDensity.overall).toBeGreaterThanOrEqual(highDensity.overall);
  });

  it('all five categories are always present in the result', () => {
    const result = calculateScore([]);
    expect(result.categories).toHaveLength(5);
    const cats = result.categories.map(c => c.category);
    expect(cats).toContain('best-practices');
    expect(cats).toContain('performance');
    expect(cats).toContain('architecture');
    expect(cats).toContain('dead-code');
    expect(cats).toContain('security');
  });
});
```

**Step 2: Run tests**

Run: `pnpm test -- --reporter=verbose calculate-score`
Expected: All pass.

**Step 3: Commit**

```bash
git add packages/ng-xray/src/scoring/calculate-score.test.ts
git commit -m "test: add scoring model boundary tests (T-2)

Verifies score invariants: 0-100 range, category caps, rule caps,
density multiplier, and category completeness."
```

---

### Task 11: T-1 — Raise coverage thresholds

After the test additions in this plan, coverage should be higher. Raise the thresholds.

**Files:**
- Modify: `packages/ng-xray/vitest.config.ts`

**Step 1: Run coverage to see current state**

Run: `pnpm --filter ng-xray run test:coverage`
Check the output for line and branch coverage.

**Step 2: Set new thresholds**

In `vitest.config.ts`, raise:

```typescript
thresholds: {
  lines: 65,
  branches: 55,
},
```

(Conservative bump — adjust upward based on actual coverage numbers. Target 70/60 but don't set it higher than current + 5% to leave room for safe landing.)

**Step 3: Run coverage again**

Run: `pnpm --filter ng-xray run test:coverage`
Expected: Passes thresholds.

**Step 4: Commit**

```bash
git add packages/ng-xray/vitest.config.ts
git commit -m "test: raise coverage thresholds to 65/55 (T-1)

Reflects improved test coverage from scoring boundary tests and
baseline tests."
```

---

### Task 12: D-1 — Expand programmatic API

**Files:**
- Modify: `packages/ng-xray/src/index.ts`

**Step 1: Add missing exports**

```typescript
import { scan } from './scan.js';
import type {
  Diagnostic, ScanOptions, ScanResult, ProjectInfo, ScoreResult,
  RemediationItem, NgXrayConfig, Category, Severity, SignalReadinessReport,
} from './types.js';
export { generateSarif } from './report/sarif.js';
export { generatePrSummary } from './report/pr-summary.js';
export { generateHtmlReport } from './report/html.js';
export { loadHistory, appendHistory, clearHistory } from './history.js';
export type { HistoryData, HistoryEntry } from './history.js';
export { saveBaseline, loadBaseline, clearBaseline } from './baseline.js';
export { calculateScore, generateRemediation } from './scoring/calculate-score.js';

export type {
  Diagnostic, ScanOptions, ScanResult, ProjectInfo, ScoreResult,
  RemediationItem, NgXrayConfig, Category, Severity, SignalReadinessReport,
};

export interface DiagnoseOptions {
  lint?: boolean;
  deadCode?: boolean;
  architecture?: boolean;
  performance?: boolean;
  profile?: 'core' | 'all';
  noExec?: boolean;
}

export const diagnose = async (
  directory: string,
  options: DiagnoseOptions = {},
): Promise<ScanResult> => {
  return scan(directory, { ...options, scoreOnly: false }, true);
};
```

**Step 2: Verify build**

Run: `pnpm build && pnpm typecheck`
Expected: No errors.

**Step 3: Commit**

```bash
git add packages/ng-xray/src/index.ts
git commit -m "feat(dx): expand programmatic API surface (D-1)

Exports generateHtmlReport, history/baseline utilities, calculateScore,
and additional types. Enables custom integrations and editor extensions."
```

---

### Task 13: D-2 — Add `--quiet` CLI flag

**Files:**
- Modify: `packages/ng-xray/src/cli.ts`

**Step 1: Add the flag**

After `--verbose`, add:

```typescript
.option('--quiet', 'suppress all terminal output except final result', false)
```

Add `quiet` to `CliFlags`. When `flags.quiet` is true, pass `silent: true` to `scan()` and skip `printHeader`, `printProjectInfo`, `printDiagnostics`, `printAnalyzerSummary`, `printRemediation`, `printElapsed`.

In the terminal output mode action handler, wrap the print calls:

```typescript
if (!flags.quiet) {
  printHeader();
  // ... etc
}
```

Keep `printSummary` even in quiet mode (it's the final score line).

**Step 2: Run tests**

Run: `pnpm test`
Expected: All pass.

**Step 3: Commit**

```bash
git add packages/ng-xray/src/cli.ts
git commit -m "feat(dx): add --quiet flag for CI pipelines (D-2)

Suppresses spinner and terminal output, only showing the final
score summary. Pairs well with --fail-under for CI gates."
```

---

### Task 14: D-3 — Add CHANGELOG

**Files:**
- Create: `CHANGELOG.md`

**Step 1: Create initial CHANGELOG**

```markdown
# Changelog

All notable changes to ng-xray will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `--no-exec` flag to skip analyzers that run external binaries (safe mode for auditing)
- `--quiet` flag for CI pipelines (suppresses all output except final score)
- Programmatic API: `generateHtmlReport`, `calculateScore`, history/baseline utilities
- Scoring model boundary tests
- Security trust model documentation in README

### Changed
- Baseline fingerprint is now content-based (rule+file+message) instead of position-based (line+column). Existing baselines will be auto-ignored (version bump).
- Knip dead-code analyzer requires local installation — the unpinned `npx knip` fallback has been removed for security.
- Coverage thresholds raised to 65% lines / 55% branches.

### Fixed
- Timer leak in analyzer timeout (12 dangling 120s timers per scan)
- `console.log` in scan.ts baseline message that broke silent/JSON modes
- Reduced false positives in hardcoded secret detection (placeholder values excluded)

## [0.1.0] - Unreleased

Initial release.
```

**Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: add CHANGELOG (D-3)"
```

---

## Batch 5: Performance + Remaining Minor

### Task 15: R-1 — Switch exec analyzers to async child processes

**Files:**
- Modify: `packages/ng-xray/src/analyzers/angular-diagnostics.ts`
- Modify: `packages/ng-xray/src/analyzers/dead-code.ts`

**Step 1: Convert `angular-diagnostics.ts` to async**

Replace `execFileSync` with `execFile` wrapped in a promise:

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
```

In `runAngularDiagnosticsAnalyzer`, replace:

```typescript
let output: string;
try {
  const { stdout, stderr } = await execFileAsync(ngcBinary, ['-p', tsConfig, '--noEmit'], {
    cwd: directory,
    encoding: 'utf-8',
    timeout: 120_000,
  });
  output = [stdout, stderr].join('\n');
} catch (error: unknown) {
  const execError = error as { stdout?: string; stderr?: string; code?: number };
  output = [execError.stdout ?? '', execError.stderr ?? ''].join('\n');
  if (!output.includes('NG')) {
    throw new Error(
      `Angular compiler failed with exit code ${(error as { code?: number }).code}: ${output.slice(0, 500)}`,
    );
  }
}
```

**Step 2: Convert `dead-code.ts` to async**

Similarly replace `execFileSync` with `execFileAsync`:

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
```

Update `runDeadCodeAnalyzer`:

```typescript
export const runDeadCodeAnalyzer = async (directory: string): Promise<Diagnostic[]> => {
  const resolved = resolveKnipBinary(directory);
  if (!resolved) return [];

  const { command, args } = resolved;

  try {
    const { stdout } = await execFileAsync(command, args, {
      cwd: directory,
      encoding: 'utf-8',
      timeout: 120_000,
    });
    return parseKnipOutput(stdout, directory);
  } catch (error) {
    if (error instanceof Error && 'stdout' in error) {
      const stdout = (error as { stdout: string }).stdout;
      if (stdout) {
        return parseKnipOutput(stdout, directory);
      }
    }
    throw error;
  }
};
```

**Step 3: Run tests**

Run: `pnpm test`
Expected: All pass.

**Step 4: Commit**

```bash
git add packages/ng-xray/src/analyzers/angular-diagnostics.ts packages/ng-xray/src/analyzers/dead-code.ts
git commit -m "perf: async child processes for ngc and knip (R-1)

Switches execFileSync to async execFile, enabling true parallelism
between analyzers that shell out and those doing in-process AST work."
```

---

### Task 16: R-4 — Document `.ng-xray*` in gitignore recommendation

Rather than a complex XDG migration, add clear documentation and a `.gitignore` recommendation. This is the pragmatic approach — baseline/history files in the project directory are actually useful for teams that want to commit them.

**Files:**
- Modify: `README.md`

**Step 1: Add gitignore section**

After the Baseline section in README, add:

```markdown
### Gitignore

ng-xray stores baseline and history files in your project directory. Add these to `.gitignore` if you don't want them tracked:

```
# ng-xray
.ng-xray-baseline.json
.ng-xray/
```

Some teams prefer to **commit the baseline** so all developers share the same suppression set. In that case, only ignore the history directory:

```
.ng-xray/
```
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add gitignore recommendation for ng-xray files (R-4)"
```

---

### Task 17: Final verification + build

**Step 1: Run full test suite with coverage**

```bash
pnpm test
pnpm --filter ng-xray run test:coverage
```

Expected: All pass, coverage meets thresholds.

**Step 2: Build and typecheck**

```bash
pnpm build
pnpm typecheck
```

Expected: No errors.

**Step 3: Lint**

```bash
pnpm lint
```

Expected: No warnings.

**Step 4: Smoke test**

```bash
bash scripts/ci/smoke-packaged-cli.sh
```

Expected: Passes.

**Step 5: Final commit (if any fixups needed)**

Only if the verification steps required changes.

---

## Summary

| Batch | Tasks | Resolves | Effort |
|-------|-------|----------|--------|
| 1: Ship-blockers | 1–3 | S-2, R-2, A-4 | ~45 min |
| 2: Security | 4–5 | S-1, S-3 | ~3 hrs |
| 3: Reliability + Architecture | 6–9 | R-3, A-3, A-1, A-2 | ~4 hrs |
| 4: Testing + DX | 10–14 | T-2, T-1, D-1, D-2, D-3 | ~3 hrs |
| 5: Performance + Minor | 15–17 | R-1, R-4, verification | ~2 hrs |
| **Total** | **17 tasks** | **All 17 findings** | **~12 hrs** |

### Expected post-fix grades

| Area | Before | After | Key changes |
|------|--------|-------|-------------|
| Architecture | A- | A+ | Shared ts-morph, extracted utilities, DRY |
| Reliability | B+ | A | Content-based fingerprint, timer fix, async exec |
| Security | B | A+ | npx fallback removed, --no-exec, trust docs, FP reduction |
| DX & Docs | A- | A+ | Expanded API, --quiet, CHANGELOG, gitignore docs |
| Testing | B+ | A | Scoring boundary tests, higher thresholds |
| **Overall** | **B+/A-** | **A+** | |
