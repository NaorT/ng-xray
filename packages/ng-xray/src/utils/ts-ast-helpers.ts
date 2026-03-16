import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { Project, Node, SyntaxKind, Scope, createWrappedNode } from 'ts-morph';
import type { SourceFile as MorphSourceFile, ClassDeclaration as MorphClassDeclaration, PropertyDeclaration as MorphPropertyDeclaration, Decorator as MorphDecorator } from 'ts-morph';

const project = new Project({ useInMemoryFileSystem: true });
const morphCache = new WeakMap<ts.SourceFile, MorphSourceFile>();

const getMorphSourceFile = (sourceFile: ts.SourceFile): MorphSourceFile => {
  const cached = morphCache.get(sourceFile);
  if (cached) return cached;
  const morphSf = project.createSourceFile(
    sourceFile.fileName,
    sourceFile.getFullText(),
    { overwrite: true },
  );
  morphCache.set(sourceFile, morphSf);
  return morphSf;
};

const getMorphClass = (
  classNode: ts.ClassDeclaration,
  sourceFile?: ts.SourceFile,
): MorphClassDeclaration | undefined => {
  const sf = sourceFile ?? classNode.getSourceFile();
  const morphSf = getMorphSourceFile(sf);
  const classes = morphSf.getDescendantsOfKind(SyntaxKind.ClassDeclaration);
  const name = classNode.name?.text;
  if (name) return classes.find(c => c.getName() === name);
  return classes.find(c => c.getStart() === classNode.getStart());
};

export const parseSourceFile = (filePath: string): ts.SourceFile | null => {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const morphSf = project.createSourceFile(filePath, content, { overwrite: true });
    morphCache.set(morphSf.compilerNode, morphSf);
    return morphSf.compilerNode;
  } catch {
    return null;
  }
};

export const parseSourceFileFromContent = (filePath: string, content: string): ts.SourceFile => {
  const morphSf = project.createSourceFile(filePath, content, { overwrite: true });
  morphCache.set(morphSf.compilerNode, morphSf);
  return morphSf.compilerNode;
};

export const findClassDeclarations = (sourceFile: ts.SourceFile): ts.ClassDeclaration[] => {
  const morphSf = getMorphSourceFile(sourceFile);
  return morphSf.getDescendantsOfKind(SyntaxKind.ClassDeclaration)
    .map(c => c.compilerNode);
};

export const getClassName = (node: ts.ClassDeclaration): string | null =>
  node.name?.text ?? null;

export const getClassHeritage = (node: ts.ClassDeclaration): string | null => {
  const morphClass = getMorphClass(node);
  if (!morphClass) return null;
  const heritage = morphClass.getExtends();
  if (!heritage) return null;
  const expr = heritage.getExpression();
  if (Node.isIdentifier(expr)) return expr.getText();
  return null;
};

export type MemberKind = 'property' | 'method' | 'getter' | 'setter';
export type Visibility = 'public' | 'protected' | 'private';

export interface AstClassMember {
  name: string;
  kind: MemberKind;
  visibility: Visibility;
  line: number;
  isStatic: boolean;
  isOverride: boolean;
  decoratorNames: string[];
  initializerCallName: string | null;
}

const scopeToVisibility = (scope: Scope | undefined): Visibility => {
  if (scope === Scope.Private) return 'private';
  if (scope === Scope.Protected) return 'protected';
  return 'public';
};

const getInitializerCallName = (prop: MorphPropertyDeclaration): string | null => {
  const initializer = prop.getInitializer();
  if (!initializer || !Node.isCallExpression(initializer)) return null;
  const expr = initializer.getExpression();
  if (Node.isIdentifier(expr)) return expr.getText();
  if (Node.isPropertyAccessExpression(expr)) return expr.getName();
  return null;
};

const getDecoratorNames = (decorators: MorphDecorator[]): string[] =>
  decorators.map(d => d.getName()).filter(Boolean);

export const getDecorators = (node: ts.Node): string[] => {
  const wrapped = createWrappedNode(node, { sourceFile: node.getSourceFile() });
  if (Node.isClassDeclaration(wrapped)) return getDecoratorNames(wrapped.getDecorators());
  if (Node.isMethodDeclaration(wrapped)) return getDecoratorNames(wrapped.getDecorators());
  if (Node.isPropertyDeclaration(wrapped)) return getDecoratorNames(wrapped.getDecorators());
  const getter = wrapped.asKind(SyntaxKind.GetAccessor);
  if (getter) return getDecoratorNames(getter.getDecorators());
  const setter = wrapped.asKind(SyntaxKind.SetAccessor);
  if (setter) return getDecoratorNames(setter.getDecorators());
  const param = wrapped.asKind(SyntaxKind.Parameter);
  if (param) return getDecoratorNames(param.getDecorators());
  return [];
};

export const hasDecorator = (node: ts.Node, name: string): boolean =>
  getDecorators(node).includes(name);

export const getClassMembers = (classNode: ts.ClassDeclaration, sourceFile: ts.SourceFile): AstClassMember[] => {
  const morphClass = getMorphClass(classNode, sourceFile);
  if (!morphClass) return [];

  const members: AstClassMember[] = [];

  for (const member of morphClass.getMembers()) {
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
        decoratorNames: getDecoratorNames(member.getDecorators()),
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
        decoratorNames: getDecoratorNames(member.getDecorators()),
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
        decoratorNames: getDecoratorNames(getter.getDecorators()),
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
        decoratorNames: getDecoratorNames(setter.getDecorators()),
        initializerCallName: null,
      });
    }
  }

  return members;
};

export const getDecoratorSelector = (classNode: ts.ClassDeclaration): string | null => {
  const morphClass = getMorphClass(classNode);
  if (!morphClass) return null;

  for (const decorator of morphClass.getDecorators()) {
    const args = decorator.getArguments();
    if (args.length === 0) continue;
    const firstArg = args[0];
    if (!Node.isObjectLiteralExpression(firstArg)) continue;

    const selectorProp = firstArg.getProperty('selector');
    if (!selectorProp || !Node.isPropertyAssignment(selectorProp)) continue;

    const initializer = selectorProp.getInitializer();
    if (initializer && Node.isStringLiteral(initializer)) {
      return initializer.getLiteralValue();
    }
  }
  return null;
};

export const findThisMemberAccesses = (sourceFile: ts.SourceFile, memberName: string): number => {
  const morphSf = getMorphSourceFile(sourceFile);
  return morphSf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
    .filter(node =>
      node.getExpression().getKind() === SyntaxKind.ThisKeyword &&
      node.getName() === memberName
    ).length;
};

export const hasDynamicMemberAccess = (sourceFile: ts.SourceFile, memberName: string): boolean => {
  const morphSf = getMorphSourceFile(sourceFile);
  return morphSf.getDescendantsOfKind(SyntaxKind.ElementAccessExpression)
    .some(node => {
      if (node.getExpression().getKind() !== SyntaxKind.ThisKeyword) return false;
      const arg = node.getArgumentExpression();
      return arg !== undefined && Node.isStringLiteral(arg) && arg.getLiteralValue() === memberName;
    });
};

export const findMemberAccessesOnAny = (sourceFile: ts.SourceFile, memberName: string): number => {
  const morphSf = getMorphSourceFile(sourceFile);
  return morphSf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
    .filter(node => node.getName() === memberName).length;
};

export const countThisMemberAccessesInClass = (
  classNode: ts.ClassDeclaration,
  memberName: string,
): number => {
  const morphClass = getMorphClass(classNode);
  if (!morphClass) return 0;

  let count = 0;
  for (const member of morphClass.getMembers()) {
    count += member.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
      .filter(node =>
        node.getExpression().getKind() === SyntaxKind.ThisKeyword &&
        node.getName() === memberName
      ).length;
  }
  return count;
};
