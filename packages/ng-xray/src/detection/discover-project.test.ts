import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverProject } from './discover-project.js';

const createWorkspaceProject = (): { workspaceDir: string; projectDir: string } => {
  const workspaceDir = mkdtempSync(path.join(tmpdir(), 'ng-xray-discover-'));
  const projectDir = path.join(workspaceDir, 'libs', 'ui');
  mkdirSync(path.join(projectDir, 'src'), { recursive: true });
  return { workspaceDir, projectDir };
};

describe('discoverProject', () => {
  it('finds Angular metadata from the nearest ancestor package.json', () => {
    const { workspaceDir, projectDir } = createWorkspaceProject();
    writeFileSync(path.join(workspaceDir, 'package.json'), JSON.stringify({
      name: 'workspace-root',
      dependencies: {
        '@angular/core': '^19.0.0',
        '@angular/ssr': '^19.0.0',
      },
    }), 'utf-8');
    writeFileSync(path.join(projectDir, 'src', 'button.component.ts'), 'export class ButtonComponent {}', 'utf-8');

    const project = discoverProject(projectDir);

    expect(project.projectName).toBe('workspace-root');
    expect(project.angularVersion).toBe('19.0.0');
    expect(project.hasSSR).toBe(true);
    expect(project.sourceFileCount).toBe(1);
  });
});
