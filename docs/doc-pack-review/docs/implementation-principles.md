# Implementation Principles

## 1. No fake precision
Do not present heuristics as hard truth.
If confidence is limited, label it clearly.

## 2. Prefer trusted upstream engines
If Angular, angular-eslint, Knip, or another mature engine already solves a problem better than ng-xray, use that engine and add ng-xray value on top.

## 3. Analyzer failure must be explicit
No analyzer may silently convert failure into empty findings.
Partial scans must be first-class in code, terminal, JSON, HTML, and CI behavior.

## 4. Stable and experimental must stay separate
This separation is not cosmetic.
It affects:
- report badges
- score policy
- quality gates
- presets
- docs
- user trust

## 5. Score must be explainable
A score is only useful if users can understand:
- what categories contributed
- what caps applied
- whether the scan was partial
- whether findings were stable or experimental
- what score change a fix is expected to produce

## 6. CI and local behavior must align
Do not create a tool that says one thing locally and another thing in CI.
Output contracts should be consistent across terminal, JSON, HTML, SARIF, and GitHub workflows.

## 7. Adoption beats theoretical completeness
A smaller precise product with baselines and regression gating is better than a broader noisy product no team will enforce.

## 8. Support real Angular repo shapes
Always test on:
- standard Angular CLI app
- standalone-heavy app
- legacy NgModule app
- workspace with multiple projects/libs
- custom root layout where supported
- Nx workspace when relevant

## 9. Release responsiveness matters
If ng-xray lags new Angular majors badly, it will never become standard.
Support windows and compatibility should be visible and intentional.

## 10. Output should help decisions
The report is not just a dashboard.
It should answer:
- can I trust this scan?
- how healthy is the repo?
- what should I fix first?
- what is stable vs experimental?
- what changed versus baseline?

## 11. Docs are part of the product
README, presets, compatibility matrix, rule catalog, and rollout docs affect trust and adoption as much as code quality does.

## 12. Avoid overclaiming
Do not over-market:
- deep security analysis
- AI auto-fix
- migration certainty
- broad performance intelligence

Claim only what the current precision supports.
