import { readdirSync } from "node:fs";
import path from "node:path";
import { logger } from "./logger.js";

const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

export const walkFiles = (
  dir: string,
  extensions: string[],
  options?: { skipTests?: boolean; skipDeclarations?: boolean },
): string[] => {
  const results: string[] = [];
  const skipTests = options?.skipTests ?? true;
  const skipDeclarations = options?.skipDeclarations ?? true;

  const recurse = (current: string): void => {
    try {
      const entries = readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          recurse(fullPath);
        } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
          if (skipTests && (entry.name.endsWith(".spec.ts") || entry.name.endsWith(".test.ts"))) continue;
          if (skipDeclarations && entry.name.endsWith(".d.ts")) continue;
          results.push(fullPath);
        }
      }
    } catch (error) {
      logger.debug(`Walk: skipping ${current} — ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  recurse(dir);
  return results;
};
