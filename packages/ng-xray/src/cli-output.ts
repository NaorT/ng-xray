export type OutputMode = 'terminal' | 'score' | 'json' | 'sarif' | 'pr-summary';

export const shouldPersistHistory = (mode: OutputMode): boolean =>
  mode === 'terminal';

export const shouldGenerateHtmlReport = (mode: OutputMode): boolean =>
  mode === 'terminal';
