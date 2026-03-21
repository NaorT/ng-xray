# Unused Angular Entity

| Property | Value |
|----------|-------|
| Rule | `unused-angular-entity` |
| Category | dead-code |
| Effort | quick-fix |
| Estimated fix time | ~5 min |

## Why it matters

Unused components, services, pipes, or directives add dead weight to the bundle and confuse developers navigating the codebase.

## Before

```typescript
@Component({ selector: 'app-unused' })
export class UnusedComponent {} // never referenced
```

## After

```typescript
// Delete the component file entirely, or re-import it where needed.
```

## Tags

`dead-code`, `angular`
