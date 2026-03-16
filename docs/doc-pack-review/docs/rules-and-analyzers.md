# Rules and Analyzers

## Analyzer taxonomy

ng-xray analyzers should fall into one of these buckets:

### 1. Official or upstream-backed
These are the highest-trust analyzers.

Examples:
- Angular Extended Diagnostics
- angular-eslint
- Knip
- Nx or dependency graph integrations later

### 2. ng-xray-native stable
These are custom analyzers that have proven precision and are safe for CI gating.

Examples:
- architecture rules engine
- compatibility analyzer
- workspace shape analyzer
- selected high-confidence performance hygiene checks

### 3. ng-xray-native experimental
These are useful but still noisy, opinionated, or heuristic-heavy.

Examples:
- signal readiness
- circular injection heuristics
- broad migration guidance
- broad security heuristics
- speculative dead Angular entity detection

## Current strategic analyzer priorities

### Must-add
- Angular Extended Diagnostics ingestion
- angular-eslint ingestion
- Knip-backed dead code
- architecture boundary analyzer
- compatibility/version analyzer
- workspace shape analyzer

### Good additions after that
- public API boundary analyzer
- deep-import restriction analyzer
- lazy-loading opportunity detector
- dependency duplication hygiene analyzer
- generated/config hygiene analyzer

### Keep experimental until proven
- signal migration readiness
- standalone migration readiness
- broad security analyzer
- circular DI analyzer
- “missing OnPush” style opinionated rules
- low-confidence performance guesses

## Rule principles

### Stable rules
A stable rule should be:
- low noise
- understandable
- actionable
- consistent across repo shapes
- appropriate for CI gating

### Experimental rules
An experimental rule may be:
- heuristic-heavy
- partially opinionated
- less precise on custom repo shapes
- useful for guidance, but not for strict gating

## Display rules

Every finding should show:
- source
- stability
- severity
- rule id
- analyzer id
- affected files
- clear recommendation

## Quality gate guidance

### Good candidates for strict gates
- official Angular diagnostics
- angular-eslint stable errors
- stable architecture violations
- new stable dead-code findings with high confidence

### Bad candidates for strict gates
- experimental migration guidance
- low-confidence security heuristics
- speculative dead Angular entity rules
- noisy performance heuristics

## Future rule catalog model

Each rule page should eventually include:
- title
- source
- stability
- rationale
- examples
- known false-positive risks
- suppression guidance
- fix patterns
