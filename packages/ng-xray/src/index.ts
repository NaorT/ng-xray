import { scan } from './scan.js';
import type { Diagnostic, ScanOptions, ScanResult, ProjectInfo, ScoreResult, RemediationItem } from './types.js';
export { generateSarif } from './report/sarif.js';
export { generatePrSummary } from './report/pr-summary.js';

export type { Diagnostic, ScanOptions, ScanResult, ProjectInfo, ScoreResult, RemediationItem };

export interface DiagnoseOptions {
  lint?: boolean;
  deadCode?: boolean;
  architecture?: boolean;
  performance?: boolean;
}

export const diagnose = async (
  directory: string,
  options: DiagnoseOptions = {},
): Promise<ScanResult> => {
  return scan(directory, { ...options, scoreOnly: false }, true);
};
