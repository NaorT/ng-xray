# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `--no-exec` flag to disable analyzers that shell out to third-party tools (ngc, eslint, knip), enabling safe scans on untrusted repositories.
- `--quiet` flag to suppress all terminal output except the summary line.
- Security Model section in README documenting the trust boundary between static-only and exec analyzers.
- Content-based baseline fingerprinting — baselines now survive line-number shifts from unrelated edits (baseline version bumped to 3).
- Placeholder detection for the catch-all secret pattern to reduce false positives on values like `'your-api-key'` and `'<REPLACE_ME>'`.
- Config validation warnings for unrecognized top-level keys in `ng-xray.config.json`.
- Comprehensive scoring model boundary tests (score bounds, category presence, density multiplier).
- Expanded programmatic API: exports for `generateHtmlReport`, `calculateScore`, `generateRemediation`, baseline/history utilities, and additional types.
- Gitignore recommendation section in README.
- SECURITY.md with responsible disclosure instructions.
- CHANGELOG.md (this file).

### Changed

- Dead code analyzer no longer falls back to `npx knip` when no local installation is found — the analyzer is silently skipped instead.
- Shared `ts-morph` Project instance across security, performance, and best-practices analyzers for reduced memory allocation.
- Extracted shared `resolveSrcDir()` utility replacing duplicated `src/` directory resolution in 5 analyzer files.
- Raised coverage thresholds to 65% lines / 55% branches.
- Async child process execution for `ngc` and `knip` (replaces `execFileSync` with `promisify(execFile)`).
- SARIF schema URL now uses the stable `json.schemastore.org` endpoint.

### Fixed

- Timer leak in `withTimeout` — the `setTimeout` handle is now cleared via `promise.finally()` when the analyzer completes before the timeout.
- Replaced stray `console.log` with `logger.dim` for baseline suppression message in scan output.
- SARIF `informationUri` now points to the correct repository URL.
- Programmatic `diagnose()` API now resolves relative directory paths.
