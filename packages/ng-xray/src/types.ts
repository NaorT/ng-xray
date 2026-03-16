export type Severity = 'error' | 'warning';
export type DiagnosticSource = 'angular' | 'angular-eslint' | 'eslint' | 'knip' | 'ng-xray';
export type DiagnosticStability = 'stable' | 'experimental';

export type Category =
  | 'best-practices'
  | 'performance'
  | 'architecture'
  | 'dead-code'
  | 'security';

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
  priority: 'high' | 'medium' | 'low';
  rule: string;
  description: string;
  estimatedScoreImpact: number;
  affectedFileCount: number;
}

export interface SignalReadinessReport {
  score: number;
  counts: Record<string, { legacy: number; modern: number }>;
  migrationPlan: { pattern: string; count: number; effort: 'low' | 'medium' | 'high'; description: string }[];
}

export interface ArchitectureAnalyzerConfig {
  featurePaths?: string[];
  sharedPaths?: string[];
}

export interface AnalyzerRunInfo {
  id: string;
  label: string;
  status: 'ran' | 'failed' | 'skipped';
  findingsCount: number;
  durationMs: number;
  experimental: boolean;
  errorMessage?: string;
  skipReason?: 'disabled' | 'not-applicable' | 'unsupported';
}

export interface ScanResult {
  scanStatus: 'complete' | 'partial';
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
}

export interface ScanOptions {
  lint?: boolean;
  deadCode?: boolean;
  architecture?: boolean;
  performance?: boolean;
  verbose?: boolean;
  scoreOnly?: boolean;
  json?: boolean;
  noOpen?: boolean;
  includePaths?: string[];
  ignoreBaseline?: boolean;
}

export interface NgXrayConfig {
  ignore?: {
    rules?: string[];
    files?: string[];
  };
  thresholds?: {
    'component-loc'?: number;
  };
  lint?: boolean;
  deadCode?: boolean;
  architecture?: boolean | ArchitectureAnalyzerConfig;
  performance?: boolean;
  verbose?: boolean;
}
