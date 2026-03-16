import { describe, it, expect } from 'vitest';
import { parseTemplate, buildProjectTemplateMap } from './template-parser.js';
import { fixtureDir } from '../__fixtures__/helper.js';

describe('parseTemplate', () => {
  it('parses inline backtick template', () => {
    const componentCode = `
import { Component } from '@angular/core';

@Component({
  selector: 'app-test',
  standalone: true,
  template: \`<app-child></app-child>\`,
})
export class TestComponent {}
`;
    const result = parseTemplate('/fake/test.component.ts', componentCode);
    expect(result).not.toBeNull();
    expect(result!.selectors).toContain('app-child');
  });

  it('extracts pipe usage', () => {
    const componentCode = `
import { Component } from '@angular/core';

@Component({
  selector: 'app-test',
  standalone: true,
  template: \`{{ value | myPipe }}\`,
})
export class TestComponent {}
`;
    const result = parseTemplate('/fake/test.component.ts', componentCode);
    expect(result).not.toBeNull();
    expect(result!.pipes).toContain('myPipe');
  });

  it('extracts property bindings', () => {
    const componentCode = `
import { Component } from '@angular/core';

@Component({
  selector: 'app-test',
  standalone: true,
  template: \`<span [title]="myProp"></span>\`,
})
export class TestComponent {}
`;
    const result = parseTemplate('/fake/test.component.ts', componentCode);
    expect(result).not.toBeNull();
    expect(result!.propertyBindings).toContain('myProp');
  });

  it('extracts event bindings', () => {
    const componentCode = `
import { Component } from '@angular/core';

@Component({
  selector: 'app-test',
  standalone: true,
  template: \`<button (click)="onClick()">Click</button>\`,
})
export class TestComponent {}
`;
    const result = parseTemplate('/fake/test.component.ts', componentCode);
    expect(result).not.toBeNull();
    expect(result!.eventBindings).toContain('onClick');
  });

  it('extracts interpolations', () => {
    const componentCode = `
import { Component } from '@angular/core';

@Component({
  selector: 'app-test',
  standalone: true,
  template: \`{{ name }}\`,
})
export class TestComponent {}
`;
    const result = parseTemplate('/fake/test.component.ts', componentCode);
    expect(result).not.toBeNull();
    expect(result!.interpolations).toContain('name');
  });

  it('returns null for file without template', () => {
    const componentCode = `
import { Component } from '@angular/core';

@Component({ selector: 'app-foo' })
export class FooComponent {}
`;
    const result = parseTemplate('/fake/foo.component.ts', componentCode);
    expect(result).toBeNull();
  });

  it('filters out native HTML elements', () => {
    const componentCode = `
import { Component } from '@angular/core';

@Component({
  selector: 'app-test',
  standalone: true,
  template: \`<div>Hello</div>\`,
})
export class TestComponent {}
`;
    const result = parseTemplate('/fake/test.component.ts', componentCode);
    expect(result).not.toBeNull();
    expect(result!.selectors.has('div')).toBe(false);
  });

  it('filters out built-in pipes', () => {
    const componentCode = `
import { Component } from '@angular/core';

@Component({
  selector: 'app-test',
  standalone: true,
  template: \`{{ value | async }}\`,
})
export class TestComponent {}
`;
    const result = parseTemplate('/fake/test.component.ts', componentCode);
    expect(result).not.toBeNull();
    expect(result!.pipes.has('async')).toBe(false);
  });
});

describe('buildProjectTemplateMap', () => {
  it('builds template map from fixture directory', () => {
    const result = buildProjectTemplateMap(fixtureDir('clean-project'));
    expect(result.allUsedSelectors).toBeInstanceOf(Set);
    expect(result.byComponentFile.size).toBeGreaterThanOrEqual(1);
  });
});
