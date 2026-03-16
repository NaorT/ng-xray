import { describe, it, expect, vi } from 'vitest';
import { loadConfig } from './load-config.js';
import { fixtureDir } from '../__fixtures__/helper.js';

vi.mock('./logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

const { logger } = await vi.importMock<typeof import('./logger.js')>('./logger.js');

describe('loadConfig', () => {
  it('returns null when no config file exists', () => {
    const result = loadConfig(fixtureDir('clean-project'));
    expect(result).toBeNull();
  });

  it('returns null and warns on malformed JSON config', () => {
    const result = loadConfig(fixtureDir('bad-config'));
    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('could not be parsed'),
    );
  });

  it('reads ngXray key from package.json', () => {
    const result = loadConfig(fixtureDir('with-config'));
    expect(result).toEqual({
      ignore: { rules: ['missing-onpush'] },
      architecture: {
        preset: 'angular-feature-shell',
        boundaries: [
          {
            from: 'src/app/features/**',
            disallowImportFrom: ['src/app/legacy/**'],
            severity: 'warning',
            message: 'Features should not depend on legacy code.',
          },
        ],
        publicApi: [
          {
            zone: 'src/app/shared/*',
            onlyAllowImportFrom: ['index.ts'],
            severity: 'warning',
          },
        ],
        deepImports: [
          {
            pattern: '@company/*/internal/**',
            severity: 'error',
            message: 'Do not import from internal package paths.',
          },
        ],
      },
    });
  });

  it('normalizes invalid architecture config fields from package.json', () => {
    const result = loadConfig(fixtureDir('invalid-architecture-config'));

    expect(result).toEqual({
      architecture: {
        sharedPaths: ['shared', 'core'],
      },
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('invalid architecture config'),
    );
  });
});
