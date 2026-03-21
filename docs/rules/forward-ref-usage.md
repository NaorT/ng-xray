# forwardRef Usage

| Property | Value |
|----------|-------|
| Rule | `forward-ref-usage` |
| Category | architecture |
| Effort | refactor |
| Estimated fix time | ~30 min |

## Why it matters

forwardRef is a workaround for circular dependencies. Its presence usually signals an architecture issue that should be resolved.

## Before

```typescript
@Inject(forwardRef(() => OtherService)) private other: OtherService
```

## After

```typescript
// Refactor to eliminate the circular dependency. Then inject normally:
private other = inject(OtherService);
```

## Tags

`architecture`, `dependency-injection`
