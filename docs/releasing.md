# Releasing ng-xray

## Goals

- Keep the published package installable and reproducible.
- Make analyzer and scoring changes understandable to downstream teams.
- Avoid silent contract changes in machine-readable outputs.

## Versioning Policy

- `MAJOR`: breaking CLI behavior, output schema changes, exit-code changes, default-score philosophy changes, or analyzer reclassification that meaningfully changes the default trust contract.
- `MINOR`: new analyzers, new output fields that are additive, new non-breaking CLI flags, or compatibility expansion.
- `PATCH`: bug fixes, false-positive reductions, test-only changes, docs fixes, and internal refactors that do not change the public contract.

## Release Checklist

1. Run `pnpm lint`
2. Run `pnpm build`
3. Run `pnpm typecheck`
4. Run `pnpm test`
5. Run the packaged CLI smoke checks used in CI
6. Update `CHANGELOG.md`
7. Verify README claims still match tested behavior
8. Tag and publish the release

## Analyzer And Score Changes

- Document analyzer additions, removals, or default-severity changes in `CHANGELOG.md`.
- Document any change that can materially move the default score, especially category caps, weighting, trust-tier/profile behavior, and baseline identity rules.
- If a change can alter CI outcomes, call it out explicitly in the release notes.
