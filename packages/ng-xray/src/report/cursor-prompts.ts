import type { Diagnostic } from "../types.js";

interface PromptTemplate {
  riskLevel: "high" | "medium" | "low";
  whyItMatters: string;
  investigationSteps: string[];
}

const PLAN_PREAMBLE = `You are in plan mode. Do NOT make any changes yet.

ng-xray (Angular health scanner) detected the following issue:`;

const PLAN_FOOTER = `Present your full remediation plan first. List every file and change you intend to make, explain the reasoning, and highlight any risks. Do not modify any files until I explicitly confirm the plan.`;

const RULE_TEMPLATES: Record<string, PromptTemplate> = {
  "missing-onpush": {
    riskLevel: "high",
    whyItMatters:
      "Switching to OnPush changes how Angular detects changes -- it will only re-render when @Input references change, events fire from the component/children, or you manually trigger detection. If the component or its children rely on mutable object mutations, direct service property reads without observables/signals, or setTimeout/setInterval updates, switching to OnPush will break them silently with no compile-time error.",
    investigationSteps: [
      "Read the component .ts and .html files completely",
      "Identify all data sources: @Input(), services, observables, signals, mutable state, and getters",
      "Check if the template uses the async pipe or reads service properties directly (e.g., `this.service.data` without observable)",
      "Check for setTimeout, setInterval, or Promise-based updates that mutate state without triggering change detection",
      "Inspect all child components -- if they also lack OnPush, consider migrating bottom-up (leaves first, then parents)",
      "Determine if ChangeDetectorRef.markForCheck() or ChangeDetectorRef.detectChanges() is needed anywhere",
      "Create a plan listing every change: adding OnPush, wrapping mutable state in signals/observables, adding async pipes, and any markForCheck() calls",
    ],
  },

  "missing-trackby": {
    riskLevel: "medium",
    whyItMatters:
      "Without trackBy (or track in @for), Angular destroys and re-creates every DOM element in the list on each change detection cycle, even if only one item changed. This causes performance degradation, loss of element state (scroll position, focus, animations), and unnecessary DOM thrashing.",
    investigationSteps: [
      "Read the template to understand the data structure being iterated",
      "Identify a unique, stable identifier for each item (e.g., `id`, `uuid`, or a composite key)",
      "Check if the list data comes from an API (items have IDs) or is generated locally",
      "If using *ngFor: create a trackBy function in the .ts file and reference it in the template",
      "If using @for: add a track expression (e.g., `track item.id`)",
      "Verify the chosen track key is truly unique and stable across re-renders",
    ],
  },

  "takeUntilDestroyed-position": {
    riskLevel: "high",
    whyItMatters:
      'When takeUntilDestroyed() is NOT the first operator in pipe(), intermediate operators like switchMap, mergeMap, or debounceTime can keep inner subscriptions alive after the component is destroyed. This causes memory leaks, zombie HTTP requests, and state mutations on destroyed components that may trigger "ExpressionChangedAfterItHasBeenChecked" errors.',
    investigationSteps: [
      "Read the full pipe chain to understand the observable flow",
      "Identify all operators between pipe() and takeUntilDestroyed() that could create inner subscriptions (switchMap, mergeMap, concatMap, exhaustMap)",
      "Move takeUntilDestroyed() to be the FIRST operator in the pipe",
      "Verify that the DestroyRef is available (either via inject(DestroyRef) or within an injection context)",
      "If takeUntilDestroyed is called outside an injection context (e.g., in ngOnInit), ensure a DestroyRef is passed explicitly",
      "Check that moving takeUntilDestroyed first does not change the intended behavior of the stream (it should only affect teardown timing, not data flow)",
    ],
  },

  "no-manual-subscribe": {
    riskLevel: "medium",
    whyItMatters:
      "Manual .subscribe() calls without proper teardown are the #1 cause of memory leaks in Angular apps. When a component is destroyed but its subscriptions are still active, they continue executing callbacks, making HTTP requests, and mutating state on a dead component. This leads to memory leaks, console errors, and unpredictable behavior.",
    investigationSteps: [
      "Read the full observable chain leading to .subscribe()",
      "Determine what the subscription does: DOM updates? side effects? state mutations?",
      "Choose the best fix strategy:",
      "  - If the result is used in the template: replace with `async` pipe or `toSignal()`",
      "  - If it triggers a side effect: add `takeUntilDestroyed(this.destroyRef)` as the FIRST operator in pipe()",
      "  - If it is a one-time operation (e.g., HTTP call that completes): verify it actually completes, or add `take(1)` / `first()`",
      "Ensure DestroyRef is injected if using takeUntilDestroyed",
      "Check if there are other .subscribe() calls in the same file that need the same treatment",
    ],
  },

  "no-async-lifecycle": {
    riskLevel: "high",
    whyItMatters:
      "Angular does NOT await async lifecycle hooks. Marking ngOnInit as async gives a false sense of safety -- Angular calls it and immediately moves on. Any code after an `await` runs in a microtask that Angular is unaware of, which can cause: race conditions with other lifecycle hooks, template rendering before data is ready, and change detection issues where the view does not update after the awaited value resolves.",
    investigationSteps: [
      "Read the full lifecycle method and identify all await expressions",
      "For each await: determine if the result is used in the template or triggers state changes",
      "Refactor options:",
      "  - Move async calls to a separate private method and call it from the lifecycle hook (fire-and-forget with explicit error handling)",
      "  - Convert to observable pattern: use an observable + async pipe in the template",
      "  - Use toSignal() with an observable to drive template state reactively",
      "Ensure error handling is explicit (try/catch or .catch()) since unhandled rejections in lifecycle hooks are hard to debug",
      "Remove the `async` keyword from the lifecycle method signature",
    ],
  },

  "prefer-inject": {
    riskLevel: "low",
    whyItMatters:
      "Constructor injection is the legacy pattern. The inject() function is the modern Angular way (since v14+). It enables: injection outside constructors (field initializers), better tree-shaking, less boilerplate, and easier testing. This is a stylistic migration with low risk.",
    investigationSteps: [
      "List all constructor parameters that use access modifiers (private, protected, public, readonly)",
      "Convert each to a class field using inject(): `private svc = inject(MyService)`",
      "Remove the constructor if it becomes empty, or remove only the DI parameters",
      "Verify the component still compiles and tests pass",
      "Check if any constructor parameters are used in super() calls -- those may need special handling",
    ],
  },

  "feature-isolation": {
    riskLevel: "high",
    whyItMatters:
      "When features import from each other directly, they create hidden coupling that prevents independent deployment, lazy loading, and refactoring. Circular feature dependencies make it impossible to extract a feature into a library or micro-frontend later. Shared code between features must live in `shared/` or `core/`.",
    investigationSteps: [
      "Identify exactly what is being imported from the other feature",
      "Determine if the imported code is truly feature-specific or could be shared",
      "Options:",
      "  - If the code is reusable: move it to `shared/` (for UI components, pipes, models) or `core/` (for services, guards)",
      "  - If both features need to communicate: use a shared service in `core/` or `shared/` with observables/signals",
      "  - If one feature extends the other: consider creating a shared base in `shared/`",
      "Update all import paths after moving code",
      "Verify no circular dependencies are introduced",
      "Run the application and tests to confirm nothing broke",
    ],
  },

  "core-shared-boundary": {
    riskLevel: "high",
    whyItMatters:
      "The dependency direction must be: features -> shared -> core. When shared imports from core, or core/shared import from features, it creates circular dependency risks and breaks the architectural layering that enables independent testing and lazy loading.",
    investigationSteps: [
      "Identify the exact import that violates the boundary",
      "Determine which layer the imported code actually belongs in",
      "If shared imports from core: the code likely belongs in shared, or the dependency should be inverted using an injection token",
      "If core imports from features: the code must be extracted out of the feature into core",
      "Consider using Angular InjectionToken and DI to invert dependencies rather than direct imports",
      "Verify the fix does not introduce new boundary violations",
    ],
  },

  "circular-dependency": {
    riskLevel: "high",
    whyItMatters:
      'Circular imports cause undefined values at runtime (module A imports B which imports A, but A is not fully initialized yet). This leads to cryptic "Cannot read property of undefined" errors, broken DI, and makes the codebase impossible to reason about.',
    investigationSteps: [
      "Trace the full circular import chain reported in the diagnostic",
      "Identify the weakest link -- which import could be removed or redirected?",
      "Common fixes:",
      "  - Extract shared interfaces/types into a separate file that both modules import",
      "  - Use dependency injection (InjectionToken) instead of direct import for services",
      "  - Merge tightly coupled files if they represent the same concern",
      "  - Use lazy imports (dynamic import()) if the dependency is only needed at runtime",
      "After fixing, verify no new cycles were introduced",
    ],
  },

  "large-component": {
    riskLevel: "medium",
    whyItMatters:
      "Large components are harder to understand, test, and maintain. They typically violate the Single Responsibility Principle, mixing presentation, business logic, and state management. They also slow down IDE performance, increase compile times, and make code review more difficult.",
    investigationSteps: [
      "Read the component to understand its responsibilities",
      "Identify logical sections that could be extracted:",
      "  - UI sections -> child presentational components",
      "  - Business logic -> services or helper functions",
      "  - State management -> signal stores or NgRx",
      "  - Form handling -> dedicated form components",
      "Plan the extraction: which parts can be moved without changing behavior?",
      "Ensure the parent-child communication pattern (Inputs/Outputs or signals) is clean",
      "Verify tests still pass after extraction",
    ],
  },

  "heavy-constructor": {
    riskLevel: "medium",
    whyItMatters:
      "Heavy constructors slow down component creation, which directly impacts page load and navigation performance. Constructors should only assign injected dependencies. Initialization logic belongs in ngOnInit, and complex setup should be lazy or deferred.",
    investigationSteps: [
      "Read the constructor and categorize each statement:",
      "  - DI assignments -> migrate to inject() field declarations",
      "  - Initialization logic -> move to ngOnInit()",
      "  - Event listener setup -> move to ngAfterViewInit()",
      "  - Subscription setup -> move to ngOnInit() with takeUntilDestroyed()",
      "Ensure the order of operations is preserved (some setup may depend on inputs being set)",
      "Verify the component still works after restructuring",
    ],
  },

  "barrel-re-export-bloat": {
    riskLevel: "low",
    whyItMatters:
      "Barrel files (index.ts) with `export *` re-exports prevent tree-shaking because bundlers cannot determine which exports are actually used. Importing one item from a barrel can pull in the entire module graph behind it, increasing bundle size.",
    investigationSteps: [
      "Review the barrel file and list all `export *` statements",
      "For each wildcard export, determine which named exports are actually consumed by importers",
      'Replace `export *` with specific named exports: `export { SpecificThing } from "./module"`',
      "Check if any consumers rely on the wildcard (importing things that would no longer be exported)",
      "Verify build succeeds and bundle size improves",
    ],
  },

  "eager-route-component": {
    riskLevel: "medium",
    whyItMatters:
      "Eagerly loaded route components are included in the main bundle, increasing initial load time. Lazy loading with loadComponent defers the import until the user navigates to that route, reducing the initial bundle size significantly.",
    investigationSteps: [
      "Open the routing file and find the route definition",
      "Identify the component being eagerly loaded",
      "Replace `component: MyComponent` with `loadComponent: () => import('./path').then(m => m.MyComponent)`",
      "Remove the static import of the component at the top of the file",
      "Verify the route still works after the change",
      "Check if the component has any route resolvers or guards that need adjustment",
    ],
  },

  "eager-route-children": {
    riskLevel: "medium",
    whyItMatters:
      "Inline children arrays prevent code splitting. All child route components are bundled with the parent, even if the user never navigates to them. Using loadChildren creates a separate chunk loaded on demand.",
    investigationSteps: [
      "Open the routing file and find the route with inline children",
      "Extract the children array into a separate routes file (e.g., feature.routes.ts)",
      "Replace `children: [...]` with `loadChildren: () => import('./feature.routes').then(m => m.routes)`",
      "Move any component imports to the new routes file",
      "Verify all child routes still work after the extraction",
    ],
  },

  "circular-service-injection": {
    riskLevel: "high",
    whyItMatters:
      "Circular service injection means Service A depends on Service B which depends back on Service A. This causes runtime errors, requires forwardRef hacks, and indicates tangled business logic. It makes services impossible to test in isolation.",
    investigationSteps: [
      "Trace the full injection cycle reported in the diagnostic",
      "Identify what shared functionality causes the cycle",
      "Options to break the cycle:",
      "  - Extract shared logic into a new service that both depend on",
      "  - Use an event bus or mediator pattern for cross-service communication",
      "  - Merge the services if they represent the same concern",
      "  - Use lazy injection with inject() inside a method instead of constructor/field",
      "Verify no new cycles are introduced after refactoring",
      "Remove any forwardRef() calls that were working around the cycle",
    ],
  },

  "forward-ref-usage": {
    riskLevel: "medium",
    whyItMatters:
      "forwardRef() exists to work around circular dependency issues in Angular DI. Its presence is a code smell that signals an architectural problem. Resolving the underlying circular dependency is preferred over using forwardRef.",
    investigationSteps: [
      "Identify why forwardRef is needed -- what circular dependency does it resolve?",
      "Trace the dependency chain to find the cycle",
      "Refactor to break the cycle (extract shared service, use mediator pattern, or restructure)",
      "Remove the forwardRef once the cycle is broken",
      "Verify DI still works correctly after the change",
    ],
  },

  "bypass-security-trust": {
    riskLevel: "high",
    whyItMatters:
      "bypassSecurityTrust* disables Angular's built-in XSS sanitization. If the input comes from user data, API responses, or URL parameters, an attacker can inject malicious scripts that steal cookies, session tokens, or perform actions on behalf of the user.",
    investigationSteps: [
      "Read the component to understand what data is being passed to bypassSecurityTrust*",
      "Trace the data source: is it user input, API response, hardcoded, or from a trusted source?",
      "If the data is user-controlled or from an external API, this is a real XSS vulnerability",
      "Options: use Angular's built-in sanitization (DomSanitizer.sanitize()), restructure to avoid raw HTML, or validate/sanitize the input before bypassing",
      "If bypass is truly needed (e.g., rendering trusted CMS content), add a code comment explaining why it's safe",
    ],
  },

  "eval-usage": {
    riskLevel: "high",
    whyItMatters:
      "eval() executes arbitrary strings as JavaScript code. If the string comes from user input, query parameters, or external data, an attacker can inject and execute arbitrary code in the user's browser.",
    investigationSteps: [
      "Identify what string is being evaluated and where it comes from",
      "If parsing JSON: replace with JSON.parse()",
      "If evaluating user expressions: use a safe expression parser library",
      "If dynamically creating functions: refactor to use a lookup table or strategy pattern",
      "Remove the eval() / new Function() call and verify the application still works",
    ],
  },

  "hardcoded-secret": {
    riskLevel: "high",
    whyItMatters:
      "Hardcoded secrets in source code are committed to version control history permanently. Even if deleted later, they remain in git history. Anyone with repository access (including CI systems, contractors, and leaked repos) can extract them.",
    investigationSteps: [
      "Identify the secret type: API key, token, password, or other credential",
      "Immediately rotate the secret if it has been committed to version control",
      "Move the secret to environment variables (e.g., process.env.API_KEY or Angular environments)",
      "Update deployment configuration to inject the secret at build/runtime",
      "Add the secret pattern to .gitignore or use git-secrets to prevent future commits",
    ],
  },

  "innerhtml-binding": {
    riskLevel: "medium",
    whyItMatters:
      "While Angular sanitizes [innerHTML] by default, complex HTML from APIs or user input can bypass sanitization in edge cases. Direct innerHTML usage also makes the template harder to reason about security-wise.",
    investigationSteps: [
      "Check what data is bound to [innerHTML] and where it comes from",
      "If it's static or trusted content: consider using text interpolation or a component instead",
      "If it's dynamic HTML from an API: ensure server-side sanitization and use DomSanitizer explicitly",
      "If it's user-generated content: replace with a safe rendering library or markdown parser",
      "Verify Angular's default sanitization is not being bypassed elsewhere for this value",
    ],
  },

  "low-signal-readiness": {
    riskLevel: "low",
    whyItMatters:
      "Angular Signals provide fine-grained reactivity, better performance, and less boilerplate than the legacy patterns (decorators, BehaviorSubject, .subscribe()). Migrating incrementally improves the codebase and prepares it for future Angular versions.",
    investigationSteps: [
      "Review the signal readiness report to see which patterns have the most legacy usage",
      "Start with the lowest effort migrations: @Input() -> input(), constructor injection -> inject()",
      "Plan migrations in phases: one pattern type at a time across the codebase",
      "For each migration, verify that tests pass and behavior is unchanged",
      "Leave complex migrations (BehaviorSubject -> signal, .subscribe() -> toSignal) for later phases",
    ],
  },
};

const DEFAULT_TEMPLATE: PromptTemplate = {
  riskLevel: "medium",
  whyItMatters:
    "This issue was flagged by ng-xray as a code quality concern that should be addressed to improve the overall health of the codebase.",
  investigationSteps: [
    "Read the affected file completely to understand the context",
    "Understand why this pattern is problematic",
    "Identify the safest way to fix it without breaking existing behavior",
    "Check for similar patterns in related files",
    "Create a plan with all required changes before modifying any files",
  ],
};

export const generateCursorPrompt = (diagnostic: Diagnostic): string => {
  const template = RULE_TEMPLATES[diagnostic.rule] ?? DEFAULT_TEMPLATE;

  const steps = template.investigationSteps.map((step, i) => `${i + 1}. ${step}`).join("\n");

  return `${PLAN_PREAMBLE}

Rule: ${diagnostic.rule} (${diagnostic.category})
File: ${diagnostic.filePath} at line ${diagnostic.line}
Severity: ${diagnostic.severity}
Risk level: ${template.riskLevel}

Issue: ${diagnostic.message}
${diagnostic.help ? `\nGuidance: ${diagnostic.help}` : ""}

Why this matters:
${template.whyItMatters}

Before making ANY changes, you MUST investigate:
${steps}

${PLAN_FOOTER}`;
};

export const generateFixAllPrompt = (diagnostics: Diagnostic[]): string => {
  if (diagnostics.length === 0) return "";

  const first = diagnostics[0];
  const template = RULE_TEMPLATES[first.rule] ?? DEFAULT_TEMPLATE;
  const uniqueFiles = [...new Set(diagnostics.map((d) => `- ${d.filePath}:${d.line}`))];

  const MAX_FILES_IN_PROMPT = 30;
  const truncated = uniqueFiles.length > MAX_FILES_IN_PROMPT;
  const fileList = truncated
    ? uniqueFiles.slice(0, MAX_FILES_IN_PROMPT).join("\n") +
      `\n- ... and ${uniqueFiles.length - MAX_FILES_IN_PROMPT} more files`
    : uniqueFiles.join("\n");

  const steps = template.investigationSteps.map((step, i) => `${i + 1}. ${step}`).join("\n");

  return `${PLAN_PREAMBLE}

Rule: ${first.rule} (${first.category})
Severity: ${first.severity}
Risk level: ${template.riskLevel}
Total instances: ${diagnostics.length} across ${uniqueFiles.length} files

Issue: ${first.message}
${first.help ? `\nGuidance: ${first.help}` : ""}

Why this matters:
${template.whyItMatters}

Affected files:
${fileList}

Before making ANY changes, you MUST:
${steps}

Important: This is a batch fix across ${uniqueFiles.length} files. You must:
1. Start with a comprehensive plan covering ALL affected files
2. Group files by risk level (some may need more careful migration than others)
3. Propose a phased approach if the change set is large
4. Identify files that may need additional changes beyond the direct fix (e.g., tests, imports)
5. After I approve the plan, execute the changes file by file, verifying each one

${PLAN_FOOTER}`;
};

export const generateCursorDeeplink = (diagnostic: Diagnostic): string => {
  const prompt = generateCursorPrompt(diagnostic);
  const encoded = encodeURIComponent(prompt);
  return `cursor://anysphere.cursor-deeplink/prompt?text=${encoded}`;
};

export const generateCursorWebLink = (diagnostic: Diagnostic): string => {
  const prompt = generateCursorPrompt(diagnostic);
  const encoded = encodeURIComponent(prompt);
  return `https://cursor.com/link/prompt?text=${encoded}`;
};
