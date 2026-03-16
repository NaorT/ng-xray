import { describe, it, expect } from 'vitest';
import { walkFiles } from './walk.js';
import { fixtureDir } from '../__fixtures__/helper.js';
import path from 'node:path';

describe('walkFiles', () => {
  it('finds .ts files in directory', () => {
    const files = walkFiles(fixtureDir('clean-project'), ['.ts']);
    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(files.every((f) => f.endsWith('.ts'))).toBe(true);
  });

  it('skips test files by default', () => {
    const files = walkFiles(fixtureDir('clean-project'), ['.ts']);
    const testFiles = files.filter(
      (f) => f.endsWith('.spec.ts') || f.endsWith('.test.ts'),
    );
    expect(testFiles).toHaveLength(0);
  });

  it('respects extensions filter', () => {
    const files = walkFiles(fixtureDir('clean-project'), ['.html']);
    expect(files.every((f) => f.endsWith('.html'))).toBe(true);
    expect(files.some((f) => f.endsWith('.ts'))).toBe(false);
  });

  it('returns empty for non-existent directory', () => {
    const files = walkFiles(path.join('/non', 'existent', 'path'), ['.ts']);
    expect(files).toEqual([]);
  });
});
