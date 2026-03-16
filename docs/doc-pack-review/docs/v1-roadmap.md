# v1 Roadmap

## Goal

Make ng-xray production-credible for Angular teams and individuals.

## What v1 must achieve

- trustworthy CLI behavior
- low-noise repo-health workflow
- clear trust/transparency in outputs
- good CI adoption path
- useful first run on real Angular repos
- explicit stable vs experimental boundaries
- conservative default score suitable for gating
- upstream integrations where trust already exists

## Must-have for v1

### 1. Angular Extended Diagnostics ingestion
Why:
- raises trust immediately
- gives ng-xray official Angular signals

### 2. angular-eslint ingestion
Why:
- plugs ng-xray into existing Angular lint workflows
- avoids “duplicate linting but different” skepticism

### 3. Knip-backed dead code by default
Why:
- better precision
- less custom dead-code noise
- only project-owned Knip should count in the default core score

### 4. Source transparency
Per finding and analyzer summary:
- source
- provenance
- stability
- trust
- status

### 5. SARIF output
Why:
- CI and code-scanning compatibility

### 6. GitHub Action
Why:
- one-step team adoption

### 7. Baseline and regression-first workflow
Why:
- realistic rollout path for real teams

### 8. Compatibility matrix
Why:
- maturity signal
- reduced rollout friction

## Should-have for v1.x

### 9. PR summary output
Compact markdown summary for pull requests.

### 10. Official presets
- recommended
- strict
- legacy-safe
- monorepo
- migration
- security-lite

### 11. Architecture rules engine MVP
Enforceable import and boundary rules for non-Nx Angular repos.

### 12. VS Code companion MVP
Read scan artifacts, show score, top fixes, and partial-scan warnings.

## Explicitly not v1 priorities

- deep security platform claims
- AI auto-fix as a headline feature
- a hosted SaaS dashboard
- many new heuristic analyzers with weak confidence

## Release criteria for v1

- works cleanly on standard Angular CLI repo
- works on standalone-heavy repo
- works on legacy NgModule-heavy repo
- can run in CI with baseline mode
- can emit JSON, HTML, and SARIF reliably
- clearly labels official/project-owned/advisory/stable/experimental findings
- supports current documented Angular versions
