import { describe, it, expect } from 'vitest';
import { runLazyLoadingAnalyzer } from './lazy-loading.js';
import { fixtureDir } from '../__fixtures__/helper.js';

describe('runLazyLoadingAnalyzer', () => {
  it('flags eager route components', async () => {
    const diags = await runLazyLoadingAnalyzer(fixtureDir('eager-routes'));
    expect(diags.some((d) => d.rule === 'eager-route-component')).toBe(true);
    expect(diags).toContainEqual(
      expect.objectContaining({ rule: 'eager-route-component' }),
    );
  });

  it('does not flag lazy routes', async () => {
    const diags = await runLazyLoadingAnalyzer(fixtureDir('eager-routes'));
    const eagerDiags = diags.filter((d) => d.rule === 'eager-route-component');
    expect(eagerDiags).toHaveLength(1);
    expect(eagerDiags[0].message).toContain('home');
  });

  it('returns empty for clean project', async () => {
    const diags = await runLazyLoadingAnalyzer(fixtureDir('clean-project'));
    expect(diags.length).toBe(0);
  });
});
