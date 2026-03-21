# Contributing to ng-xray

ng-xray is a pnpm monorepo. The CLI and analyzers live in `packages/ng-xray/`. It is an Angular repo-health CLI tool.

## Prerequisites

- **Node.js** 20 or newer
- **pnpm** 10 or newer

## Getting Started

From the repository root:

```bash
pnpm install
```

Common tasks:

| Command | Purpose |
|--------|---------|
| `pnpm dev` | Watch mode during development |
| `pnpm build` | Build the project |
| `pnpm test` | Run the test suite |
| `pnpm typecheck` | Type-check without emitting |
| `pnpm lint` | Lint `packages/ng-xray/src` (fixtures excluded) |

## Adding an Analyzer

1. **Implement** the analyzer in `packages/ng-xray/src/analyzers/` (follow existing naming and the analyzer contract in project conventions).
2. **Register** it in `packages/ng-xray/src/scan.ts` so it runs as part of a scan.
3. **Document** the rule in `packages/ng-xray/src/report/rule-docs.ts` (title, description, remediation).
4. **Add fixtures** under `packages/ng-xray/src/__fixtures__/` as minimal Angular projects used by tests.
5. **Add tests** next to the analyzer or in the appropriate test file, using those fixtures.

For a fuller checklist, see `.cursor/skills/add-analyzer/SKILL.md` in this repo.

## Running Tests

Tests use **Vitest**.

```bash
pnpm test
```

Coverage from repo root:

```bash
pnpm --filter ng-xray run test:coverage
```

From `packages/ng-xray/`, `pnpm test:coverage` runs the same script.

**Fixture conventions:** Each fixture is a minimal Angular-style project directory. Include a `package.json` that lists `@angular/core` (and other deps the fixture needs) so tests mirror real project layout.

## Code Conventions

- **ESM only** — use `.js` extensions in relative imports (the package is `"type": "module"`).
- **AST over string matching** — prefer ts-morph or `@angular/compiler` for TypeScript and template patterns; avoid regex for syntax-level detection unless the case is trivial and unambiguous.
- **Analyzers** return `Promise<Diagnostic[]>`. Let **execution** errors propagate so `scan.ts` can record partial scans; do not wrap the whole analyzer in try/catch that returns `[]`.
- **Per-file** errors (read failures, etc.): catch, log (e.g. with the project logger), and continue — do not swallow errors silently.
- **File discovery:** use `walkFiles` from `utils/walk.js`; do not duplicate ignore logic with local walkers.
- **HTML reports** must be self-contained: inline CSS and JavaScript, no external assets or CDN links.

Additional detail lives in `.cursor/rules/project-conventions.mdc`.

## Pull Request Expectations

Before opening a PR:

- `pnpm test` passes
- `pnpm typecheck` passes
- `pnpm lint` passes

**New analyzers:** include at least one test that expects a diagnostic when the issue is present (positive case) and at least one that expects no diagnostic when the code is clean (negative case), using fixtures where appropriate.
