import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);
import type { Diagnostic } from "../types.js";
import { classifyDiagnostic } from "../trust.js";
import { logger } from "../utils/logger.js";

interface KnipNameEntry {
  name: string;
}

interface KnipFileIssues {
  file: string;
  dependencies: KnipNameEntry[];
  devDependencies: KnipNameEntry[];
  optionalPeerDependencies: KnipNameEntry[];
  exports: KnipNameEntry[];
  types: KnipNameEntry[];
  duplicates: KnipNameEntry[];
}

interface KnipJsonOutput {
  files: string[];
  issues: KnipFileIssues[];
}

const KNIP_CATEGORY_RULE: Record<string, string> = {
  dependencies: "unused-dependency",
  devDependencies: "unused-dev-dependency",
  exports: "unused-export",
  types: "unused-type",
  duplicates: "duplicate-export",
};

const KNIP_ISSUE_CATEGORIES = ["dependencies", "devDependencies", "exports", "types", "duplicates"] as const;

const resolveKnipBinary = (directory: string): { command: string; args: string[] } | null => {
  const localBin = path.join(directory, "node_modules", ".bin", "knip");
  if (existsSync(localBin)) {
    logger.debug(`Dead code: using local Knip at ${localBin}`);
    return { command: localBin, args: ["--reporter", "json", "--no-progress"] };
  }

  logger.debug("Dead code: no local Knip found — skipping. Install knip as a devDependency to enable.");
  return null;
};

const classifyKnipDiagnostic = (diagnostic: Diagnostic): Diagnostic =>
  classifyDiagnostic(diagnostic, { provenance: "project-knip", trust: "core" });

export const parseKnipOutput = (json: string, directory: string): Diagnostic[] => {
  const knipOutput = JSON.parse(json) as KnipJsonOutput;
  const diagnostics: Diagnostic[] = [];

  for (const file of knipOutput.files ?? []) {
    diagnostics.push(
      classifyKnipDiagnostic({
        filePath: path.relative(directory, file),
        rule: "unused-file",
        category: "dead-code",
        severity: "warning",
        message: "File is not imported by any other file.",
        help: "Remove this file if it is no longer needed, or add an import to it.",
        line: 1,
        column: 1,
        source: "knip",
        stability: "experimental",
      }),
    );
  }

  for (const fileEntry of knipOutput.issues ?? []) {
    const filePath = path.relative(directory, fileEntry.file);
    for (const cat of KNIP_ISSUE_CATEGORIES) {
      const entries = fileEntry[cat] as KnipNameEntry[] | undefined;
      if (!entries?.length) continue;
      const rule = KNIP_CATEGORY_RULE[cat] ?? "unused-export";
      const typeLabel = cat
        .replace(/([A-Z])/g, " $1")
        .toLowerCase()
        .replace(/ies$/, "y")
        .replace(/s$/, "");
      for (const entry of entries) {
        diagnostics.push(
          classifyKnipDiagnostic({
            filePath,
            rule,
            category: "dead-code",
            severity: "warning",
            message: `${entry.name}: ${typeLabel} is not used.`,
            help: `Remove this unused ${typeLabel} or add a consumer.`,
            line: 1,
            column: 1,
            source: "knip",
            stability: "experimental",
          }),
        );
      }
    }
  }

  return diagnostics;
};

export const runDeadCodeAnalyzer = async (directory: string, signal?: AbortSignal): Promise<Diagnostic[]> => {
  const resolved = resolveKnipBinary(directory);
  if (!resolved) return [];

  const { command, args } = resolved;

  try {
    const result = await execFileAsync(command, args, {
      cwd: directory,
      encoding: "utf-8",
      timeout: 120_000,
      signal,
    });

    return parseKnipOutput(result.stdout, directory);
  } catch (error) {
    if (error instanceof Error && "stdout" in error) {
      const stdout = (error as { stdout: string }).stdout;
      if (stdout) {
        return parseKnipOutput(stdout, directory);
      }
    }
    throw error;
  }
};
