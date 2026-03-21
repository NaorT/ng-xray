import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { ProjectInfo } from "../types.js";

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface PackageContext {
  pkg: PackageJson;
}

const readPackageJson = (directory: string): PackageJson | null => {
  const pkgPath = path.join(directory, "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    return JSON.parse(readFileSync(pkgPath, "utf-8")) as PackageJson;
  } catch {
    return null;
  }
};

const getAngularVersion = (pkg: PackageJson): string | null => {
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  const version = allDeps["@angular/core"];
  if (!version) return null;
  return version.replace(/[\^~>=<]/g, "").split(" ")[0];
};

const hasPackage = (pkg: PackageJson, name: string): boolean => {
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  return name in allDeps;
};

const findPackageContext = (directory: string): PackageContext | null => {
  let current = path.resolve(directory);
  let fallback: PackageContext | null = null;

  while (true) {
    const pkg = readPackageJson(current);
    if (pkg) {
      const context = { pkg };
      fallback ??= context;
      if (getAngularVersion(pkg)) {
        return context;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return fallback;
    }
    current = parent;
  }
};

const countSourceFiles = (directory: string, extensions: string[]): number => {
  let count = 0;
  const walk = (dir: string) => {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
          count++;
        }
      }
    } catch {
      // permission errors, etc.
    }
  };
  walk(directory);
  return count;
};

const countFilesByPattern = (directory: string, pattern: string): number => {
  let count = 0;
  const walk = (dir: string) => {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.name.includes(pattern)) {
          count++;
        }
      }
    } catch {
      // permission errors
    }
  };
  walk(directory);
  return count;
};

const detectStandalonePercentage = (directory: string): number => {
  let total = 0;
  let standaloneCount = 0;

  const walk = (dir: string) => {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (
          entry.name.endsWith(".component.ts") ||
          entry.name.endsWith(".directive.ts") ||
          entry.name.endsWith(".pipe.ts")
        ) {
          total++;
          try {
            const content = readFileSync(fullPath, "utf-8");
            if (
              content.includes("standalone") &&
              (content.includes("standalone: true") || content.includes("standalone:true"))
            ) {
              standaloneCount++;
            }
          } catch {
            // read errors
          }
        }
      }
    } catch {
      // permission errors
    }
  };
  walk(directory);

  if (total === 0) return 100;
  return Math.round((standaloneCount / total) * 100);
};

const detectSignalsUsage = (directory: string): boolean => {
  const walk = (dir: string): boolean => {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (walk(fullPath)) return true;
        } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts")) {
          try {
            const content = readFileSync(fullPath, "utf-8");
            if (
              content.includes("signal(") ||
              content.includes("computed(") ||
              content.includes("effect(") ||
              content.includes("input(") ||
              content.includes("output(")
            ) {
              return true;
            }
          } catch {
            // read errors
          }
        }
      }
    } catch {
      // permission errors
    }
    return false;
  };
  return walk(directory);
};

export const discoverProject = (directory: string): ProjectInfo => {
  const packageContext = findPackageContext(directory);
  const pkg = packageContext?.pkg ?? null;
  const projectName = pkg?.name ?? path.basename(directory);
  const angularVersion = pkg ? getAngularVersion(pkg) : null;
  const hasSSR = pkg ? hasPackage(pkg, "@angular/ssr") || hasPackage(pkg, "@nguniversal/express-engine") : false;

  const srcDir = existsSync(path.join(directory, "src")) ? path.join(directory, "src") : directory;

  return {
    rootDirectory: directory,
    projectName,
    angularVersion,
    hasSSR,
    hasSignals: detectSignalsUsage(srcDir),
    standalonePercentage: detectStandalonePercentage(srcDir),
    hasTypeScript: true,
    sourceFileCount: countSourceFiles(srcDir, [".ts", ".html", ".scss", ".css"]),
    componentCount: countFilesByPattern(srcDir, ".component.ts"),
    serviceCount: countFilesByPattern(srcDir, ".service.ts"),
  };
};
