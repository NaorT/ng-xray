# Compatibility Matrix

This matrix documents the Angular versions and project shapes that `ng-xray` validates with the packaged CLI artifact in CI.

## Core Matrix

These cases run on `push` and `pull_request`:

| Case | Angular | Shape | Notes |
|------|---------|-------|-------|
| `angular15-legacy-app` | 15 | Single app, NgModule-oriented | Validates the oldest supported major. |
| `angular19-standalone-app` | 19 | Single app, standalone-first | Validates the current happy-path release line. |

## Extended Matrix

> **Note:** The extended matrix cases are planned but not yet automated in CI. They have been validated manually. A scheduled CI workflow is planned for a future release.

These cases will run on the scheduled compatibility workflow and on manual dispatch with `profile=extended`:

| Case | Angular | Shape | Notes |
|------|---------|-------|-------|
| `angular17-standalone-app` | 17 | Single app, standalone-first | Covers the transition-era standalone default. |
| `angular21-standalone-app` | 21 | Single app, standalone-first | Tracks the latest supported major claim. |
| `angular19-workspace-app` | 19 | Angular CLI multi-project workspace | Validates `--project` targeting for applications. |
| `angular19-nx-shaped-workspace` | 19 | `angular.json` workspace with `nx.json` present | Validates the Nx-detected workspace path. |
| `angular19-library` | 19 | Workspace library target | Validates library scanning with package metadata at the workspace root. |

## Validation Method

- Build `ng-xray` from source in CI.
- Pack the published artifact with `npm pack`.
- Install the tarball into a clean temp directory.
- Generate the target Angular project shape with the matching Angular CLI version.
- Run the packaged `ng-xray` binary with `--json`.
- Assert the scan completes, Angular version detection matches the expected major, and the output contract remains machine-readable.

## Claim Discipline

- README support claims should stay within this matrix.
- New Angular major/version claims should add a matching compatibility case first.
- If a shape is not listed here, treat it as unverified rather than implicitly supported.
