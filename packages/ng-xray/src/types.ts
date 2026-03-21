export type Severity = "error" | "warning";
export type DiagnosticSource = "angular" | "angular-eslint" | "eslint" | "knip" | "ng-xray";
export type DiagnosticStability = "stable" | "experimental";
export type DiagnosticTrust = "core" | "advisory";
export type DiagnosticProvenance =
  | "angular-compiler"
  | "project-eslint"
  | "project-knip"
  | "ng-xray-native-stable"
  | "ng-xray-built-in-lint"
  | "ng-xray-heuristic";
export type ScanProfile = "core" | "all";

export type Category = "best-practices" | "performance" | "architecture" | "dead-code" | "security";

export interface Diagnostic {
  filePath: string;
  rule: string;
  category: Category;
  severity: Severity;
  message: string;
  help: string;
  line: number;
  column: number;
  source: DiagnosticSource;
  stability: DiagnosticStability;
  weight?: number;
  trust?: DiagnosticTrust;
  provenance?: DiagnosticProvenance;
  includedInScore?: boolean;
}

export interface ProjectInfo {
  rootDirectory: string;
  projectName: string;
  angularVersion: string | null;
  hasSSR: boolean;
  hasSignals: boolean;
  standalonePercentage: number;
  hasTypeScript: boolean;
  sourceFileCount: number;
  componentCount: number;
  serviceCount: number;
}

export interface CategoryScore {
  category: Category;
  label: string;
  score: number;
  maxDeduction: number;
  deduction: number;
  issueCount: number;
}

export interface ScoreResult {
  overall: number;
  label: string;
  categories: CategoryScore[];
}

export interface RemediationItem {
  priority: "high" | "medium" | "low";
  rule: string;
  description: string;
  estimatedScoreImpact: number;
  affectedFileCount: number;
  includedInScore?: boolean;
}

export interface SignalReadinessReport {
  score: number;
  counts: Record<string, { legacy: number; modern: number }>;
  migrationPlan: { pattern: string; count: number; effort: "low" | "medium" | "high"; description: string }[];
}

export interface BoundaryRule {
  from: string;
  disallowImportFrom: string[];
  severity?: Severity;
  message?: string;
}

export interface PublicApiRule {
  zone: string;
  onlyAllowImportFrom?: string[];
  severity?: Severity;
  message?: string;
}

export interface DeepImportRule {
  pattern: string;
  severity?: Severity;
  message?: string;
}

export type ArchitecturePreset = "angular-feature-shell" | "angular-domain-driven";

export interface ArchitectureAnalyzerConfig {
  featurePaths?: string[];
  sharedPaths?: string[];
  preset?: ArchitecturePreset;
  boundaries?: BoundaryRule[];
  publicApi?: PublicApiRule[];
  deepImports?: DeepImportRule[];
}

export interface AnalyzerRunInfo {
  id: string;
  label: string;
  status: "ran" | "failed" | "skipped";
  findingsCount: number;
  durationMs: number;
  experimental: boolean;
  errorMessage?: string;
  skipReason?: "disabled" | "not-applicable" | "unsupported";
}

export interface ScanResult {
  scanStatus: "complete" | "partial";
  failedAnalyzers: string[];
  diagnostics: Diagnostic[];
  score: ScoreResult;
  project: ProjectInfo;
  remediation: RemediationItem[];
  elapsedMs: number;
  signalReadiness?: SignalReadinessReport;
  timestamp: string;
  configPath: string | null;
  analyzerRuns: AnalyzerRunInfo[];
  profile?: ScanProfile;
  scoredDiagnosticsCount?: number;
  advisoryDiagnosticsCount?: number;
  excludedDiagnosticsCount?: number;
}

export interface ScanOptions {
  lint?: boolean;
  deadCode?: boolean;
  architecture?: boolean;
  performance?: boolean;
  profile?: ScanProfile;
  verbose?: boolean;
  ignoreBaseline?: boolean;
  noExec?: boolean;
}

export interface NgXrayConfig {
  ignore?: {
    rules?: string[];
    files?: string[];
  };
  thresholds?: {
    "component-loc"?: number;
  };
  lint?: boolean;
  deadCode?: boolean;
  architecture?: boolean | ArchitectureAnalyzerConfig;
  performance?: boolean;
  verbose?: boolean;
}
