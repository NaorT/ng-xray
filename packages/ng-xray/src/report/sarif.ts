import type { Diagnostic, ScanResult } from '../types.js';
import { VERSION } from '../constants.js';

const SARIF_SCHEMA =
  'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json';

function isUrl(text: string): boolean {
  return /^https?:\/\//i.test(text);
}

function buildRules(diagnostics: Diagnostic[]): SarifRule[] {
  const byRule = new Map<string, Diagnostic>();
  for (const d of diagnostics) {
    if (!byRule.has(d.rule)) byRule.set(d.rule, d);
  }
  return Array.from(byRule.entries()).map(([id, d]) => {
    const rule: SarifRule = {
      id,
      shortDescription: { text: d.message },
      defaultConfiguration: { level: d.severity === 'error' ? 'error' : 'warning' },
      properties: { category: d.category },
    };
    if (isUrl(d.help)) {
      rule.helpUri = d.help;
    } else {
      rule.help = { text: d.help };
    }
    return rule;
  });
}

interface SarifPhysicalLocation {
  artifactLocation: { uri: string };
  region?: { startLine?: number; startColumn?: number };
}

function buildResults(diagnostics: Diagnostic[], ruleIdToIndex: Map<string, number>): SarifResult[] {
  return diagnostics.map((d) => {
    const physicalLocation: SarifPhysicalLocation = {
      artifactLocation: { uri: d.filePath },
    };
    if (d.line >= 1 || d.column >= 1) {
      physicalLocation.region = {
        ...(d.line >= 1 && { startLine: d.line }),
        ...(d.column >= 1 && { startColumn: d.column }),
      };
    }

    return {
      ruleId: d.rule,
      ruleIndex: ruleIdToIndex.get(d.rule) ?? -1,
      level: (d.severity === 'error' ? 'error' : 'warning') as 'error' | 'warning',
      message: { text: d.message },
      locations: [{ physicalLocation }],
      properties: {
        source: d.source,
        stability: d.stability,
        category: d.category,
        provenance: d.provenance,
        trust: d.trust,
        includedInScore: d.includedInScore,
      },
    };
  });
}

function buildNotifications(failedAnalyzers: string[]): SarifNotification[] {
  return failedAnalyzers.map((analyzer) => ({
    message: { text: `Analyzer "${analyzer}" failed during scan` },
    level: 'error' as const,
  }));
}

interface SarifRule {
  id: string;
  shortDescription: { text: string };
  help?: { text: string };
  helpUri?: string;
  defaultConfiguration: { level: 'error' | 'warning' };
  properties: { category: string };
}

interface SarifResult {
  ruleId: string;
  ruleIndex: number;
  level: 'error' | 'warning';
  message: { text: string };
  locations: { physicalLocation: SarifPhysicalLocation }[];
  properties: Record<string, unknown>;
}

interface SarifNotification {
  message: { text: string };
  level: 'error';
}

export function generateSarif(result: ScanResult): string {
  const rules = buildRules(result.diagnostics);
  const ruleIdToIndex = new Map(rules.map((r, i) => [r.id, i]));

  const sarifRules = rules.map((r) => {
    const rule: Record<string, unknown> = {
      id: r.id,
      shortDescription: r.shortDescription,
      defaultConfiguration: r.defaultConfiguration,
      properties: r.properties,
    };
    if (r.helpUri) rule.helpUri = r.helpUri;
    else if (r.help) rule.help = r.help;
    return rule;
  });

  const run: Record<string, unknown> = {
    tool: {
      driver: {
        name: 'ng-xray',
        version: VERSION,
        informationUri: 'https://github.com/nicktamir/ng-xray',
        rules: sarifRules,
      },
    },
    results: buildResults(result.diagnostics, ruleIdToIndex),
    invocations: [
      {
        executionSuccessful: result.scanStatus === 'complete',
        toolExecutionNotifications: buildNotifications(result.failedAnalyzers),
      },
    ],
    properties: {
      scanStatus: result.scanStatus,
      failedAnalyzers: result.failedAnalyzers,
      profile: result.profile ?? 'core',
      scoredDiagnosticsCount: result.scoredDiagnosticsCount ?? result.diagnostics.length,
      advisoryDiagnosticsCount: result.advisoryDiagnosticsCount ?? 0,
      excludedDiagnosticsCount: result.excludedDiagnosticsCount ?? 0,
    },
  };

  const sarif = {
    $schema: SARIF_SCHEMA,
    version: '2.1.0',
    runs: [run],
  };

  return JSON.stringify(sarif, null, 2);
}
