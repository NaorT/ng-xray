import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface WorkspaceProject {
  name: string;
  root: string;
  sourceRoot: string;
}

export interface WorkspaceInfo {
  type: 'angular-cli' | 'nx' | 'single';
  configPath: string | null;
  projects: WorkspaceProject[];
  defaultProject: string | null;
}

interface AngularJson {
  defaultProject?: string;
  projects?: Record<string, {
    root?: string;
    sourceRoot?: string;
    projectType?: string;
  }>;
}

const parseAngularJson = (directory: string): WorkspaceInfo | null => {
  const configPath = path.join(directory, 'angular.json');
  if (!existsSync(configPath)) return null;

  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as AngularJson;
    if (!raw.projects) return null;

    const projects: WorkspaceProject[] = Object.entries(raw.projects).map(([name, config]) => ({
      name,
      root: path.resolve(directory, config.root ?? ''),
      sourceRoot: path.resolve(directory, config.sourceRoot ?? config.root ?? 'src'),
    }));

    const hasNx = existsSync(path.join(directory, 'nx.json'));

    return {
      type: hasNx ? 'nx' : 'angular-cli',
      configPath,
      projects,
      defaultProject: raw.defaultProject ?? (projects.length === 1 ? projects[0].name : null),
    };
  } catch {
    return null;
  }
};

export const detectWorkspace = (directory: string): WorkspaceInfo => {
  const workspace = parseAngularJson(directory);
  if (workspace && workspace.projects.length > 0) return workspace;

  return {
    type: 'single',
    configPath: null,
    projects: [{
      name: path.basename(directory),
      root: directory,
      sourceRoot: existsSync(path.join(directory, 'src'))
        ? path.join(directory, 'src')
        : directory,
    }],
    defaultProject: path.basename(directory),
  };
};

export const resolveProjectDirectory = (
  workspace: WorkspaceInfo,
  projectName?: string,
): string =>
  resolveWorkspaceProject(workspace, projectName).root;

export const resolveWorkspaceProject = (
  workspace: WorkspaceInfo,
  projectName?: string,
): WorkspaceProject => {
  if (!projectName) {
    if (workspace.projects.length === 1) return workspace.projects[0];
    if (workspace.defaultProject) {
      const found = workspace.projects.find(p => p.name === workspace.defaultProject);
      if (found) return found;
    }
    return workspace.projects[0];
  }

  const found = workspace.projects.find(p => p.name === projectName);
  if (!found) {
    const available = workspace.projects.map(p => p.name).join(', ');
    throw new Error(
      `Project "${projectName}" not found in workspace. Available projects: ${available}`,
    );
  }
  return found;
};
