import { describe, expect, it } from 'vitest';
import {
  shouldGenerateHtmlReport,
  shouldPersistHistory,
  type OutputMode,
} from './cli-output.js';

describe('cli output behavior', () => {
  const machineReadableModes: OutputMode[] = ['json', 'sarif', 'pr-summary'];

  it('does not persist history for machine-readable modes', () => {
    for (const mode of machineReadableModes) {
      expect(shouldPersistHistory(mode)).toBe(false);
    }
  });

  it('persists history for interactive terminal scans only', () => {
    expect(shouldPersistHistory('terminal')).toBe(true);
    expect(shouldPersistHistory('score')).toBe(false);
  });

  it('only generates HTML reports for interactive terminal scans', () => {
    expect(shouldGenerateHtmlReport('terminal')).toBe(true);
    expect(shouldGenerateHtmlReport('score')).toBe(false);
    expect(shouldGenerateHtmlReport('json')).toBe(false);
    expect(shouldGenerateHtmlReport('sarif')).toBe(false);
    expect(shouldGenerateHtmlReport('pr-summary')).toBe(false);
  });
});
