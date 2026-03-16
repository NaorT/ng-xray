import { describe, it, expect } from 'vitest';
import { runSecurityAnalyzer } from './security.js';
import { fixtureDir } from '../__fixtures__/helper.js';

describe('runSecurityAnalyzer', () => {
  it('flags bypassSecurityTrust calls', async () => {
    const diags = await runSecurityAnalyzer(fixtureDir('security-issues'));
    expect(diags).toContainEqual(
      expect.objectContaining({
        rule: 'bypass-security-trust',
        source: 'ng-xray',
        stability: 'experimental',
      }),
    );
  });

  it('flags eval() usage', async () => {
    const diags = await runSecurityAnalyzer(fixtureDir('security-issues'));
    expect(diags.some((d) => d.rule === 'eval-usage')).toBe(true);
  });

  it('flags hardcoded secrets', async () => {
    const diags = await runSecurityAnalyzer(fixtureDir('security-issues'));
    expect(diags.some((d) => d.rule === 'hardcoded-secret')).toBe(true);
  });

  it('flags innerHTML bindings in templates', async () => {
    const diags = await runSecurityAnalyzer(fixtureDir('security-issues'));
    const innerHtml = diags.filter((d) => d.rule === 'innerhtml-binding');
    expect(innerHtml.length).toBeGreaterThan(0);
  });

  it('returns empty for clean project', async () => {
    const diags = await runSecurityAnalyzer(fixtureDir('clean-project'));
    expect(diags).toHaveLength(0);
  });

  it('produces diagnostics with correct security category', async () => {
    const diags = await runSecurityAnalyzer(fixtureDir('security-issues'));
    for (const d of diags) {
      expect(d.category).toBe('security');
    }
  });
});
