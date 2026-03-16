# Architecture

## System shape

ng-xray should remain a Node.js + TypeScript CLI-first product.

Recommended layers:

1. Core scan orchestration
2. Analyzer adapters and analyzers
3. Finding normalization
4. Score and remediation engine
5. Output adapters
6. History and baseline layer
7. Optional integration surfaces

## High-level flow

1. Detect project shape
2. Load config and resolved config source
3. Build analyzer execution plan
4. Execute analyzers with timing and explicit status tracking
5. Normalize findings into a common schema
6. Compute score with transparent caps and categories
7. Build remediation priorities
8. Emit outputs:
   - terminal
   - JSON
   - HTML
   - SARIF
   - PR summary
9. Persist history if enabled

## Core data contracts

### Finding
Every finding should carry enough truth for all outputs.

Recommended fields:
- `id`
- `title`
- `description`
- `severity`
- `category`
- `source` — `angular`, `angular-eslint`, `knip`, `ng-xray`
- `stability` — `stable` or `experimental`
- `ruleId`
- `analyzerId`
- `files`
- `line` and `column` where relevant
- `fixRecommendation`
- `docLink` where possible
- `confidence` for heuristic analyzers if needed later

### AnalyzerRunInfo
Recommended shape:

```ts
export interface AnalyzerRunInfo {
  id: string
  label: string
  status: 'ran' | 'failed' | 'skipped'
  findingsCount: number
  durationMs: number
  experimental: boolean
  errorMessage?: string
  skipReason?: 'disabled' | 'not-applicable' | 'unsupported'
  source?: 'angular' | 'angular-eslint' | 'knip' | 'ng-xray'
}
```

### ScanResult
Should include:
- project info
- elapsed time
- timestamp
- config source/path
- scan status
- failed analyzers
- analyzer runs
- diagnostics/findings
- score
- remediation
- history trend data when available

## Analyzer model

There should be two kinds of analyzers:

### 1. Upstream-backed adapters
Examples:
- Angular Extended Diagnostics adapter
- angular-eslint adapter
- Knip dead-code adapter
- Nx or dependency graph adapter later

### 2. ng-xray-native analyzers
Examples:
- architecture rules engine
- Angular workspace shape analyzer
- compatibility analyzer
- opinionated migration guidance
- high-confidence performance hygiene rules

## Orchestration rules

- Analyzer failures must never silently degrade into success
- Partial scans must be explicit end to end
- Analyzer duration, status, and error reason belong to orchestration, not only logs
- Outputs must not contradict each other

## Output surfaces

### Terminal
Must show:
- scan status
- overall score
- top summary
- partial-scan warning if relevant
- analyzer summary in a compact form
- path to HTML report if generated

### JSON
Must be strict and machine-readable.
No extra stdout noise in JSON mode.

### HTML
Must be a decision tool, not only a dashboard.

Core sections:
- hero / overview
- scan metadata / trust block
- analyzer summary
- remediation
- findings
- score methodology

### SARIF
Must map findings consistently for CI/code-scanning use.

## Architecture priorities

1. Adapter-first integrations for trusted upstream tools
2. Stable shared finding schema
3. Scoring transparency and consistency
4. Plugin-friendly future design
5. Clear separation between stable and experimental rules
