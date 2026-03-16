import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAngularCompilerContext } from './angular-diagnostics.js';

const createAngularWorkspace = (): { workspaceDir: string; projectDir: string } => {
  const workspaceDir = mkdtempSync(path.join(tmpdir(), 'ng-xray-angular-diags-'));
  const projectDir = path.join(workspaceDir, 'libs', 'ui');
  mkdirSync(path.join(workspaceDir, 'node_modules', '.bin'), { recursive: true });
  mkdirSync(projectDir, { recursive: true });
  return { workspaceDir, projectDir };
};

describe('resolveAngularCompilerContext', () => {
  it('finds ngc in the workspace root and tsconfig in the project root', () => {
    const { workspaceDir, projectDir } = createAngularWorkspace();
    const ngcBinary = path.join(workspaceDir, 'node_modules', '.bin', 'ngc');
    writeFileSync(ngcBinary, '', 'utf-8');
    writeFileSync(path.join(projectDir, 'tsconfig.lib.json'), JSON.stringify({}), 'utf-8');

    const context = resolveAngularCompilerContext(projectDir);

    expect(context).toEqual({
      ngcBinary,
      tsConfig: path.join(projectDir, 'tsconfig.lib.json'),
    });
  });
});
