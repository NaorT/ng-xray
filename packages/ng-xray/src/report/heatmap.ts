import type { Diagnostic } from '../types.js';

export interface HeatmapNode {
  name: string;
  path: string;
  issueCount: number;
  errorCount: number;
  warningCount: number;
  children?: HeatmapNode[];
}

export const buildHeatmapData = (diagnostics: Diagnostic[]): HeatmapNode => {
  const root: HeatmapNode = { name: 'src', path: '', issueCount: 0, errorCount: 0, warningCount: 0, children: [] };

  const fileGroups = new Map<string, Diagnostic[]>();
  for (const d of diagnostics) {
    if (!d.filePath || d.filePath === 'project-wide') continue;
    const existing = fileGroups.get(d.filePath) ?? [];
    existing.push(d);
    fileGroups.set(d.filePath, existing);
  }

  for (const [filePath, diags] of fileGroups) {
    const parts = filePath.replace(/\\/g, '/').split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const partPath = parts.slice(0, i + 1).join('/');

      if (!current.children) current.children = [];
      let child = current.children.find((c) => c.name === part);

      if (!child) {
        child = { name: part, path: partPath, issueCount: 0, errorCount: 0, warningCount: 0 };
        if (!isFile) child.children = [];
        current.children.push(child);
      }

      if (isFile) {
        child.issueCount = diags.length;
        child.errorCount = diags.filter((d) => d.severity === 'error').length;
        child.warningCount = diags.filter((d) => d.severity === 'warning').length;
      }

      current = child;
    }
  }

  const rollUp = (node: HeatmapNode): void => {
    if (!node.children) return;
    for (const child of node.children) rollUp(child);
    node.issueCount = node.children.reduce((sum, c) => sum + c.issueCount, 0);
    node.errorCount = node.children.reduce((sum, c) => sum + c.errorCount, 0);
    node.warningCount = node.children.reduce((sum, c) => sum + c.warningCount, 0);
  };

  rollUp(root);

  const prune = (node: HeatmapNode): HeatmapNode => {
    if (!node.children) return node;
    node.children = node.children.filter((c) => c.issueCount > 0).map(prune);
    return node;
  };

  return prune(root);
};

export const getTopHotspots = (diagnostics: Diagnostic[], limit = 10): { filePath: string; count: number; errors: number; warnings: number }[] => {
  const fileCounts = new Map<string, { count: number; errors: number; warnings: number }>();
  for (const d of diagnostics) {
    if (!d.filePath || d.filePath === 'project-wide') continue;
    const existing = fileCounts.get(d.filePath) ?? { count: 0, errors: 0, warnings: 0 };
    existing.count++;
    if (d.severity === 'error') existing.errors++;
    else existing.warnings++;
    fileCounts.set(d.filePath, existing);
  }

  return [...fileCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([filePath, counts]) => ({ filePath, ...counts }));
};
