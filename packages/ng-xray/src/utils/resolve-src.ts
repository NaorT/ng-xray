import { existsSync } from "node:fs";
import path from "node:path";

export const resolveSrcDir = (directory: string): string => {
  const srcDir = path.join(directory, "src");
  return existsSync(srcDir) ? srcDir : directory;
};
