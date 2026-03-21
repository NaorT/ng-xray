import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { logger } from "./logger.js";
import {
  parseTemplate as angularParseTemplate,
  TmplAstElement,
  TmplAstTemplate,
  TmplAstBoundAttribute,
  TmplAstBoundText,
  TmplAstTextAttribute,
  TmplAstForLoopBlock,
  TmplAstIfBlock,
  TmplAstSwitchBlock,
  TmplAstDeferredBlock,
  BindingPipe,
  PropertyRead,
  SafePropertyRead,
  ASTWithSource,
  RecursiveAstVisitor,
  ImplicitReceiver,
  type TmplAstNode,
  type AST,
} from "@angular/compiler";
import { walkFiles } from "./walk.js";

export interface TemplateUsage {
  componentFilePath: string;
  templateFilePath: string;
  selectors: Set<string>;
  pipes: Set<string>;
  propertyBindings: Set<string>;
  eventBindings: Set<string>;
  interpolations: Set<string>;
  templateRefs: Set<string>;
}

export interface ProjectTemplateMap {
  byComponentFile: Map<string, TemplateUsage>;
  allUsedSelectors: Set<string>;
  allUsedPipes: Set<string>;
  allUsedProperties: Set<string>;
}

// ---------------------------------------------------------------------------
// Expression AST visitor — collects identifiers and pipes from expressions
// ---------------------------------------------------------------------------

class ExpressionCollector extends RecursiveAstVisitor {
  readonly identifiers = new Set<string>();
  readonly pipes = new Set<string>();

  override visitPropertyRead(ast: PropertyRead, context: unknown): unknown {
    if (ast.receiver instanceof ImplicitReceiver && !ANGULAR_KEYWORDS.has(ast.name)) {
      this.identifiers.add(ast.name);
    }
    return super.visitPropertyRead(ast, context);
  }

  override visitSafePropertyRead(ast: SafePropertyRead, context: unknown): unknown {
    if (ast.receiver instanceof ImplicitReceiver && !ANGULAR_KEYWORDS.has(ast.name)) {
      this.identifiers.add(ast.name);
    }
    return super.visitSafePropertyRead(ast, context);
  }

  override visitPipe(ast: BindingPipe, context: unknown): unknown {
    if (!BUILTIN_PIPES.has(ast.name)) {
      this.pipes.add(ast.name);
    }
    return super.visitPipe(ast, context);
  }
}

function collectExpression(ast: AST | ASTWithSource): ExpressionCollector {
  const collector = new ExpressionCollector();
  const expr = ast instanceof ASTWithSource ? ast.ast : ast;
  expr.visit(collector);
  return collector;
}

// ---------------------------------------------------------------------------
// Template AST walker
// ---------------------------------------------------------------------------

interface CollectionContext {
  selectors: Set<string>;
  pipes: Set<string>;
  propertyBindings: Set<string>;
  eventBindings: Set<string>;
  interpolations: Set<string>;
  templateRefs: Set<string>;
}

function isAttributeSelector(name: string): boolean {
  return name.startsWith("app") || name.startsWith("sl") || name.startsWith("ngx");
}

function mergeExpressionInto(
  source: AST | ASTWithSource,
  ctx: CollectionContext,
  targets: ("property" | "interpolation" | "event")[],
): void {
  const { identifiers, pipes } = collectExpression(source);
  for (const id of identifiers) {
    if (targets.includes("property")) ctx.propertyBindings.add(id);
    if (targets.includes("interpolation")) ctx.interpolations.add(id);
    if (targets.includes("event")) ctx.eventBindings.add(id);
  }
  for (const p of pipes) ctx.pipes.add(p);
}

function walkTemplateNodes(nodes: TmplAstNode[], ctx: CollectionContext): void {
  for (const node of nodes) {
    if (node instanceof TmplAstElement) {
      const tag = node.name.toLowerCase();
      if (!NATIVE_HTML_TAGS.has(tag) && !tag.startsWith("ng-")) {
        ctx.selectors.add(tag);
      }

      for (const attr of node.attributes) {
        if (isAttributeSelector(attr.name)) ctx.selectors.add(`[${attr.name}]`);
      }

      for (const input of node.inputs) {
        if (isAttributeSelector(input.name)) ctx.selectors.add(`[${input.name}]`);
        mergeExpressionInto(input.value, ctx, ["property"]);
      }

      for (const output of node.outputs) {
        mergeExpressionInto(output.handler, ctx, ["property", "event"]);
      }

      for (const ref of node.references) {
        ctx.templateRefs.add(ref.name);
      }

      walkTemplateNodes(node.children, ctx);
    } else if (node instanceof TmplAstTemplate) {
      for (const attr of node.templateAttrs) {
        if (attr instanceof TmplAstBoundAttribute) {
          if (isAttributeSelector(attr.name)) ctx.selectors.add(`[${attr.name}]`);
          mergeExpressionInto(attr.value, ctx, ["property"]);
        } else if (attr instanceof TmplAstTextAttribute) {
          if (isAttributeSelector(attr.name)) ctx.selectors.add(`[${attr.name}]`);
        }
      }

      for (const input of node.inputs) {
        mergeExpressionInto(input.value, ctx, ["property"]);
      }

      for (const ref of node.references) {
        ctx.templateRefs.add(ref.name);
      }

      walkTemplateNodes(node.children, ctx);
    } else if (node instanceof TmplAstBoundText) {
      mergeExpressionInto(node.value, ctx, ["property", "interpolation"]);
    } else if (node instanceof TmplAstIfBlock) {
      for (const branch of node.branches) {
        if (branch.expression) mergeExpressionInto(branch.expression, ctx, ["property"]);
        walkTemplateNodes(branch.children, ctx);
      }
    } else if (node instanceof TmplAstForLoopBlock) {
      if (node.expression) mergeExpressionInto(node.expression, ctx, ["property"]);
      if (node.trackBy) mergeExpressionInto(node.trackBy, ctx, ["property"]);
      walkTemplateNodes(node.children, ctx);
      if (node.empty) walkTemplateNodes(node.empty.children, ctx);
    } else if (node instanceof TmplAstSwitchBlock) {
      if (node.expression) mergeExpressionInto(node.expression, ctx, ["property"]);
      for (const switchCase of node.cases) {
        if (switchCase.expression) mergeExpressionInto(switchCase.expression, ctx, ["property"]);
        walkTemplateNodes(switchCase.children, ctx);
      }
    } else if (node instanceof TmplAstDeferredBlock) {
      walkTemplateNodes(node.children, ctx);
      if (node.placeholder) walkTemplateNodes(node.placeholder.children, ctx);
      if (node.loading) walkTemplateNodes(node.loading.children, ctx);
      if (node.error) walkTemplateNodes(node.error.children, ctx);
    } else if (hasChildren(node)) {
      walkTemplateNodes((node as { children: TmplAstNode[] }).children, ctx);
    }
  }
}

function hasChildren(node: TmplAstNode): node is TmplAstNode & { children: TmplAstNode[] } {
  return "children" in node && Array.isArray((node as Record<string, unknown>).children);
}

// ---------------------------------------------------------------------------
// Template content extraction (unchanged — parses TS decorator, not HTML)
// ---------------------------------------------------------------------------

const getTemplateContent = (
  componentFilePath: string,
  componentContent: string,
  rootDir?: string,
): { templatePath: string; content: string } | null => {
  const templateUrlMatch = componentContent.match(/templateUrl\s*:\s*['"]([^'"]+)['"]/);
  if (templateUrlMatch) {
    const templateRelPath = templateUrlMatch[1];
    const templateFullPath = path.resolve(path.dirname(componentFilePath), templateRelPath);
    if (rootDir) {
      const resolvedRoot = path.resolve(rootDir);
      if (!templateFullPath.startsWith(resolvedRoot + path.sep) && templateFullPath !== resolvedRoot) {
        logger.debug(`Template path escapes project root: ${templateRelPath}`);
        return null;
      }
    }
    if (existsSync(templateFullPath)) {
      try {
        return { templatePath: templateFullPath, content: readFileSync(templateFullPath, "utf-8") };
      } catch {
        return null;
      }
    }
    return null;
  }

  const inlineTemplateMatch = componentContent.match(/template\s*:\s*`([\s\S]*?)`/);
  if (inlineTemplateMatch) {
    return { templatePath: componentFilePath, content: inlineTemplateMatch[1] };
  }

  const inlineSingleMatch = componentContent.match(/template\s*:\s*'([^']*)'/);
  if (inlineSingleMatch) {
    return { templatePath: componentFilePath, content: inlineSingleMatch[1] };
  }

  const inlineDoubleMatch = componentContent.match(/template\s*:\s*"([^"]*)"/);
  if (inlineDoubleMatch) {
    return { templatePath: componentFilePath, content: inlineDoubleMatch[1] };
  }

  return null;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const parseTemplate = (
  componentFilePath: string,
  componentContent: string,
  rootDir?: string,
): TemplateUsage | null => {
  const template = getTemplateContent(componentFilePath, componentContent, rootDir);
  if (!template) return null;

  try {
    const parsed = angularParseTemplate(template.content, template.templatePath);

    if (parsed.errors && parsed.errors.length > 0) {
      return null;
    }

    const ctx: CollectionContext = {
      selectors: new Set(),
      pipes: new Set(),
      propertyBindings: new Set(),
      eventBindings: new Set(),
      interpolations: new Set(),
      templateRefs: new Set(),
    };

    walkTemplateNodes(parsed.nodes, ctx);

    return {
      componentFilePath,
      templateFilePath: template.templatePath,
      selectors: ctx.selectors,
      pipes: ctx.pipes,
      propertyBindings: ctx.propertyBindings,
      eventBindings: ctx.eventBindings,
      interpolations: ctx.interpolations,
      templateRefs: ctx.templateRefs,
    };
  } catch {
    return null;
  }
};

export const buildProjectTemplateMap = (directory: string): ProjectTemplateMap => {
  const srcDir = existsSync(path.join(directory, "src")) ? path.join(directory, "src") : directory;
  const tsFiles = walkFiles(srcDir, [".ts"]);

  const byComponentFile = new Map<string, TemplateUsage>();
  const allUsedSelectors = new Set<string>();
  const allUsedPipes = new Set<string>();
  const allUsedProperties = new Set<string>();

  for (const filePath of tsFiles) {
    if (filePath.endsWith(".spec.ts") || filePath.endsWith(".test.ts")) continue;

    try {
      const content = readFileSync(filePath, "utf-8");
      if (!content.includes("@Component")) continue;

      const usage = parseTemplate(filePath, content, directory);
      if (!usage) continue;

      byComponentFile.set(filePath, usage);

      for (const sel of usage.selectors) allUsedSelectors.add(sel);
      for (const pipe of usage.pipes) allUsedPipes.add(pipe);
      for (const prop of usage.propertyBindings) allUsedProperties.add(prop);
    } catch {
      // read errors
    }
  }

  return { byComponentFile, allUsedSelectors, allUsedPipes, allUsedProperties };
};

const NATIVE_HTML_TAGS = new Set([
  "a",
  "abbr",
  "address",
  "area",
  "article",
  "aside",
  "audio",
  "b",
  "base",
  "bdi",
  "bdo",
  "blockquote",
  "body",
  "br",
  "button",
  "canvas",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "data",
  "datalist",
  "dd",
  "del",
  "details",
  "dfn",
  "dialog",
  "div",
  "dl",
  "dt",
  "em",
  "embed",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hgroup",
  "hr",
  "html",
  "i",
  "iframe",
  "img",
  "input",
  "ins",
  "kbd",
  "label",
  "legend",
  "li",
  "link",
  "main",
  "map",
  "mark",
  "menu",
  "meta",
  "meter",
  "nav",
  "noscript",
  "object",
  "ol",
  "optgroup",
  "option",
  "output",
  "p",
  "param",
  "picture",
  "pre",
  "progress",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "script",
  "search",
  "section",
  "select",
  "slot",
  "small",
  "source",
  "span",
  "strong",
  "style",
  "sub",
  "summary",
  "sup",
  "svg",
  "table",
  "tbody",
  "td",
  "template",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "time",
  "title",
  "tr",
  "track",
  "u",
  "ul",
  "var",
  "video",
  "wbr",
  "path",
  "circle",
  "rect",
  "line",
  "polyline",
  "polygon",
  "text",
  "g",
  "defs",
  "use",
  "symbol",
  "clippath",
  "mask",
  "pattern",
  "image",
  "foreignobject",
  "lineargradient",
  "radialgradient",
  "stop",
  "filter",
  "animate",
  "animatetransform",
  "tspan",
  "router-outlet",
]);

const BUILTIN_PIPES = new Set([
  "async",
  "currency",
  "date",
  "decimal",
  "i18nPlural",
  "i18nSelect",
  "json",
  "keyvalue",
  "lowercase",
  "number",
  "percent",
  "slice",
  "titlecase",
  "uppercase",
]);

const ANGULAR_KEYWORDS = new Set([
  "let",
  "of",
  "as",
  "index",
  "first",
  "last",
  "even",
  "odd",
  "count",
  "track",
  "by",
  "true",
  "false",
  "null",
  "undefined",
  "this",
  "if",
  "else",
  "for",
  "switch",
  "case",
  "default",
  "empty",
]);
