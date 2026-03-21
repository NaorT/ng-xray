import path from "node:path";
import { readFileSync } from "node:fs";
import { logger } from "../utils/logger.js";
import {
  parseTemplate as angularParseTemplate,
  TmplAstElement,
  TmplAstTemplate,
  TmplAstBoundAttribute,
  TmplAstBoundText,
  TmplAstForLoopBlock,
  TmplAstIfBlock,
  TmplAstSwitchBlock,
  TmplAstDeferredBlock,
  PropertyRead,
  SafePropertyRead,
  ASTWithSource,
  RecursiveAstVisitor,
  ImplicitReceiver,
  type TmplAstNode,
  type AST,
} from "@angular/compiler";
import type { Diagnostic } from "../types.js";
import {
  buildProjectClassMap,
  type ClassInfo,
  type ClassMember,
  type ProjectClassMap,
} from "../utils/inheritance-resolver.js";
import { buildProjectTemplateMap, type ProjectTemplateMap } from "../utils/template-parser.js";
import {
  parseSourceFile,
  findThisMemberAccesses,
  hasDynamicMemberAccess,
  countThisMemberAccessesInClass,
  findClassDeclarations,
  getClassName,
} from "../utils/ts-ast-helpers.js";

const FRAMEWORK_METHODS = new Set([
  "transform",
  "canActivate",
  "canDeactivate",
  "canActivateChild",
  "canMatch",
  "resolve",
  "intercept",
  "validate",
  "registerOnChange",
  "registerOnTouched",
  "writeValue",
  "setDisabledState",
  "ngOnInit",
  "ngOnDestroy",
  "ngAfterViewInit",
  "ngAfterContentInit",
  "ngOnChanges",
  "ngDoCheck",
  "ngAfterViewChecked",
  "ngAfterContentChecked",
  "constructor",
]);

const FRAMEWORK_DECORATORS = new Set([
  "Input",
  "Output",
  "ViewChild",
  "ViewChildren",
  "ContentChild",
  "ContentChildren",
  "HostBinding",
  "HostListener",
]);

const SIGNAL_INITIALIZERS = new Set([
  "inject",
  "input",
  "output",
  "viewChild",
  "viewChildren",
  "contentChild",
  "contentChildren",
  "model",
  "computed",
  "signal",
  "toSignal",
  "linkedSignal",
]);

const shouldSkipMember = (member: ClassMember): boolean => {
  if (FRAMEWORK_METHODS.has(member.name)) return true;
  if (member.isOverride) return true;
  if (member.isStatic) return true;

  for (const dec of member.decoratorNames) {
    if (FRAMEWORK_DECORATORS.has(dec)) return true;
  }

  if (member.initializerCallName && SIGNAL_INITIALIZERS.has(member.initializerCallName)) return true;

  return false;
};

const isMemberUsedInOwnTs = (memberName: string, filePath: string, className: string): boolean => {
  const sourceFile = parseSourceFile(filePath);
  if (!sourceFile) return false;

  if (hasDynamicMemberAccess(sourceFile, memberName)) return true;

  const classNodes = findClassDeclarations(sourceFile);
  const targetClass = classNodes.find((c) => getClassName(c) === className);
  if (!targetClass) return false;

  return countThisMemberAccessesInClass(targetClass, memberName) > 0;
};

const isMemberUsedInTemplate = (memberName: string, classInfo: ClassInfo, templateMap: ProjectTemplateMap): boolean => {
  const templateUsage = templateMap.byComponentFile.get(classInfo.filePath);
  if (!templateUsage) return false;

  if (templateUsage.propertyBindings.has(memberName)) return true;
  if (templateUsage.eventBindings.has(memberName)) return true;
  if (templateUsage.interpolations.has(memberName)) return true;

  try {
    const templateContent = readFileSync(templateUsage.templateFilePath, "utf-8");
    return isIdentifierInAngularExpression(memberName, templateContent);
  } catch (error) {
    logger.error(
      `Dead members: failed to read template ${templateUsage.templateFilePath} — ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
};

class MemberReferenceCollector extends RecursiveAstVisitor {
  readonly identifiers = new Set<string>();

  override visitPropertyRead(ast: PropertyRead, context: unknown): unknown {
    if (ast.receiver instanceof ImplicitReceiver) {
      this.identifiers.add(ast.name);
    }
    return super.visitPropertyRead(ast, context);
  }

  override visitSafePropertyRead(ast: SafePropertyRead, context: unknown): unknown {
    if (ast.receiver instanceof ImplicitReceiver) {
      this.identifiers.add(ast.name);
    }
    return super.visitSafePropertyRead(ast, context);
  }
}

function collectExpressionIdentifiers(ast: AST | ASTWithSource): Set<string> {
  const collector = new MemberReferenceCollector();
  const expr = ast instanceof ASTWithSource ? ast.ast : ast;
  expr.visit(collector);
  return collector.identifiers;
}

function collectAllTemplateIdentifiers(nodes: TmplAstNode[], result: Set<string>): void {
  for (const node of nodes) {
    if (node instanceof TmplAstElement) {
      for (const input of node.inputs) {
        for (const id of collectExpressionIdentifiers(input.value)) result.add(id);
      }
      for (const output of node.outputs) {
        for (const id of collectExpressionIdentifiers(output.handler)) result.add(id);
      }
      collectAllTemplateIdentifiers(node.children, result);
    } else if (node instanceof TmplAstTemplate) {
      for (const attr of node.templateAttrs) {
        if (attr instanceof TmplAstBoundAttribute) {
          for (const id of collectExpressionIdentifiers(attr.value)) result.add(id);
        }
      }
      for (const input of node.inputs) {
        for (const id of collectExpressionIdentifiers(input.value)) result.add(id);
      }
      collectAllTemplateIdentifiers(node.children, result);
    } else if (node instanceof TmplAstBoundText) {
      for (const id of collectExpressionIdentifiers(node.value)) result.add(id);
    } else if (node instanceof TmplAstIfBlock) {
      for (const branch of node.branches) {
        if (branch.expression) {
          for (const id of collectExpressionIdentifiers(branch.expression)) result.add(id);
        }
        collectAllTemplateIdentifiers(branch.children, result);
      }
    } else if (node instanceof TmplAstForLoopBlock) {
      if (node.expression) {
        for (const id of collectExpressionIdentifiers(node.expression)) result.add(id);
      }
      if (node.trackBy) {
        for (const id of collectExpressionIdentifiers(node.trackBy)) result.add(id);
      }
      collectAllTemplateIdentifiers(node.children, result);
      if (node.empty) collectAllTemplateIdentifiers(node.empty.children, result);
    } else if (node instanceof TmplAstSwitchBlock) {
      if (node.expression) {
        for (const id of collectExpressionIdentifiers(node.expression)) result.add(id);
      }
      for (const switchCase of node.cases) {
        if (switchCase.expression) {
          for (const id of collectExpressionIdentifiers(switchCase.expression)) result.add(id);
        }
        collectAllTemplateIdentifiers(switchCase.children, result);
      }
    } else if (node instanceof TmplAstDeferredBlock) {
      collectAllTemplateIdentifiers(node.children, result);
      if (node.placeholder) collectAllTemplateIdentifiers(node.placeholder.children, result);
      if (node.loading) collectAllTemplateIdentifiers(node.loading.children, result);
      if (node.error) collectAllTemplateIdentifiers(node.error.children, result);
    } else if ("children" in node && Array.isArray((node as Record<string, unknown>).children)) {
      collectAllTemplateIdentifiers((node as { children: TmplAstNode[] }).children, result);
    }
  }
}

const isIdentifierInAngularExpression = (memberName: string, templateContent: string): boolean => {
  try {
    const parsed = angularParseTemplate(templateContent, "");
    if (parsed.errors && parsed.errors.length > 0) return false;
    const identifiers = new Set<string>();
    collectAllTemplateIdentifiers(parsed.nodes, identifiers);
    return identifiers.has(memberName);
  } catch {
    return false;
  }
};

const isMemberUsedInDescendantTs = (memberName: string, descendantFilePath: string): boolean => {
  const sourceFile = parseSourceFile(descendantFilePath);
  if (!sourceFile) return false;

  return findThisMemberAccesses(sourceFile, memberName) > 0;
};

const findAllDescendants = (className: string, classMap: Map<string, ClassInfo>): ClassInfo[] => {
  const descendants: ClassInfo[] = [];
  for (const [, info] of classMap) {
    if (info.extendsClass === className) {
      descendants.push(info);
      descendants.push(...findAllDescendants(info.name, classMap));
    }
  }
  return descendants;
};

export const runDeadMembersAnalyzer = async (
  directory: string,
  prebuiltClassMap?: ProjectClassMap,
  prebuiltTemplateMap?: ProjectTemplateMap,
): Promise<Diagnostic[]> => {
  const classMap = prebuiltClassMap ?? buildProjectClassMap(directory);
  const templateMap = prebuiltTemplateMap ?? buildProjectTemplateMap(directory);
  const diagnostics: Diagnostic[] = [];

  for (const [className, classInfo] of classMap.classes) {
    if (!classInfo.isComponent && !classInfo.isDirective && !classInfo.isService && !classInfo.isPipe) continue;

    const descendants = findAllDescendants(className, classMap.classes);

    const isServiceOrPipe = classInfo.isService || classInfo.isPipe;

    for (const member of classInfo.members) {
      if (shouldSkipMember(member)) continue;

      if (isServiceOrPipe && member.visibility === "public") continue;

      let isUsed = false;

      isUsed = isMemberUsedInOwnTs(member.name, classInfo.filePath, className);
      if (isUsed) continue;

      if (classInfo.isComponent || classInfo.isDirective) {
        isUsed = isMemberUsedInTemplate(member.name, classInfo, templateMap);
        if (isUsed) continue;
      }

      if (member.visibility !== "private") {
        for (const descendant of descendants) {
          isUsed = isMemberUsedInDescendantTs(member.name, descendant.filePath);
          if (isUsed) break;

          if (descendant.isComponent || descendant.isDirective) {
            isUsed = isMemberUsedInTemplate(member.name, descendant, templateMap);
            if (isUsed) break;
          }
        }
      }

      if (!isUsed) {
        const relPath = path.relative(directory, classInfo.filePath);
        const inheritanceNote =
          descendants.length > 0
            ? ` Checked ${descendants.length} subclass(es) -- not used in any of them either.`
            : "";

        diagnostics.push({
          filePath: relPath,
          rule: "unused-class-member",
          category: "dead-code",
          severity: "warning",
          message: `${className}.${member.name} (${member.kind}, ${member.visibility}) is never used in code or templates.${inheritanceNote}`,
          help: `Remove this unused ${member.kind} or verify it is accessed dynamically.`,
          line: member.line,
          column: 1,
          source: "ng-xray",
          stability: "experimental",
        });
      }
    }
  }

  return diagnostics;
};
