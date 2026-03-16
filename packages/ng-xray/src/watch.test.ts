import { describe, expect, it } from 'vitest';
import { fixtureDir } from './__fixtures__/helper.js';
import { resolveWatchPath } from './watch.js';

describe('resolveWatchPath', () => {
  it('uses src when a conventional source directory exists', () => {
    expect(resolveWatchPath(fixtureDir('full-project'))).toBe(
      fixtureDir('full-project/src'),
    );
  });

  it('falls back to the project root when no src directory exists', () => {
    expect(resolveWatchPath(fixtureDir('no-src-dir'))).toBe(
      fixtureDir('no-src-dir'),
    );
  });

  it('honors an explicit source root for workspace projects', () => {
    expect(resolveWatchPath('/workspace/apps/demo', '/workspace/apps/demo/custom-src')).toBe(
      '/workspace/apps/demo/custom-src',
    );
  });
});
