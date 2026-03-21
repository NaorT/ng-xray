import ts from "typescript";
import { readFileSync } from "node:fs";
import { Project, Node, SyntaxKind } from "ts-morph";
import type {
  SourceFile as MorphSourceFile,
  ClassDeclaration as MorphClassDeclaration,
} from "ts-morph";

const project = new Project({ useInMemoryFileSystem: true });
const morphCache = new WeakMap<ts.SourceFile, MorphSourceFile>();

const getMorphSourceFile = (sourceFile: ts.SourceFile): MorphSourceFile => {
  const cached = morphCache.get(sourceFile);
  if (cached) return cached;
  const morphSf = project.createSourceFile(sourceFile.fileName, sourceFile.getFullText(), { overwrite: true });
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
  if (name) return classes.find((c) => c.getName() === name);
  return classes.find((c) => c.getStart() === classNode.getStart());
};

export const parseSourceFile = (filePath: string): ts.SourceFile | null => {
  try {
    const content = readFileSync(filePath, "utf-8");
    const morphSf = project.createSourceFile(filePath, content, { overwrite: true });
    morphCache.set(morphSf.compilerNode, morphSf);
    return morphSf.compilerNode;
  } catch {
    return null;
  }
};

export const findClassDeclarations = (sourceFile: ts.SourceFile): ts.ClassDeclaration[] => {
  const morphSf = getMorphSourceFile(sourceFile);
  return morphSf.getDescendantsOfKind(SyntaxKind.ClassDeclaration).map((c) => c.compilerNode);
};

export const getClassName = (node: ts.ClassDeclaration): string | null => node.name?.text ?? null;

export const findThisMemberAccesses = (sourceFile: ts.SourceFile, memberName: string): number => {
  const morphSf = getMorphSourceFile(sourceFile);
  return morphSf
    .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
    .filter((node) => node.getExpression().getKind() === SyntaxKind.ThisKeyword && node.getName() === memberName)
    .length;
};

export const hasDynamicMemberAccess = (sourceFile: ts.SourceFile, memberName: string): boolean => {
  const morphSf = getMorphSourceFile(sourceFile);
  return morphSf.getDescendantsOfKind(SyntaxKind.ElementAccessExpression).some((node) => {
    if (node.getExpression().getKind() !== SyntaxKind.ThisKeyword) return false;
    const arg = node.getArgumentExpression();
    return arg !== undefined && Node.isStringLiteral(arg) && arg.getLiteralValue() === memberName;
  });
};

export const countThisMemberAccessesInClass = (classNode: ts.ClassDeclaration, memberName: string): number => {
  const morphClass = getMorphClass(classNode);
  if (!morphClass) return 0;

  let count = 0;
  for (const member of morphClass.getMembers()) {
    count += member
      .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
      .filter(
        (node) => node.getExpression().getKind() === SyntaxKind.ThisKeyword && node.getName() === memberName,
      ).length;
  }
  return count;
};
