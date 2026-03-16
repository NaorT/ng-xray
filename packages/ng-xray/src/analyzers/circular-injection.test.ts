import { describe, it, expect } from 'vitest';
import { runCircularInjectionAnalyzer } from './circular-injection.js';
import { fixtureDir } from '../__fixtures__/helper.js';

describe('runCircularInjectionAnalyzer', () => {
  it('returns empty for clean project without class map', async () => {
    const diags = await runCircularInjectionAnalyzer(fixtureDir('clean-project'));
    expect(diags).toHaveLength(0);
  });
});
