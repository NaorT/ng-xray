# Product Strategy

## Core thesis

ng-xray becomes industry standard by being the best Angular repo-health workflow, not by having the most analyzers.

That means:

- trusted results
- low noise
- easy incremental adoption
- strong Angular ecosystem integration
- useful CI, PR, terminal, JSON, and editor surfaces
- fast support for new Angular majors

## Market truth

### Angular
Angular already owns framework-native truth through Extended Diagnostics and the Language Service.

Implication:
- ng-xray must ingest and elevate Angular signals
- ng-xray should not argue with Angular on compiler-backed semantics

### angular-eslint
angular-eslint is already the default lint path for many Angular teams.

Implication:
- ng-xray should normalize and prioritize angular-eslint results
- ng-xray should not position linting as a replacement story

### Knip
Knip is stronger than a generic custom dead-code analyzer.

Implication:
- ng-xray should make Knip-backed dead code the default
- Angular-aware enrichments should sit on top

### Nx
Nx is strong on enforceable architecture rules and workspace-aware boundaries.

Implication:
- ng-xray should offer architecture enforcement for non-Nx and mixed repos
- ng-xray should integrate with Nx-aware teams when possible rather than pretend Nx does not exist

## Where ng-xray is stronger

ng-xray can be better at:

- one-command Angular-first repo-health workflow
- normalized scoring
- remediation prioritization
- HTML report quality
- partial-scan honesty
- stable vs experimental labeling
- baseline-first rollout ergonomics
- combining repo-health signals into one adoption-friendly product

## Positioning statement

ng-xray is the Angular repo-health platform that unifies Angular diagnostics, linting, dead-code detection, architecture checks, and remediation into one trustworthy workflow.

## What not to claim

Do not market ng-xray as:

- a better Angular compiler analyzer than Angular
- a better linter than angular-eslint
- a better dead-code engine than Knip
- a better architecture enforcer than Nx in Nx-native scenarios
- a deep security platform on par with Sonar

## Winning strategy

1. Integrate trusted upstream signals
2. Make source and stability visible in every finding
3. Provide the best adoption path for teams
4. Win on CI, PRs, and editor ergonomics
5. Add Angular-specific value only where ng-xray can be truly precise
6. Keep scoring transparent and challengeable

## Success conditions

ng-xray is on the right path when teams can:

- run one command locally and understand repo health fast
- adopt it in CI using baselines and regression-only gates
- use it in PR reviews through summaries and SARIF-based workflows
- trust the difference between official, tool-backed, stable, and experimental findings
- upgrade Angular without waiting months for ng-xray support
