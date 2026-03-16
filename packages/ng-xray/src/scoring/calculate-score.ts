import {
  CATEGORY_LABELS,
  CATEGORY_MAX_DEDUCTIONS,
  EXPERIMENTAL_WEIGHT_MULTIPLIER,
  PERFECT_SCORE,
  RULE_MAX_DEDUCTIONS,
  SEVERITY_WEIGHTS,
  getScoreLabel,
} from '../constants.js';
import type {
  Category,
  CategoryScore,
  Diagnostic,
  RemediationItem,
  ScoreResult,
} from '../types.js';

export interface ScoreOptions {
  fileCount?: number;
}

const groupByCategory = (diagnostics: Diagnostic[]): Map<Category, Diagnostic[]> => {
  const groups = new Map<Category, Diagnostic[]>();
  for (const diag of diagnostics) {
    const list = groups.get(diag.category) ?? [];
    list.push(diag);
    groups.set(diag.category, list);
  }
  return groups;
};

const groupByRule = (diagnostics: Diagnostic[]): Map<string, Diagnostic[]> => {
  const groups = new Map<string, Diagnostic[]>();
  for (const diag of diagnostics) {
    const list = groups.get(diag.rule) ?? [];
    list.push(diag);
    groups.set(diag.rule, list);
  }
  return groups;
};

const calculateRuleDeduction = (diagnostics: Diagnostic[]): number => {
  let raw = 0;
  for (const diag of diagnostics) {
    const baseWeight = diag.weight ?? SEVERITY_WEIGHTS[diag.severity];
    const multiplier = diag.stability === 'experimental'
      ? EXPERIMENTAL_WEIGHT_MULTIPLIER
      : 1;
    raw += baseWeight * multiplier;
  }
  const ruleCap = RULE_MAX_DEDUCTIONS[diagnostics[0]?.rule];
  return ruleCap != null ? Math.min(raw, ruleCap) : raw;
};

const calculateCategoryDeduction = (diagnostics: Diagnostic[], maxDeduction: number): number => {
  const byRule = groupByRule(diagnostics);
  let total = 0;
  for (const [, ruleDiags] of byRule) {
    total += calculateRuleDeduction(ruleDiags);
  }
  return Math.min(total, maxDeduction);
};

const densityMultiplier = (issueCount: number, fileCount: number): number => {
  if (fileCount <= 0) return 1;
  const density = issueCount / fileCount;
  if (density >= 0.5) return 1;
  if (density >= 0.1) return 0.85;
  return 0.7;
};

export const calculateScore = (diagnostics: Diagnostic[], options?: ScoreOptions): ScoreResult => {
  const grouped = groupByCategory(diagnostics);
  const allCategories: Category[] = ['best-practices', 'performance', 'architecture', 'dead-code', 'security'];
  const fileCount = options?.fileCount;

  const categories: CategoryScore[] = allCategories.map((category) => {
    const categoryDiags = grouped.get(category) ?? [];
    const maxDeduction = CATEGORY_MAX_DEDUCTIONS[category];
    let deduction = calculateCategoryDeduction(categoryDiags, maxDeduction);

    if (fileCount != null && fileCount > 0) {
      deduction = Math.min(
        Math.round(deduction * densityMultiplier(categoryDiags.length, fileCount)),
        maxDeduction,
      );
    }

    return {
      category,
      label: CATEGORY_LABELS[category],
      score: maxDeduction - deduction,
      maxDeduction,
      deduction,
      issueCount: categoryDiags.length,
    };
  });

  const totalDeduction = categories.reduce((sum, c) => sum + c.deduction, 0);
  const overall = Math.max(0, PERFECT_SCORE - totalDeduction);

  return {
    overall,
    label: getScoreLabel(overall),
    categories,
  };
};

export const generateRemediation = (
  diagnostics: Diagnostic[],
  options?: ScoreOptions,
): RemediationItem[] => {
  const byCategory = groupByCategory(diagnostics);
  const items: RemediationItem[] = [];
  const fileCount = options?.fileCount;

  for (const [category, categoryDiags] of byCategory) {
    const maxDeduction = CATEGORY_MAX_DEDUCTIONS[category];
    const ruleGroups = groupByRule(categoryDiags);

    const ruleDeductions = new Map<string, number>();
    for (const [rule, diags] of ruleGroups) {
      const totalWeight = diags.reduce((sum, d) => sum + (d.weight ?? SEVERITY_WEIGHTS[d.severity]), 0);
      const ruleCap = RULE_MAX_DEDUCTIONS[rule];
      ruleDeductions.set(rule, ruleCap != null ? Math.min(totalWeight, ruleCap) : totalWeight);
    }

    const totalCategoryDeduction = Math.min(
      [...ruleDeductions.values()].reduce((sum, d) => sum + d, 0),
      maxDeduction,
    );

    for (const [rule, diags] of ruleGroups) {
      const ruleDeduction = ruleDeductions.get(rule) ?? 0;
      const otherDeduction = [...ruleDeductions.entries()]
        .filter(([r]) => r !== rule)
        .reduce((sum, [, d]) => sum + d, 0);
      const marginalImpact = Math.min(ruleDeduction, Math.max(0, totalCategoryDeduction - Math.min(otherDeduction, maxDeduction)));

      if (marginalImpact === 0 && ruleDeduction === 0) continue;

      let estimatedImpact = Math.max(marginalImpact, 1);
      if (fileCount != null && fileCount > 0) {
        estimatedImpact = Math.max(
          estimatedImpact * densityMultiplier(diags.length, fileCount),
          1,
        );
      }
      const uniqueFiles = new Set(diags.map((d) => d.filePath));

      items.push({
        priority: estimatedImpact >= 6 ? 'high' : estimatedImpact >= 3 ? 'medium' : 'low',
        rule,
        description: diags[0].message,
        estimatedScoreImpact: estimatedImpact,
        affectedFileCount: uniqueFiles.size,
      });
    }
  }

  return items.sort((a, b) => b.estimatedScoreImpact - a.estimatedScoreImpact);
};
