import { describe, expect, it } from 'vitest';
import { parseKnipOutput } from './dead-code.js';

describe('parseKnipOutput', () => {
  it('marks local Knip results as trusted project provenance', () => {
    const diagnostics = parseKnipOutput(JSON.stringify({
      files: ['/repo/src/app/unused.ts'],
      issues: [],
    }), '/repo', 'local');

    expect(diagnostics[0]?.source).toBe('knip');
    expect(diagnostics[0]?.provenance).toBe('project-knip');
    expect(diagnostics[0]?.trust).toBe('core');
  });

  it('marks fallback Knip results as advisory fallback provenance', () => {
    const diagnostics = parseKnipOutput(JSON.stringify({
      files: ['/repo/src/app/unused.ts'],
      issues: [],
    }), '/repo', 'fallback');

    expect(diagnostics[0]?.source).toBe('knip');
    expect(diagnostics[0]?.provenance).toBe('ng-xray-knip-fallback');
    expect(diagnostics[0]?.trust).toBe('advisory');
  });
});
