import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { Project, Node, SyntaxKind } from 'ts-morph';
import {
  parseTemplate as angularParseTemplate,
  TmplAstBoundAttribute,
  TmplAstElement,
  TmplAstTemplate,
  TmplAstForLoopBlock,
  TmplAstForLoopBlockEmpty,
  TmplAstIfBlock,
  TmplAstIfBlockBranch,
  TmplAstSwitchBlock,
  TmplAstSwitchBlockCase,
  TmplAstDeferredBlock,
  TmplAstDeferredBlockPlaceholder,
  TmplAstDeferredBlockError,
  TmplAstDeferredBlockLoading,
  type TmplAstNode,
} from '@angular/compiler';
import type { Diagnostic } from '../types.js';
import { logger } from '../utils/logger.js';
import { walkFiles } from '../utils/walk.js';

const BYPASS_METHODS = new Set([
  'bypassSecurityTrustHtml',
  'bypassSecurityTrustScript',
  'bypassSecurityTrustResourceUrl',
  'bypassSecurityTrustStyle',
  'bypassSecurityTrustUrl',
]);

const SECRET_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /sk-proj-[A-Za-z0-9]/, label: 'OpenAI API key (sk-proj-)' },
  { pattern: /(?<![A-Za-z0-9_-])sk-[A-Za-z0-9]{20,}/, label: 'OpenAI API key (sk-)' },
  { pattern: /Bearer\s+eyJ[A-Za-z0-9]/, label: 'Hardcoded Bearer JWT token' },
  { pattern: /AKIA[A-Z0-9]{16}/, label: 'AWS access key' },
  {
    pattern: /(?:apiKey|api_key|secret|token|password)\s*[:=]\s*['"][^'"]{10,}['"]/i,
    label: 'Hardcoded secret in variable assignment',
  },
];

const checkBypassSecurityTrust = (
  relPath: string,
  content: string,
  morphProject: Project,
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const sourceFile = morphProject.createSourceFile(relPath, content, { overwrite: true });

  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (!Node.isPropertyAccessExpression(expr)) continue;
    const methodName = expr.getName();
    if (!BYPASS_METHODS.has(methodName)) continue;

    diagnostics.push({
      filePath: relPath,
      rule: 'bypass-security-trust',
      category: 'security',
      severity: 'error',
      message: `Calls ${methodName}(), bypassing Angular's built-in sanitization.`,
      help: "Avoid bypassing Angular's built-in sanitization. Use Angular's DomSanitizer safely or restructure to avoid raw HTML injection.",
      line: call.getStartLineNumber(),
      column: call.getStart() - call.getStartLinePos() + 1,
      source: 'ng-xray',
      stability: 'experimental',
    });
  }

  return diagnostics;
};

const checkEvalUsage = (
  relPath: string,
  content: string,
  morphProject: Project,
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const sourceFile = morphProject.createSourceFile(relPath, content, { overwrite: true });

  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (Node.isIdentifier(expr) && expr.getText() === 'eval') {
      diagnostics.push({
        filePath: relPath,
        rule: 'eval-usage',
        category: 'security',
        severity: 'error',
        message: 'Uses eval() which can execute arbitrary code.',
        help: 'Remove eval() and new Function() calls. Use safer alternatives like JSON.parse() for data or template-driven approaches for dynamic behavior.',
        line: call.getStartLineNumber(),
        column: call.getStart() - call.getStartLinePos() + 1,
        source: 'ng-xray',
        stability: 'experimental',
      });
    }
  }

  for (const newExpr of sourceFile.getDescendantsOfKind(SyntaxKind.NewExpression)) {
    const expr = newExpr.getExpression();
    if (Node.isIdentifier(expr) && expr.getText() === 'Function') {
      diagnostics.push({
        filePath: relPath,
        rule: 'eval-usage',
        category: 'security',
        severity: 'error',
        message: 'Uses new Function() which can execute arbitrary code.',
        help: 'Remove eval() and new Function() calls. Use safer alternatives like JSON.parse() for data or template-driven approaches for dynamic behavior.',
        line: newExpr.getStartLineNumber(),
        column: newExpr.getStart() - newExpr.getStartLinePos() + 1,
        source: 'ng-xray',
        stability: 'experimental',
      });
    }
  }

  return diagnostics;
};

const isPlaceholderFile = (filePath: string): boolean => {
  const base = path.basename(filePath);
  return base.includes('.mock.') ||
    base.includes('.stub.') ||
    base.includes('.fake.') ||
    base.startsWith('environment');
};

const checkHardcodedSecrets = (
  relPath: string,
  content: string,
  morphProject: Project,
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const sourceFile = morphProject.createSourceFile(relPath, content, { overwrite: true });

  const stringNodes = [
    ...sourceFile.getDescendantsOfKind(SyntaxKind.StringLiteral),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral),
  ];

  for (const node of stringNodes) {
    const text = node.getText();
    for (const { pattern, label } of SECRET_PATTERNS) {
      if (pattern.test(text)) {
        diagnostics.push({
          filePath: relPath,
          rule: 'hardcoded-secret',
          category: 'security',
          severity: 'error',
          message: `Possible hardcoded secret detected: ${label}.`,
          help: 'Move secrets to environment variables or a secure vault. Never hardcode API keys, tokens, or passwords in source code.',
          line: node.getStartLineNumber(),
          column: node.getStart() - node.getStartLinePos() + 1,
          source: 'ng-xray',
          stability: 'experimental',
        });
        break;
      }
    }
  }

  return diagnostics;
};

const visitTemplateNodes = (
  nodes: TmplAstNode[],
  visitor: (node: TmplAstNode) => void,
): void => {
  for (const node of nodes) {
    visitor(node);
    if (node instanceof TmplAstElement || node instanceof TmplAstTemplate) {
      visitTemplateNodes(node.children, visitor);
    } else if (node instanceof TmplAstForLoopBlock) {
      visitTemplateNodes(node.children, visitor);
      if (node.empty) visitTemplateNodes([node.empty], visitor);
    } else if (node instanceof TmplAstForLoopBlockEmpty) {
      visitTemplateNodes(node.children, visitor);
    } else if (node instanceof TmplAstIfBlock) {
      for (const branch of node.branches) visitTemplateNodes([branch], visitor);
    } else if (node instanceof TmplAstIfBlockBranch) {
      visitTemplateNodes(node.children, visitor);
    } else if (node instanceof TmplAstSwitchBlock) {
      for (const c of node.cases) visitTemplateNodes([c], visitor);
    } else if (node instanceof TmplAstSwitchBlockCase) {
      visitTemplateNodes(node.children, visitor);
    } else if (node instanceof TmplAstDeferredBlock) {
      visitTemplateNodes(node.children, visitor);
      if (node.placeholder) visitTemplateNodes([node.placeholder], visitor);
      if (node.error) visitTemplateNodes([node.error], visitor);
      if (node.loading) visitTemplateNodes([node.loading], visitor);
    } else if (node instanceof TmplAstDeferredBlockPlaceholder ||
               node instanceof TmplAstDeferredBlockError ||
               node instanceof TmplAstDeferredBlockLoading) {
      visitTemplateNodes(node.children, visitor);
    }
  }
};

const checkInnerHtmlBinding = (relPath: string, content: string): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];

  try {
    const parsed = angularParseTemplate(content, relPath);

    visitTemplateNodes(parsed.nodes, (node) => {
      if (node instanceof TmplAstElement) {
        for (const attr of node.inputs) {
          if (attr instanceof TmplAstBoundAttribute && attr.name === 'innerHTML') {
            diagnostics.push({
              filePath: relPath,
              rule: 'innerhtml-binding',
              category: 'security',
              severity: 'warning',
              message: 'Template uses [innerHTML] binding which can expose the app to XSS.',
              help: 'Using [innerHTML] can expose your app to XSS attacks. Sanitize content through DomSanitizer or use Angular\'s built-in text interpolation instead.',
              line: attr.sourceSpan.start.line + 1,
              column: attr.sourceSpan.start.col + 1,
              source: 'ng-xray',
              stability: 'experimental',
            });
          }
        }
      }
    });
  } catch {
    // Fall back to simple string search for non-parseable templates
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const col = lines[i].indexOf('[innerHTML]');
      if (col !== -1) {
        diagnostics.push({
          filePath: relPath,
          rule: 'innerhtml-binding',
          category: 'security',
          severity: 'warning',
          message: 'Template uses [innerHTML] binding which can expose the app to XSS.',
          help: 'Using [innerHTML] can expose your app to XSS attacks. Sanitize content through DomSanitizer or use Angular\'s built-in text interpolation instead.',
          line: i + 1,
          column: col + 1,
          source: 'ng-xray',
          stability: 'experimental',
        });
      }
    }
  }

  return diagnostics;
};

export const runSecurityAnalyzer = async (directory: string): Promise<Diagnostic[]> => {
  const srcDir = path.join(directory, 'src');
  const targetDir = existsSync(srcDir) ? srcDir : directory;
  const tsFiles = walkFiles(targetDir, ['.ts']);
  const htmlFiles = walkFiles(targetDir, ['.html']);
  const diagnostics: Diagnostic[] = [];
  const morphProject = new Project({ useInMemoryFileSystem: true });

  for (const filePath of tsFiles) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const relPath = path.relative(directory, filePath);

      diagnostics.push(...checkBypassSecurityTrust(relPath, content, morphProject));
      diagnostics.push(...checkEvalUsage(relPath, content, morphProject));
      if (!isPlaceholderFile(filePath)) {
        diagnostics.push(...checkHardcodedSecrets(relPath, content, morphProject));
      }
    } catch (error) {
      logger.error(`Security analyzer: failed to read ${filePath} — ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const filePath of htmlFiles) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const relPath = path.relative(directory, filePath);
      diagnostics.push(...checkInnerHtmlBinding(relPath, content));
    } catch (error) {
      logger.error(`Security analyzer: failed to read ${filePath} — ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return diagnostics;
};
