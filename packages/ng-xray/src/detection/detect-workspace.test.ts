import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectWorkspace, resolveProjectDirectory } from './detect-workspace.js';

const createWorkspaceDir = (): string =>
  mkdtempSync(path.join(tmpdir(), 'ng-xray-workspace-'));

describe('detectWorkspace', () => {
  it('detects multi-project Angular workspaces and keeps project source roots', () => {
    const directory = createWorkspaceDir();
    writeFileSync(path.join(directory, 'angular.json'), JSON.stringify({
      defaultProject: 'demo-app',
      projects: {
        'demo-app': {
          root: 'apps/demo-app',
          sourceRoot: 'apps/demo-app/custom-src',
        },
        'demo-lib': {
          root: 'libs/demo-lib',
          sourceRoot: 'libs/demo-lib/src',
        },
      },
    }), 'utf-8');

    const workspace = detectWorkspace(directory);

    expect(workspace.type).toBe('angular-cli');
    expect(workspace.defaultProject).toBe('demo-app');
    expect(workspace.projects.map((project) => ({
      name: project.name,
      root: path.relative(directory, project.root),
      sourceRoot: path.relative(directory, project.sourceRoot),
    }))).toEqual([
      {
        name: 'demo-app',
        root: 'apps/demo-app',
        sourceRoot: 'apps/demo-app/custom-src',
      },
      {
        name: 'demo-lib',
        root: 'libs/demo-lib',
        sourceRoot: 'libs/demo-lib/src',
      },
    ]);
  });

  it('marks workspaces with nx.json as nx', () => {
    const directory = createWorkspaceDir();
    writeFileSync(path.join(directory, 'angular.json'), JSON.stringify({
      projects: {
        app: {
          root: 'apps/app',
          sourceRoot: 'apps/app/src',
        },
      },
    }), 'utf-8');
    writeFileSync(path.join(directory, 'nx.json'), JSON.stringify({}), 'utf-8');

    expect(detectWorkspace(directory).type).toBe('nx');
  });
});

describe('resolveProjectDirectory', () => {
  it('resolves the requested project root in a multi-project workspace', () => {
    const directory = createWorkspaceDir();
    mkdirSync(path.join(directory, 'apps', 'admin'), { recursive: true });
    mkdirSync(path.join(directory, 'apps', 'shop'), { recursive: true });
    writeFileSync(path.join(directory, 'angular.json'), JSON.stringify({
      defaultProject: 'shop',
      projects: {
        admin: {
          root: 'apps/admin',
          sourceRoot: 'apps/admin/src',
        },
        shop: {
          root: 'apps/shop',
          sourceRoot: 'apps/shop/src',
        },
      },
    }), 'utf-8');

    const workspace = detectWorkspace(directory);

    expect(path.relative(directory, resolveProjectDirectory(workspace, 'admin'))).toBe('apps/admin');
    expect(path.relative(directory, resolveProjectDirectory(workspace))).toBe('apps/shop');
  });
});
