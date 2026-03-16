import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Project, Node, SyntaxKind, Scope } from 'ts-morph';
import type { PropertyDeclaration as MorphPropertyDeclaration, Decorator as MorphDecorator } from 'ts-morph';
import { walkFiles } from './walk.js';

export interface ClassMember {
  name: string;
  kind: 'property' | 'method' | 'getter' | 'setter';
  visibility: 'public' | 'protected' | 'private';
  line: number;
  isStatic: boolean;
  isOverride: boolean;
  decoratorNames: string[];
  initializerCallName: string | null;
}

export interface ClassInfo {
  name: string;
  filePath: string;
  extendsClass: string | null;
  members: ClassMember[];
  decorators: string[];
  selector: string | null;
  isComponent: boolean;
  isDirective: boolean;
  isPipe: boolean;
  isService: boolean;
  isGuard: boolean;
  isInterceptor: boolean;
  isResolver: boolean;
}

export interface InheritanceChain {
  classInfo: ClassInfo;
  subclasses: ClassInfo[];
  allMembersInChain: Map<string, ClassInfo[]>;
}

export interface ProjectClassMap {
  classes: Map<string, ClassInfo>;
  inheritanceChains: Map<string, InheritanceChain>;
}

const scopeToVisibility = (scope: Scope | undefined): 'public' | 'protected' | 'private' => {
  if (scope === Scope.Private) return 'private';
  if (scope === Scope.Protected) return 'protected';
  return 'public';
};

const decoratorNames = (decorators: MorphDecorator[]): string[] =>
  decorators.map(d => d.getName()).filter(Boolean);

const getInitializerCallName = (prop: MorphPropertyDeclaration): string | null => {
  const initializer = prop.getInitializer();
  if (!initializer || !Node.isCallExpression(initializer)) return null;
  const expr = initializer.getExpression();
  if (Node.isIdentifier(expr)) return expr.getText();
  if (Node.isPropertyAccessExpression(expr)) return expr.getName();
  return null;
};

const parseClassesFromFile = (filePath: string, content: string, morphProject: Project): ClassInfo[] => {
  const sourceFile = morphProject.createSourceFile(filePath, content, { overwrite: true });
  const classes: ClassInfo[] = [];

  for (const classDecl of sourceFile.getClasses()) {
    const name = classDecl.getName();
    if (!name) continue;

    const classDecorators = decoratorNames(classDecl.getDecorators());

    let selector: string | null = null;
    for (const dec of classDecl.getDecorators()) {
      const args = dec.getArguments();
      if (args.length === 0) continue;
      const firstArg = args[0];
      if (!Node.isObjectLiteralExpression(firstArg)) continue;
      const selectorProp = firstArg.getProperty('selector');
      if (!selectorProp || !Node.isPropertyAssignment(selectorProp)) continue;
      const init = selectorProp.getInitializer();
      if (init && Node.isStringLiteral(init)) {
        selector = init.getLiteralValue();
        break;
      }
    }

    let extendsClass: string | null = null;
    const heritage = classDecl.getExtends();
    if (heritage) {
      const expr = heritage.getExpression();
      if (Node.isIdentifier(expr)) extendsClass = expr.getText();
    }

    const members: ClassMember[] = [];
    for (const member of classDecl.getMembers()) {
      if (member.getKind() === SyntaxKind.Constructor || member.getKind() === SyntaxKind.ClassStaticBlockDeclaration) continue;

      if (Node.isPropertyDeclaration(member)) {
        if (!Node.isIdentifier(member.getNameNode())) continue;
        members.push({
          name: member.getName(),
          kind: 'property',
          visibility: scopeToVisibility(member.getScope()),
          line: member.getStartLineNumber(),
          isStatic: member.isStatic(),
          isOverride: member.hasOverrideKeyword(),
          decoratorNames: decoratorNames(member.getDecorators()),
          initializerCallName: getInitializerCallName(member),
        });
        continue;
      }

      if (Node.isMethodDeclaration(member)) {
        if (!Node.isIdentifier(member.getNameNode())) continue;
        members.push({
          name: member.getName(),
          kind: 'method',
          visibility: scopeToVisibility(member.getScope()),
          line: member.getStartLineNumber(),
          isStatic: member.isStatic(),
          isOverride: member.hasOverrideKeyword(),
          decoratorNames: decoratorNames(member.getDecorators()),
          initializerCallName: null,
        });
        continue;
      }

      const getter = member.asKind(SyntaxKind.GetAccessor);
      if (getter) {
        if (!Node.isIdentifier(getter.getNameNode())) continue;
        members.push({
          name: getter.getName(),
          kind: 'getter',
          visibility: scopeToVisibility(getter.getScope()),
          line: getter.getStartLineNumber(),
          isStatic: getter.isStatic(),
          isOverride: getter.hasModifier(SyntaxKind.OverrideKeyword),
          decoratorNames: decoratorNames(getter.getDecorators()),
          initializerCallName: null,
        });
        continue;
      }

      const setter = member.asKind(SyntaxKind.SetAccessor);
      if (setter) {
        if (!Node.isIdentifier(setter.getNameNode())) continue;
        members.push({
          name: setter.getName(),
          kind: 'setter',
          visibility: scopeToVisibility(setter.getScope()),
          line: setter.getStartLineNumber(),
          isStatic: setter.isStatic(),
          isOverride: setter.hasModifier(SyntaxKind.OverrideKeyword),
          decoratorNames: decoratorNames(setter.getDecorators()),
          initializerCallName: null,
        });
      }
    }

    classes.push({
      name,
      filePath,
      extendsClass,
      members,
      decorators: classDecorators,
      selector,
      isComponent: classDecorators.includes('Component'),
      isDirective: classDecorators.includes('Directive'),
      isPipe: classDecorators.includes('Pipe'),
      isService: classDecorators.includes('Injectable'),
      isGuard: filePath.includes('.guard.'),
      isInterceptor: filePath.includes('.interceptor.'),
      isResolver: filePath.includes('.resolver.'),
    });
  }

  return classes;
};

const findAllSubclasses = (className: string, classMap: Map<string, ClassInfo>): ClassInfo[] => {
  const result: ClassInfo[] = [];
  for (const [, info] of classMap) {
    if (info.extendsClass === className) {
      result.push(info);
      result.push(...findAllSubclasses(info.name, classMap));
    }
  }
  return result;
};

const buildInheritanceChain = (
  className: string,
  classMap: Map<string, ClassInfo>,
): InheritanceChain | null => {
  const classInfo = classMap.get(className);
  if (!classInfo) return null;

  const subclasses: ClassInfo[] = [];
  for (const [, info] of classMap) {
    if (info.extendsClass === className) {
      subclasses.push(info);
    }
  }

  const allMembersInChain = new Map<string, ClassInfo[]>();

  const collectMembers = (cls: ClassInfo) => {
    for (const member of cls.members) {
      const existing = allMembersInChain.get(member.name) ?? [];
      existing.push(cls);
      allMembersInChain.set(member.name, existing);
    }
  };

  collectMembers(classInfo);
  for (const sub of subclasses) {
    collectMembers(sub);
    const subSubs = findAllSubclasses(sub.name, classMap);
    for (const ss of subSubs) collectMembers(ss);
  }

  return { classInfo, subclasses, allMembersInChain };
};

export const buildProjectClassMap = (directory: string): ProjectClassMap => {
  const srcDir = existsSync(path.join(directory, 'src')) ? path.join(directory, 'src') : directory;
  const files = walkFiles(srcDir, ['.ts']);

  const morphProject = new Project({ useInMemoryFileSystem: true });
  const classes = new Map<string, ClassInfo>();

  for (const filePath of files) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const parsed = parseClassesFromFile(filePath, content, morphProject);
      for (const cls of parsed) {
        classes.set(cls.name, cls);
      }
    } catch {
      // read errors
    }
  }

  const inheritanceChains = new Map<string, InheritanceChain>();
  for (const [name] of classes) {
    const chain = buildInheritanceChain(name, classes);
    if (chain) inheritanceChains.set(name, chain);
  }

  return { classes, inheritanceChains };
};
