import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { Diagnostic } from '../types.js';
import type { ProjectClassMap } from '../utils/inheritance-resolver.js';
import { parseSourceFile, findClassDeclarations, getClassName } from '../utils/ts-ast-helpers.js';

const extractInjections = (classNode: ts.ClassDeclaration, sourceFile: ts.SourceFile, knownServices: Set<string>): string[] => {
  const injections: string[] = [];

  for (const member of classNode.members) {
    if (ts.isPropertyDeclaration(member) && member.initializer && ts.isCallExpression(member.initializer)) {
      const callExpr = member.initializer;
      if (ts.isIdentifier(callExpr.expression) && callExpr.expression.text === 'inject') {
        const arg = callExpr.arguments[0];
        if (arg && ts.isIdentifier(arg) && knownServices.has(arg.text)) {
          injections.push(arg.text);
        }
      }
    }

    if (ts.isConstructorDeclaration(member)) {
      for (const param of member.parameters) {
        if (param.type && ts.isTypeReferenceNode(param.type) && ts.isIdentifier(param.type.typeName)) {
          const typeName = param.type.typeName.text;
          if (knownServices.has(typeName)) {
            injections.push(typeName);
          }
        }
      }
    }
  }

  return injections;
};

const detectCycles = (graph: Map<string, string[]>): string[][] => {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];

  const dfs = (node: string): void => {
    if (inStack.has(node)) {
      const cycleStart = path.indexOf(node);
      if (cycleStart !== -1) {
        cycles.push([...path.slice(cycleStart), node]);
      }
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);
    path.push(node);

    for (const neighbor of graph.get(node) ?? []) {
      dfs(neighbor);
    }

    path.pop();
    inStack.delete(node);
  };

  for (const node of graph.keys()) {
    dfs(node);
  }

  return cycles;
};

const hasForwardRef = (content: string): { line: number; name: string }[] => {
  const results: { line: number; name: string }[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('forwardRef')) {
      results.push({ line: i + 1, name: 'forwardRef' });
    }
  }
  return results;
};

export const runCircularInjectionAnalyzer = async (
  directory: string,
  prebuiltClassMap?: ProjectClassMap,
): Promise<Diagnostic[]> => {
  const diagnostics: Diagnostic[] = [];

  if (!prebuiltClassMap) return diagnostics;

  const knownServices = new Set<string>();
  for (const [name, info] of prebuiltClassMap.classes) {
    if (info.isService) knownServices.add(name);
  }

  const injectionGraph = new Map<string, string[]>();

  for (const [className, classInfo] of prebuiltClassMap.classes) {
    if (!classInfo.isService) continue;

    try {
      const sourceFile = parseSourceFile(classInfo.filePath);
      if (!sourceFile) continue;

      const classNodes = findClassDeclarations(sourceFile);
      const targetClass = classNodes.find((c) => getClassName(c) === className);
      if (!targetClass) continue;

      const injections = extractInjections(targetClass, sourceFile, knownServices);
      if (injections.length > 0) {
        injectionGraph.set(className, injections);
      }

      const content = readFileSync(classInfo.filePath, 'utf-8');
      const forwardRefs = hasForwardRef(content);
      for (const ref of forwardRefs) {
        diagnostics.push({
          filePath: path.relative(directory, classInfo.filePath),
          rule: 'forward-ref-usage',
          category: 'architecture',
          severity: 'warning',
          message: `${className} uses forwardRef(), which typically indicates a circular dependency.`,
          help: 'Refactor to break the circular dependency. Consider introducing an intermediary service or using an event-based pattern.',
          line: ref.line,
          column: 1,
          source: 'ng-xray',
          stability: 'experimental',
        });
      }
    } catch { /* read errors */ }
  }

  const cycles = detectCycles(injectionGraph);
  const reportedCycles = new Set<string>();

  for (const cycle of cycles) {
    const key = [...cycle].sort().join('::');
    if (reportedCycles.has(key)) continue;
    reportedCycles.add(key);

    const chainStr = cycle.join(' -> ');
    const firstService = prebuiltClassMap.classes.get(cycle[0]);
    if (!firstService) continue;

    diagnostics.push({
      filePath: path.relative(directory, firstService.filePath),
      rule: 'circular-service-injection',
      category: 'architecture',
      severity: 'error',
      message: `Circular service injection detected: ${chainStr}`,
      help: 'Break the cycle by extracting shared logic into a new service, using an event bus, or restructuring dependencies.',
      line: 1,
      column: 1,
      source: 'ng-xray',
      stability: 'experimental',
    });
  }

  return diagnostics;
};
