export interface RuleDoc {
  rule: string;
  title: string;
  category: string;
  whyItMatters: string;
  beforeCode: string;
  afterCode: string;
  effort: "quick-fix" | "moderate" | "refactor";
  estimatedMinutes: number;
  tags: string[];
}

export const RULE_DOCS: Record<string, RuleDoc> = {
  "missing-onpush": {
    rule: "missing-onpush",
    title: "Missing OnPush Change Detection",
    category: "performance",
    whyItMatters:
      "Without OnPush, Angular runs change detection on every browser event for this component. This can cause hundreds of unnecessary re-checks per second in large applications.",
    beforeCode: `@Component({ selector: 'app-foo' })\nexport class FooComponent {}`,
    afterCode: `@Component({\n  selector: 'app-foo',\n  changeDetection: ChangeDetectionStrategy.OnPush\n})\nexport class FooComponent {}`,
    effort: "quick-fix",
    estimatedMinutes: 2,
    tags: ["performance", "change-detection"],
  },
  "missing-trackby": {
    rule: "missing-trackby",
    title: "Missing trackBy in *ngFor",
    category: "performance",
    whyItMatters:
      "Without trackBy, Angular destroys and recreates DOM elements on every change. With large lists this causes jank and memory thrashing.",
    beforeCode: `<div *ngFor="let item of items">{{ item.name }}</div>`,
    afterCode: `<div *ngFor="let item of items; trackBy: trackById">{{ item.name }}</div>`,
    effort: "quick-fix",
    estimatedMinutes: 3,
    tags: ["performance", "dom"],
  },
  "non-standalone-component": {
    rule: "non-standalone-component",
    title: "Non-Standalone Component",
    category: "best-practices",
    whyItMatters:
      "NgModules add indirection and increase bundle complexity. Standalone components are the recommended pattern since Angular 15+ and mandatory for best tree-shaking.",
    beforeCode: `@Component({ selector: 'app-foo' })\nexport class FooComponent {}  // + NgModule declaration`,
    afterCode: `@Component({\n  selector: 'app-foo',\n  standalone: true,\n  imports: [CommonModule]\n})\nexport class FooComponent {}`,
    effort: "moderate",
    estimatedMinutes: 15,
    tags: ["standalone", "angular-19"],
  },
  "dead-code-generic": {
    rule: "dead-code-generic",
    title: "Unused Export (Generic)",
    category: "dead-code",
    whyItMatters:
      "Dead exports increase bundle size and cognitive load. They make it harder to understand what code is actually used.",
    beforeCode: `export const legacyHelper = () => { /* never imported */ };`,
    afterCode: `// Delete the unused export or mark it as @internal if planned for future use.`,
    effort: "quick-fix",
    estimatedMinutes: 2,
    tags: ["dead-code", "bundle-size"],
  },
  "unused-angular-entity": {
    rule: "unused-angular-entity",
    title: "Unused Angular Entity",
    category: "dead-code",
    whyItMatters:
      "Unused components, services, pipes, or directives add dead weight to the bundle and confuse developers navigating the codebase.",
    beforeCode: `@Component({ selector: 'app-unused' })\nexport class UnusedComponent {} // never referenced`,
    afterCode: `// Delete the component file entirely, or re-import it where needed.`,
    effort: "quick-fix",
    estimatedMinutes: 5,
    tags: ["dead-code", "angular"],
  },
  "unused-class-member": {
    rule: "unused-class-member",
    title: "Unused Class Member",
    category: "dead-code",
    whyItMatters:
      "Unused properties and methods add noise to classes and can mask the component's true interface. They are also potential maintenance hazards.",
    beforeCode: `class FooComponent {\n  unusedField = 'hello'; // never accessed\n}`,
    afterCode: `class FooComponent {\n  // Field removed\n}`,
    effort: "quick-fix",
    estimatedMinutes: 2,
    tags: ["dead-code", "class-hygiene"],
  },
  "circular-dependency": {
    rule: "circular-dependency",
    title: "Circular Import Dependency",
    category: "architecture",
    whyItMatters:
      "Circular imports can cause undefined values at runtime, make the dependency graph fragile, and prevent effective tree-shaking.",
    beforeCode: `// a.ts imports b.ts, b.ts imports a.ts`,
    afterCode: `// Extract shared logic into c.ts. Both a.ts and b.ts import from c.ts.`,
    effort: "refactor",
    estimatedMinutes: 30,
    tags: ["architecture", "imports"],
  },
  "deep-import": {
    rule: "deep-import",
    title: "Deep Import Into Package Internals",
    category: "architecture",
    whyItMatters:
      "Importing from internal paths of a package bypasses its public API and couples your code to implementation details that may change without notice.",
    beforeCode: `import { internalHelper } from '@angular/core/src/util';`,
    afterCode: `import { publicHelper } from '@angular/core';`,
    effort: "moderate",
    estimatedMinutes: 10,
    tags: ["architecture", "coupling", "public-api"],
  },
  "boundary-violation": {
    rule: "boundary-violation",
    title: "Architecture Boundary Violation",
    category: "architecture",
    whyItMatters:
      "Crossing module boundaries creates tight coupling. Features that import from other features or layers break isolation and make independent deployment and testing impossible.",
    beforeCode: `// In features/auth/login.component.ts\nimport { CartService } from '../cart/cart.service';`,
    afterCode: `// Move shared logic to shared/ or core/\nimport { CartService } from '@shared/cart/cart.service';`,
    effort: "moderate",
    estimatedMinutes: 20,
    tags: ["architecture", "boundaries", "coupling"],
  },
  "public-api-violation": {
    rule: "public-api-violation",
    title: "Public API Bypass",
    category: "architecture",
    whyItMatters:
      "Importing internal files of a module instead of its barrel file (index.ts) couples consumers to implementation details. When the module refactors internals, all consumers break.",
    beforeCode: `import { AuthGuard } from '../auth/guards/auth.guard';`,
    afterCode: `import { AuthGuard } from '../auth'; // via index.ts barrel`,
    effort: "quick-fix",
    estimatedMinutes: 5,
    tags: ["architecture", "public-api", "barrel"],
  },
  "large-component": {
    rule: "large-component",
    title: "Oversized Component",
    category: "performance",
    whyItMatters:
      "Large components are hard to test, reason about, and maintain. They often indicate mixed concerns that should be split into child components.",
    beforeCode: `@Component({...})\nexport class MegaComponent { // 500+ lines of code }`,
    afterCode: `// Split into smaller presentational child components.\n// Extract business logic into services.`,
    effort: "refactor",
    estimatedMinutes: 60,
    tags: ["performance", "maintainability"],
  },
  "eager-route-component": {
    rule: "eager-route-component",
    title: "Eagerly Loaded Route Component",
    category: "performance",
    whyItMatters:
      "Eagerly loaded route components increase the initial bundle size. Lazy loading defers the load until the user navigates to that route.",
    beforeCode: `{ path: 'feature', component: FeatureComponent }`,
    afterCode: `{ path: 'feature', loadComponent: () => import('./feature.component').then(m => m.FeatureComponent) }`,
    effort: "moderate",
    estimatedMinutes: 10,
    tags: ["performance", "lazy-loading"],
  },
  "eager-route-children": {
    rule: "eager-route-children",
    title: "Eagerly Loaded Route Children",
    category: "performance",
    whyItMatters:
      "Inlined children arrays prevent code splitting. Using loadChildren keeps sub-routes in a separate chunk.",
    beforeCode: `{ path: 'admin', children: [{ path: 'users', component: UsersComponent }] }`,
    afterCode: `{ path: 'admin', loadChildren: () => import('./admin/admin.routes').then(m => m.routes) }`,
    effort: "moderate",
    estimatedMinutes: 15,
    tags: ["performance", "lazy-loading"],
  },
  "circular-service-injection": {
    rule: "circular-service-injection",
    title: "Circular Service Injection",
    category: "architecture",
    whyItMatters:
      "Circular injection causes runtime errors or requires forwardRef hacks. It indicates tangled business logic that should be restructured.",
    beforeCode: `// AuthService injects UserService, UserService injects AuthService`,
    afterCode: `// Extract shared logic into a new SharedAuthService that both services depend on.`,
    effort: "refactor",
    estimatedMinutes: 45,
    tags: ["architecture", "dependency-injection"],
  },
  "forward-ref-usage": {
    rule: "forward-ref-usage",
    title: "forwardRef Usage",
    category: "architecture",
    whyItMatters:
      "forwardRef is a workaround for circular dependencies. Its presence usually signals an architecture issue that should be resolved.",
    beforeCode: `@Inject(forwardRef(() => OtherService)) private other: OtherService`,
    afterCode: `// Refactor to eliminate the circular dependency. Then inject normally:\nprivate other = inject(OtherService);`,
    effort: "refactor",
    estimatedMinutes: 30,
    tags: ["architecture", "dependency-injection"],
  },
  "@angular-eslint/template/use-track-by-function": {
    rule: "@angular-eslint/template/use-track-by-function",
    title: "Missing trackBy in *ngFor / track in @for",
    category: "performance",
    whyItMatters:
      "Without trackBy, Angular destroys and recreates DOM elements on every change. With large lists this causes jank and memory thrashing.",
    beforeCode: `<div *ngFor="let item of items">{{ item.name }}</div>`,
    afterCode: `<div *ngFor="let item of items; trackBy: trackById">{{ item.name }}</div>`,
    effort: "quick-fix",
    estimatedMinutes: 3,
    tags: ["performance", "dom", "template"],
  },
  "@angular-eslint/template/banana-in-box": {
    rule: "@angular-eslint/template/banana-in-box",
    title: "Banana-in-Box Syntax Error",
    category: "best-practices",
    whyItMatters:
      "Writing `([ngModel])` instead of `[(ngModel)]` silently creates a one-way binding instead of two-way, causing form values not to update.",
    beforeCode: `<input ([ngModel])="name">`,
    afterCode: `<input [(ngModel)]="name">`,
    effort: "quick-fix",
    estimatedMinutes: 1,
    tags: ["best-practices", "template", "two-way-binding"],
  },
  "rxjs-x/no-unsafe-takeuntil": {
    rule: "rxjs-x/no-unsafe-takeuntil",
    title: "Unsafe takeUntil Placement",
    category: "best-practices",
    whyItMatters:
      "Placing takeUntil before operators like switchMap or mergeMap creates inner subscriptions that are not cleaned up when the notifier fires, causing memory leaks.",
    beforeCode: `.pipe(\n  takeUntilDestroyed(),\n  switchMap(val => this.http.get(url))\n).subscribe();`,
    afterCode: `.pipe(\n  switchMap(val => this.http.get(url)),\n  takeUntilDestroyed()\n).subscribe();`,
    effort: "quick-fix",
    estimatedMinutes: 2,
    tags: ["best-practices", "rxjs", "memory-leak"],
  },
  "rxjs-x/no-ignored-subscription": {
    rule: "rxjs-x/no-ignored-subscription",
    title: "Ignored Subscription",
    category: "best-practices",
    whyItMatters:
      "Calling .subscribe() without storing or managing the returned Subscription means you have no way to unsubscribe, leading to memory leaks and stale callbacks.",
    beforeCode: `this.data$.subscribe(d => this.data = d);`,
    afterCode: `this.data$.pipe(\n  takeUntilDestroyed()\n).subscribe(d => this.data = d);`,
    effort: "quick-fix",
    estimatedMinutes: 3,
    tags: ["best-practices", "rxjs", "memory-leak"],
  },
  "bypass-security-trust": {
    rule: "bypass-security-trust",
    title: "DomSanitizer Bypass",
    category: "security",
    whyItMatters:
      "Calling bypassSecurityTrust* disables Angular's built-in XSS protection for that value. If the input is ever user-controlled, it opens the door to cross-site scripting attacks.",
    beforeCode: "this.sanitizer.bypassSecurityTrustHtml(userInput)",
    afterCode: "// Use DomSanitizer.sanitize() or restructure to avoid raw HTML",
    effort: "moderate",
    estimatedMinutes: 15,
    tags: ["security", "xss", "sanitization"],
  },
  "eval-usage": {
    rule: "eval-usage",
    title: "eval() or new Function() Usage",
    category: "security",
    whyItMatters:
      "eval() and new Function() execute arbitrary strings as code, enabling code injection attacks. They also prevent JavaScript engine optimizations.",
    beforeCode: "const result = eval(userExpression);",
    afterCode: "// Use JSON.parse() for data, or a safe expression evaluator",
    effort: "moderate",
    estimatedMinutes: 20,
    tags: ["security", "code-injection"],
  },
  "hardcoded-secret": {
    rule: "hardcoded-secret",
    title: "Hardcoded Secret or API Key",
    category: "security",
    whyItMatters:
      "Hardcoded secrets in source code get committed to version control, appear in build artifacts, and can be extracted by anyone with repository access.",
    beforeCode: "const apiKey = 'sk-proj-abc123...';",
    afterCode: "const apiKey = environment.apiKey; // from environment variables",
    effort: "quick-fix",
    estimatedMinutes: 5,
    tags: ["security", "secrets", "credentials"],
  },
  "innerhtml-binding": {
    rule: "innerhtml-binding",
    title: "innerHTML Binding in Template",
    category: "security",
    whyItMatters:
      "Binding to [innerHTML] can render unsanitized HTML. While Angular sanitizes by default, dynamic HTML from user input or APIs can still introduce XSS risks.",
    beforeCode: '<div [innerHTML]="userContent"></div>',
    afterCode: "<!-- Use text interpolation or sanitize explicitly -->\n<div>{{ userContent }}</div>",
    effort: "quick-fix",
    estimatedMinutes: 5,
    tags: ["security", "xss", "template"],
  },
  "low-signal-readiness": {
    rule: "low-signal-readiness",
    title: "Low Signal Adoption",
    category: "best-practices",
    whyItMatters:
      "Angular Signals provide fine-grained reactivity and eliminate the need for manual subscription management. Adopting signals improves performance and reduces boilerplate.",
    beforeCode: `@Input() name: string;\nthis.data$.subscribe(d => this.data = d);`,
    afterCode: `name = input<string>();\ndata = toSignal(this.data$);`,
    effort: "moderate",
    estimatedMinutes: 10,
    tags: ["best-practices", "signals"],
  },
};

export const getDocsForCategory = (category: string): RuleDoc[] =>
  Object.values(RULE_DOCS).filter((doc) => doc.category === category);

export const getEffortSummary = (rules: { rule: string; count: number }[]): Record<string, number> => {
  const totals: Record<string, number> = { "quick-fix": 0, moderate: 0, refactor: 0 };
  for (const { rule, count } of rules) {
    const doc = RULE_DOCS[rule];
    if (doc) {
      totals[doc.effort] += doc.estimatedMinutes * count;
    }
  }
  return totals;
};
