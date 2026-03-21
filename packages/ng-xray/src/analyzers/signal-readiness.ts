import { readFileSync } from "node:fs";
import ts from "typescript";
import type { Diagnostic } from "../types.js";
import { logger } from "../utils/logger.js";
import { resolveSrcDir } from "../utils/resolve-src.js";
import { walkFiles } from "../utils/walk.js";

export interface PatternCount {
  legacy: number;
  modern: number;
}

export interface MigrationStep {
  pattern: string;
  count: number;
  effort: "low" | "medium" | "high";
  description: string;
}

export interface SignalReadinessReport {
  score: number;
  counts: Record<string, PatternCount>;
  migrationPlan: MigrationStep[];
}

const countPatterns = (sourceFile: ts.SourceFile): Record<string, PatternCount> => {
  const counts: Record<string, PatternCount> = {
    Input: { legacy: 0, modern: 0 },
    Output: { legacy: 0, modern: 0 },
    ViewChild: { legacy: 0, modern: 0 },
    ContentChild: { legacy: 0, modern: 0 },
    Injection: { legacy: 0, modern: 0 },
    State: { legacy: 0, modern: 0 },
    Subscriptions: { legacy: 0, modern: 0 },
  };

  const visit = (node: ts.Node): void => {
    if (ts.isDecorator(node)) {
      const expr = node.expression;
      if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)) {
        const name = expr.expression.text;
        if (name === "Input") counts["Input"].legacy++;
        if (name === "Output") counts["Output"].legacy++;
        if (name === "ViewChild" || name === "ViewChildren") counts["ViewChild"].legacy++;
        if (name === "ContentChild" || name === "ContentChildren") counts["ContentChild"].legacy++;
      }
    }

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      if (name === "input") counts["Input"].modern++;
      if (name === "output") counts["Output"].modern++;
      if (name === "viewChild" || name === "viewChildren") counts["ViewChild"].modern++;
      if (name === "contentChild" || name === "contentChildren") counts["ContentChild"].modern++;
      if (name === "inject") counts["Injection"].modern++;
      if (name === "signal" || name === "computed") counts["State"].modern++;
      if (name === "toSignal" || name === "toObservable") counts["Subscriptions"].modern++;
    }

    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const propName = node.expression.name.text;
      if (propName === "subscribe") counts["Subscriptions"].legacy++;
      if (propName === "required" && ts.isIdentifier(node.expression.expression)) {
        const obj = node.expression.expression.text;
        if (obj === "input") counts["Input"].modern++;
      }
    }

    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      if (name === "BehaviorSubject" || name === "ReplaySubject" || name === "Subject") {
        counts["State"].legacy++;
      }
    }

    if (ts.isConstructorDeclaration(node)) {
      for (const param of node.parameters) {
        const hasAccessModifier = param.modifiers?.some(
          (m) =>
            m.kind === ts.SyntaxKind.PrivateKeyword ||
            m.kind === ts.SyntaxKind.PublicKeyword ||
            m.kind === ts.SyntaxKind.ProtectedKeyword ||
            m.kind === ts.SyntaxKind.ReadonlyKeyword,
        );
        if (hasAccessModifier && param.type) {
          counts["Injection"].legacy++;
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return counts;
};

const EFFORT_MAP: Record<string, { effort: "low" | "medium" | "high"; description: string }> = {
  Input: { effort: "low", description: "Migrate @Input() to input() / input.required() — mechanical, low risk." },
  Output: { effort: "low", description: "Migrate @Output() to output() — mechanical replacement." },
  ViewChild: {
    effort: "medium",
    description: "Migrate @ViewChild() to viewChild() — check timing in lifecycle hooks.",
  },
  ContentChild: {
    effort: "medium",
    description: "Migrate @ContentChild() to contentChild() — check projected content lifecycle.",
  },
  Injection: {
    effort: "low",
    description: "Migrate constructor injection to inject() — mechanical, no behavior change.",
  },
  State: {
    effort: "high",
    description: "Migrate BehaviorSubject/ReplaySubject to signal() — requires understanding data flow.",
  },
  Subscriptions: {
    effort: "high",
    description: "Replace .subscribe() with toSignal()/effect() — requires async flow analysis.",
  },
};

export const analyzeSignalReadiness = (directory: string): SignalReadinessReport => {
  const srcDir = resolveSrcDir(directory);
  const files = walkFiles(srcDir, [".ts"]);

  const totals: Record<string, PatternCount> = {};
  for (const key of Object.keys(EFFORT_MAP)) {
    totals[key] = { legacy: 0, modern: 0 };
  }

  for (const filePath of files) {
    try {
      const content = readFileSync(filePath, "utf-8");
      const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
      const fileCounts = countPatterns(sourceFile);

      for (const key of Object.keys(totals)) {
        totals[key].legacy += fileCounts[key]?.legacy ?? 0;
        totals[key].modern += fileCounts[key]?.modern ?? 0;
      }
    } catch (error) {
      logger.error(
        `Signal readiness: failed to read ${filePath} — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  let totalLegacy = 0;
  let totalModern = 0;
  for (const c of Object.values(totals)) {
    totalLegacy += c.legacy;
    totalModern += c.modern;
  }

  const total = totalLegacy + totalModern;
  const score = total === 0 ? 100 : Math.round((totalModern / total) * 100);

  const migrationPlan: MigrationStep[] = Object.entries(totals)
    .filter(([, c]) => c.legacy > 0)
    .sort((a, b) => {
      const effortOrder = { low: 0, medium: 1, high: 2 };
      return effortOrder[EFFORT_MAP[a[0]].effort] - effortOrder[EFFORT_MAP[b[0]].effort] || b[1].legacy - a[1].legacy;
    })
    .map(([pattern, c]) => ({
      pattern,
      count: c.legacy,
      effort: EFFORT_MAP[pattern].effort,
      description: EFFORT_MAP[pattern].description,
    }));

  return { score, counts: totals, migrationPlan };
};

export const runSignalReadinessAnalyzer = async (directory: string): Promise<Diagnostic[]> => {
  const report = analyzeSignalReadiness(directory);

  const diagnostics: Diagnostic[] = [];
  if (report.score < 50) {
    diagnostics.push({
      filePath: "project-wide",
      rule: "low-signal-readiness",
      category: "best-practices",
      severity: "warning",
      message: `Signal readiness score is ${report.score}%. Consider migrating legacy patterns to Angular signals.`,
      help:
        report.migrationPlan.length > 0
          ? `Start with: ${report.migrationPlan[0].description}`
          : "No specific migration steps identified.",
      line: 0,
      column: 0,
      source: "ng-xray",
      stability: "experimental",
    });
  }

  return diagnostics;
};
