import { describe, expect, it } from 'vitest';
import { fixtureDir } from './__fixtures__/helper.js';
import { scan } from './scan.js';

describe('scan', () => {
  it('returns a complete result for a minimal clean Angular project', async () => {
    const result = await scan(fixtureDir('full-project'), {}, true);

    expect(result.scanStatus).toBe('complete');
    expect(result.failedAnalyzers).toEqual([]);
    expect(result.project.projectName).toBe('full-project-fixture');
    expect(result.project.angularVersion).toBe('19.0.0');
    expect(result.diagnostics).toEqual([]);
    expect(result.score.overall).toBe(100);
    expect(result.analyzerRuns.length).toBeGreaterThan(0);
    expect(result.signalReadiness?.score).toBe(100);
  });

  it('lets explicit scan options override disabled architecture config', async () => {
    const result = await scan(
      fixtureDir('full-project-config-disabled'),
      { architecture: true },
      true,
    );

    const architectureRun = result.analyzerRuns.find((run) => run.id === 'architecture');

    expect(architectureRun).toBeDefined();
    expect(architectureRun?.status).toBe('ran');
  });
});
