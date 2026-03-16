import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { NgXrayConfig } from '../types.js';
import { logger } from './logger.js';

const CONFIG_FILENAMES = ['ng-xray.config.json'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isSeverity = (value: unknown): value is 'error' | 'warning' =>
  value === 'error' || value === 'warning';

const isArchitecturePreset = (value: unknown): value is 'angular-feature-shell' | 'angular-domain-driven' =>
  value === 'angular-feature-shell' || value === 'angular-domain-driven';

const normalizeBoundaryRules = (value: unknown): NonNullable<Exclude<NgXrayConfig['architecture'], boolean>>['boundaries'] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const normalized = value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.from !== 'string' || !isStringArray(entry.disallowImportFrom)) {
      return [];
    }
    return [{
      from: entry.from,
      disallowImportFrom: entry.disallowImportFrom,
      ...(isSeverity(entry.severity) ? { severity: entry.severity } : {}),
      ...(typeof entry.message === 'string' ? { message: entry.message } : {}),
    }];
  });
  return normalized.length > 0 ? normalized : undefined;
};

const normalizePublicApiRules = (value: unknown): NonNullable<Exclude<NgXrayConfig['architecture'], boolean>>['publicApi'] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const normalized = value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.zone !== 'string') {
      return [];
    }
    return [{
      zone: entry.zone,
      ...(isStringArray(entry.onlyAllowImportFrom) ? { onlyAllowImportFrom: entry.onlyAllowImportFrom } : {}),
      ...(isSeverity(entry.severity) ? { severity: entry.severity } : {}),
      ...(typeof entry.message === 'string' ? { message: entry.message } : {}),
    }];
  });
  return normalized.length > 0 ? normalized : undefined;
};

const normalizeDeepImportRules = (value: unknown): NonNullable<Exclude<NgXrayConfig['architecture'], boolean>>['deepImports'] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const normalized = value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.pattern !== 'string') {
      return [];
    }
    return [{
      pattern: entry.pattern,
      ...(isSeverity(entry.severity) ? { severity: entry.severity } : {}),
      ...(typeof entry.message === 'string' ? { message: entry.message } : {}),
    }];
  });
  return normalized.length > 0 ? normalized : undefined;
};

const normalizeArchitectureConfig = (
  value: unknown,
  sourceLabel: string,
): NgXrayConfig['architecture'] | undefined => {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (!isRecord(value)) {
    logger.warn(`Config from ${sourceLabel} has invalid architecture config — ignoring.`);
    return undefined;
  }

  const boundaryRules = normalizeBoundaryRules(value.boundaries);
  const publicApiRules = normalizePublicApiRules(value.publicApi);
  const deepImportRules = normalizeDeepImportRules(value.deepImports);

  const normalized = {
    ...(isStringArray(value.featurePaths) ? { featurePaths: value.featurePaths } : {}),
    ...(isStringArray(value.sharedPaths) ? { sharedPaths: value.sharedPaths } : {}),
    ...(isArchitecturePreset(value.preset) ? { preset: value.preset } : {}),
    ...(boundaryRules ? { boundaries: boundaryRules } : {}),
    ...(publicApiRules ? { publicApi: publicApiRules } : {}),
    ...(deepImportRules ? { deepImports: deepImportRules } : {}),
  };

  const hadInvalidField = (
    ('featurePaths' in value && !isStringArray(value.featurePaths)) ||
    ('sharedPaths' in value && !isStringArray(value.sharedPaths)) ||
    ('preset' in value && !isArchitecturePreset(value.preset)) ||
    ('boundaries' in value && !Array.isArray(value.boundaries)) ||
    ('publicApi' in value && !Array.isArray(value.publicApi)) ||
    ('deepImports' in value && !Array.isArray(value.deepImports))
  );
  if (hadInvalidField) {
    logger.warn(`Config from ${sourceLabel} has invalid architecture config — ignoring unsupported values.`);
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

const normalizeConfig = (
  value: unknown,
  sourceLabel: string,
): NgXrayConfig | null => {
  if (!isRecord(value)) return null;

  const normalized: NgXrayConfig = {};

  if (isRecord(value.ignore)) {
    normalized.ignore = {
      ...(isStringArray(value.ignore.rules) ? { rules: value.ignore.rules } : {}),
      ...(isStringArray(value.ignore.files) ? { files: value.ignore.files } : {}),
    };
  }

  if (isRecord(value.thresholds) && typeof value.thresholds['component-loc'] === 'number') {
    normalized.thresholds = { 'component-loc': value.thresholds['component-loc'] };
  }

  if (typeof value.lint === 'boolean') normalized.lint = value.lint;
  if (typeof value.deadCode === 'boolean') normalized.deadCode = value.deadCode;
  if (typeof value.performance === 'boolean') normalized.performance = value.performance;
  if (typeof value.verbose === 'boolean') normalized.verbose = value.verbose;

  const architecture = normalizeArchitectureConfig(value.architecture, sourceLabel);
  if (architecture !== undefined) {
    normalized.architecture = architecture;
  }

  return normalized;
};

export interface ConfigLoadResult {
  config: NgXrayConfig | null;
  configPath: string | null;
}

export const loadConfigWithPath = (directory: string): ConfigLoadResult => {
  for (const filename of CONFIG_FILENAMES) {
    const filePath = path.join(directory, filename);
    if (existsSync(filePath)) {
      try {
        const raw = readFileSync(filePath, 'utf-8');
        return {
          config: normalizeConfig(JSON.parse(raw), filePath),
          configPath: filePath,
        };
      } catch {
        logger.warn(`Config file ${filePath} could not be parsed — ignoring.`);
        return { config: null, configPath: null };
      }
    }
  }

  const packageJsonPath = path.join(directory, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const raw = readFileSync(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(raw) as Record<string, unknown>;
      if (pkg['ngXray']) {
        return {
          config: normalizeConfig(pkg['ngXray'], 'package.json#ngXray'),
          configPath: 'package.json#ngXray',
        };
      }
    } catch {
      // ignore
    }
  }

  return { config: null, configPath: null };
};

export const loadConfig = (directory: string): NgXrayConfig | null =>
  loadConfigWithPath(directory).config;
