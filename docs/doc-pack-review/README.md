# ng-xray

ng-xray is an Angular repo-health platform. It unifies Angular diagnostics, linting, dead-code detection, architecture checks, scoring, and remediation into one trustworthy workflow.

## Why this exists

Angular teams already use strong point tools:

- Angular Extended Diagnostics and Language Service for framework-native diagnostics
- `angular-eslint` for Angular linting
- Knip for dead code and dependency hygiene
- Nx for architecture enforcement in many workspaces

The market gap is not another isolated analyzer. The gap is a single Angular-first developer workflow that:

- runs in one command
- explains overall health
- prioritizes fixes
- works in CI and PRs
- supports gradual rollout with baselines
- clearly separates official signals, upstream tool signals, stable ng-xray rules, and experimental heuristics

## Product position

ng-xray should not try to beat Angular, angular-eslint, Knip, or Nx at their specialties.

ng-xray should become the best orchestration and repo-health layer on top of them.

## Current strategic priorities

1. Ingest official Angular signals
2. Ingest angular-eslint results directly
3. Make Knip-backed dead code the default path
4. Add SARIF, GitHub Action, and PR summary workflows
5. Build enforceable architecture rules for Angular repos, especially non-Nx repos
6. Keep stable vs experimental separation strict
7. Make scoring transparent and trustworthy
8. Support real Angular repo shapes quickly across Angular major releases

## North star

The goal is for Angular teams and individuals to treat ng-xray as the default answer to:

- How healthy is this repo?
- What should we fix first?
- What changed in this PR?
- Can we block regressions without boiling the ocean?

## Minimal doc map

- `docs/product-strategy.md` — market reality, positioning, competitors, differentiation
- `docs/architecture.md` — how the system should be structured
- `docs/v1-roadmap.md` — what to build now and what to defer
- `docs/backlog.md` — execution plan with concrete tasks and acceptance criteria
- `docs/rules-and-analyzers.md` — analyzer catalog, sources, and future additions
- `docs/implementation-principles.md` — engineering and product guardrails

## Working rules

- Prefer upstream trusted engines over reimplementation when they already solve the problem well
- Do not silently downgrade analyzer failures
- Do not present heuristics as framework truth
- Keep JSON, terminal, HTML, CI, and editor contracts aligned
- Separate stable and experimental behavior everywhere
- Optimize for adoption, precision, and trust before analyzer count
