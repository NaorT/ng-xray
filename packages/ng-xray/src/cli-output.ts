export type OutputMode = 'terminal' | 'score' | 'json' | 'sarif' | 'pr-summary';

interface OutputSideEffectHooks {
  appendHistory: () => void;
  generateHtmlReport: () => string;
  printReportLink: (reportPath: string) => void;
}

export const shouldPersistHistory = (mode: OutputMode): boolean =>
  mode === 'terminal';

export const shouldGenerateHtmlReport = (mode: OutputMode): boolean =>
  mode === 'terminal';

export const applyOutputSideEffects = (
  mode: OutputMode,
  hooks: OutputSideEffectHooks,
): string | null => {
  if (shouldPersistHistory(mode)) {
    hooks.appendHistory();
  }

  if (!shouldGenerateHtmlReport(mode)) {
    return null;
  }

  const reportPath = hooks.generateHtmlReport();
  hooks.printReportLink(reportPath);
  return reportPath;
};
