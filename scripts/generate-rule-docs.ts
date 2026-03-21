import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RULE_DOCS } from "../packages/ng-xray/src/report/rule-docs.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(SCRIPT_DIR, "..", "docs", "rules");

if (!existsSync(DOCS_DIR)) {
  mkdirSync(DOCS_DIR, { recursive: true });
}

const indexLines: string[] = ["# Rule Reference", "", "All rules documented by ng-xray.", ""];

const categories = new Map<string, string[]>();

for (const doc of Object.values(RULE_DOCS)) {
  const filename = `${doc.rule}.md`;
  const content = `# ${doc.title}

| Property | Value |
|----------|-------|
| Rule | \`${doc.rule}\` |
| Category | ${doc.category} |
| Effort | ${doc.effort} |
| Estimated fix time | ~${doc.estimatedMinutes} min |

## Why it matters

${doc.whyItMatters}

## Before

\`\`\`typescript
${doc.beforeCode}
\`\`\`

## After

\`\`\`typescript
${doc.afterCode}
\`\`\`

## Tags

${doc.tags.map((t) => `\`${t}\``).join(", ")}
`;

  const outPath = path.join(DOCS_DIR, filename);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, content, "utf-8");

  if (!categories.has(doc.category)) {
    categories.set(doc.category, []);
  }
  categories.get(doc.category)!.push(`- [\`${doc.rule}\`](./${filename}) — ${doc.title}`);
}

for (const [category, rules] of [...categories.entries()].sort()) {
  indexLines.push(`## ${category.charAt(0).toUpperCase() + category.slice(1)}`, "");
  indexLines.push(...rules, "");
}

writeFileSync(path.join(DOCS_DIR, "README.md"), indexLines.join("\n"), "utf-8");
console.log(`Generated ${Object.keys(RULE_DOCS).length} rule docs in ${DOCS_DIR}`);
