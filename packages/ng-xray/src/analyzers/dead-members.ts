import path from 'node:path';
import { readFileSync } from 'node:fs';
import type { Diagnostic } from '../types.js';
import {
  buildProjectClassMap,
  type ClassInfo,
  type ClassMember,
  type ProjectClassMap,
} from '../utils/inheritance-resolver.js';
import {
  buildProjectTemplateMap,
  type ProjectTemplateMap,
} from '../utils/template-parser.js';
import {
  parseSourceFile,
  findThisMemberAccesses,
  hasDynamicMemberAccess,
  findMemberAccessesOnAny,
  countThisMemberAccessesInClass,
  findClassDeclarations,
  getClassName,
} from '../utils/ts-ast-helpers.js';

const FRAMEWORK_METHODS = new Set([
  'transform', 'canActivate', 'canDeactivate', 'canActivateChild', 'canMatch',
  'resolve', 'intercept', 'validate', 'registerOnChange', 'registerOnTouched',
  'writeValue', 'setDisabledState', 'ngOnInit', 'ngOnDestroy', 'ngAfterViewInit',
  'ngAfterContentInit', 'ngOnChanges', 'ngDoCheck', 'ngAfterViewChecked',
  'ngAfterContentChecked', 'constructor',
]);

const FRAMEWORK_DECORATORS = new Set([
  'Input', 'Output', 'ViewChild', 'ViewChildren',
  'ContentChild', 'ContentChildren', 'HostBinding', 'HostListener',
]);

const SIGNAL_INITIALIZERS = new Set([
  'inject', 'input', 'output', 'viewChild', 'viewChildren',
  'contentChild', 'contentChildren', 'model', 'computed', 'signal',
  'toSignal', 'linkedSignal',
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

const isMemberUsedInOwnTs = (
  memberName: string,
  filePath: string,
  className: string,
): boolean => {
  const sourceFile = parseSourceFile(filePath);
  if (!sourceFile) return false;

  if (hasDynamicMemberAccess(sourceFile, memberName)) return true;

  const classNodes = findClassDeclarations(sourceFile);
  const targetClass = classNodes.find((c) => getClassName(c) === className);
  if (!targetClass) return false;

  return countThisMemberAccessesInClass(targetClass, memberName) > 0;
};

const isMemberUsedInTemplate = (
  memberName: string,
  classInfo: ClassInfo,
  templateMap: ProjectTemplateMap,
): boolean => {
  const templateUsage = templateMap.byComponentFile.get(classInfo.filePath);
  if (!templateUsage) return false;

  if (templateUsage.propertyBindings.has(memberName)) return true;
  if (templateUsage.eventBindings.has(memberName)) return true;
  if (templateUsage.interpolations.has(memberName)) return true;

  try {
    const templateContent = readFileSync(templateUsage.templateFilePath, 'utf-8');
    return isIdentifierInAngularExpression(memberName, templateContent);
  } catch {
    return false;
  }
};

const ANGULAR_EXPRESSION_CONTEXTS = [
  /\{\{([\s\S]*?)\}\}/g,
  /\[[^\]]*\]\s*=\s*["']([^"']+)["']/g,
  /\([^\)]*\)\s*=\s*["']([^"']+)["']/g,
  /\*\w+\s*=\s*["']([^"']+)["']/g,
  /@(?:if|for|switch)\s*\(([^)]+)\)/g,
];

const isIdentifierInAngularExpression = (memberName: string, templateContent: string): boolean => {
  const escaped = escapeRegex(memberName);
  const identRegex = memberName.endsWith('$')
    ? new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`)
    : new RegExp(`\\b${escaped}\\b`);

  for (const contextRegex of ANGULAR_EXPRESSION_CONTEXTS) {
    contextRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = contextRegex.exec(templateContent)) !== null) {
      if (identRegex.test(match[1])) return true;
    }
  }

  return false;
};

const escapeRegex = (str: string): string => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isMemberUsedInDescendantTs = (
  memberName: string,
  descendantFilePath: string,
): boolean => {
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
    if (
      !classInfo.isComponent &&
      !classInfo.isDirective &&
      !classInfo.isService &&
      !classInfo.isPipe
    ) continue;

    const descendants = findAllDescendants(className, classMap.classes);

    const isServiceOrPipe = classInfo.isService || classInfo.isPipe;

    for (const member of classInfo.members) {
      if (shouldSkipMember(member)) continue;

      if (isServiceOrPipe && member.visibility === 'public') continue;

      let isUsed = false;

      isUsed = isMemberUsedInOwnTs(member.name, classInfo.filePath, className);
      if (isUsed) continue;

      if (classInfo.isComponent || classInfo.isDirective) {
        isUsed = isMemberUsedInTemplate(member.name, classInfo, templateMap);
        if (isUsed) continue;
      }

      if (member.visibility !== 'private') {
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
        const inheritanceNote = descendants.length > 0
          ? ` Checked ${descendants.length} subclass(es) -- not used in any of them either.`
          : '';

        diagnostics.push({
          filePath: relPath,
          rule: 'unused-class-member',
          category: 'dead-code',
          severity: 'warning',
          message: `${className}.${member.name} (${member.kind}, ${member.visibility}) is never used in code or templates.${inheritanceNote}`,
          help: `Remove this unused ${member.kind} or verify it is accessed dynamically.`,
          line: member.line,
          column: 1,
          source: 'ng-xray',
          stability: 'experimental',
        });
      }
    }
  }

  return diagnostics;
};
