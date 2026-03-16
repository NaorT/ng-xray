import { describe, it, expect } from 'vitest';
import { runPerformanceAnalyzer } from './performance.js';
import { fixtureDir } from '../__fixtures__/helper.js';

describe('runPerformanceAnalyzer', () => {
  it('flags components without OnPush', async () => {
    const diags = await runPerformanceAnalyzer(fixtureDir('missing-onpush'));
    expect(diags.some((d) => d.rule === 'missing-onpush')).toBe(true);
    expect(diags).toContainEqual(
      expect.objectContaining({
        rule: 'missing-onpush',
        source: 'ng-xray',
        stability: 'stable',
      }),
    );
  });

  it('does not flag components with OnPush', async () => {
    const diags = await runPerformanceAnalyzer(fixtureDir('clean-project'));
    expect(diags.some((d) => d.rule === 'missing-onpush')).toBe(false);
  });

  it('flags heavy constructors', async () => {
    const diags = await runPerformanceAnalyzer(fixtureDir('heavy-constructor'));
    expect(diags.some((d) => d.rule === 'heavy-constructor')).toBe(true);
    expect(diags).toContainEqual(
      expect.objectContaining({ rule: 'heavy-constructor' }),
    );
  });

  it('returns empty for clean project', async () => {
    const diags = await runPerformanceAnalyzer(fixtureDir('clean-project'));
    expect(diags.length).toBe(0);
  });
});
