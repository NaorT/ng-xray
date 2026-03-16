import { describe, it, expect } from 'vitest';
import { runBestPracticesAnalyzer } from './best-practices.js';
import { fixtureDir } from '../__fixtures__/helper.js';

describe('runBestPracticesAnalyzer', () => {
  it('flags constructor injection', async () => {
    const diags = await runBestPracticesAnalyzer(
      fixtureDir('constructor-injection'),
    );
    expect(diags.some((d) => d.rule === 'prefer-inject')).toBe(true);
    expect(diags).toContainEqual(
      expect.objectContaining({ rule: 'prefer-inject' }),
    );
  });

  it('flags async lifecycle hooks', async () => {
    const diags = await runBestPracticesAnalyzer(fixtureDir('async-lifecycle'));
    expect(diags.some((d) => d.rule === 'no-async-lifecycle')).toBe(true);
    expect(diags).toContainEqual(
      expect.objectContaining({ rule: 'no-async-lifecycle' }),
    );
  });

  it('returns empty for clean project', async () => {
    const diags = await runBestPracticesAnalyzer(fixtureDir('clean-project'));
    expect(diags.length).toBe(0);
  });
});
