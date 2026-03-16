# Backlog

## Epic 1: Trusted upstream integration

# Add Angular Extended Diagnostics ingestion

## Why
Angular official diagnostics are the highest-trust framework-native signal available to Angular teams.

## Goal
Add a first-class analyzer that ingests Angular Extended Diagnostics and maps them into ng-xray findings.

## Implementation notes
- Add adapter analyzer under an integrations or analyzers folder
- Preserve official diagnostic code and wording where reasonable
- Map to ng-xray categories and severities
- Mark findings with `source: angular`
- Add source badge and filtering in HTML, terminal, JSON, and SARIF
- Prevent duplicate reporting with overlapping custom analyzers

## Acceptance criteria
- Findings appear in JSON, terminal, and HTML
- Findings are marked as Angular-sourced
- Analyzer summary shows status, duration, and findings count
- Partial-scan contract still works on Angular analyzer failure
- Docs explain how this analyzer works and when it runs

## Out of scope
- Re-implementing Angular diagnostics
- Auto-fixing Angular diagnostics


# Add angular-eslint ingestion

## Why
Many Angular teams already trust and use angular-eslint in `ng lint` or custom lint workflows.

## Goal
Normalize angular-eslint results into ng-xray findings.

## Implementation notes
- Support reading ESLint JSON or Node API output
- Preserve rule ids, messages, severities, and file locations
- Mark findings with `source: angular-eslint` or `source: eslint`
- Add source/stability display to all outputs
- Avoid re-linting when ingesting existing results if possible

## Acceptance criteria
- Existing angular-eslint results can be surfaced by ng-xray
- Findings show source and rule id clearly
- Report supports grouping or filtering by source
- JSON schema includes source cleanly

## Out of scope
- Replacing angular-eslint configuration


# Make Knip-backed dead code the default

## Why
Dead code is a trust-sensitive area, and Knip is already stronger than a generic homegrown analyzer.

## Goal
Use Knip as the default dead-code engine while keeping ng-xray-specific enrichments separate.

## Implementation notes
- Add explicit source metadata for Knip-backed findings
- Distinguish project-owned Knip from fallback execution in provenance/trust metadata
- Preserve Angular-aware exclusions and enrichments outside of Knip itself
- Keep custom Angular dead-code heuristics behind experimental flags if needed

## Acceptance criteria
- Default dead-code path is Knip-backed
- Findings are labeled `source: knip`
- Project-owned Knip findings can participate in strict core scoring
- Fallback Knip findings are visible but advisory
- False positives are lower than current custom-only behavior
- Docs explain the relationship between Knip and ng-xray

## Out of scope
- Replacing all of Knip’s configuration model


## Epic 2: Team adoption

# Add SARIF export

## Why
SARIF is required for strong CI and code-scanning integration.

## Goal
Emit SARIF output that represents ng-xray findings consistently.

## Implementation notes
- Map severity, file locations, source, and rule ids carefully
- Include stability/source metadata where possible
- Keep JSON and SARIF schemas separate and explicit

## Acceptance criteria
- `--sarif` emits valid SARIF
- Sample output works with a SARIF consumer
- Partial-scan status is reflected appropriately

## Out of scope
- Custom SARIF viewer


# Build GitHub Action

## Why
Teams adopt tools faster when CI setup is one step.

## Goal
Publish an official GitHub Action for ng-xray.

## Implementation notes
- Support scan, HTML artifact, SARIF upload, and PR summary modes
- Support baseline compare mode
- Provide example workflows for Angular repos

## Acceptance criteria
- Action can run scan successfully in CI
- Docs include copy-pasteable examples
- HTML report can be uploaded as an artifact

## Out of scope
- Support for every CI provider on day one


# Add PR summary output

## Why
Most teams do not want to open a full report for every PR.

## Goal
Generate a compact markdown summary for PR usage.

## Implementation notes
Include:
- current score
- score profile
- score delta if compare/baseline exists
- new findings count
- top regressions
- failed analyzers
- link/path to full report artifact when available

## Acceptance criteria
- Output is readable in GitHub markdown
- Useful even without opening HTML
- Clearly marks partial scans

## Out of scope
- Rich PR UI widgets


## Epic 3: Architecture moat

# Build architecture rules engine MVP

## Why
Non-Nx Angular teams still need enforceable architecture constraints.

## Goal
Ship enforceable rules for imports and boundaries.

## Implementation notes
- Support layer and domain rules
- Support forbidden imports and deep-import restrictions
- Allow public API boundary checks
- Keep rules stable and CI-friendly
- Surface architecture violations as stable findings

## Acceptance criteria
- Teams can define at least a small set of boundary rules
- Violations can fail CI
- HTML and terminal show violations clearly
- Rules work on common Angular workspace layouts

## Out of scope
- Full project-graph visualization on day one


# Add architecture presets

## Why
Architecture rules are powerful but intimidating.

## Goal
Ship a small set of practical presets.

## Implementation notes
Presets should cover:
- app / feature / shared layering
- public API only boundaries
- common domain-based boundaries

## Acceptance criteria
- A team can enable a preset with minimal config
- Docs include examples for Angular CLI and monorepo usage

## Out of scope
- Full custom DSL designer UI


## Epic 4: Compatibility and maturity

# Publish compatibility matrix

## Why
Standard tools make support boundaries obvious.

## Goal
Document supported Angular, Node, workspace, and config versions.

## Implementation notes
Track:
- Angular major versions
- Node versions
- Angular CLI workspace support
- Nx support where relevant
- ESLint config styles supported

## Acceptance criteria
- Docs clearly list supported combinations
- CI covers declared support where practical

## Out of scope
- Supporting undocumented combinations


# Ship official presets

## Why
Teams adopt tools faster when defaults are opinionated and documented.

## Goal
Provide clear presets for common repo shapes and goals.

## Implementation notes
Ship:
- recommended
- strict
- legacy-safe
- monorepo
- migration
- security-lite

## Acceptance criteria
- Presets are documented
- Teams can select one without deep rule knowledge
- Preset behavior is reflected in reports

## Out of scope
- Dozens of presets


## Epic 5: Editor experience

# Build VS Code companion MVP

## Why
Standard tooling lives in the editor, not only in CI or HTML.

## Goal
Provide a lightweight extension or companion experience.

## Implementation notes
Start with:
- read cached/latest scan result
- show score
- show top fixes
- show partial-scan warning
- link to report and affected files

## Acceptance criteria
- Works on a local Angular repo
- Does not require hosted backend
- Provides useful value without huge scope

## Out of scope
- Full inline diagnostics engine in v1
