# Circular Import Dependency

| Property | Value |
|----------|-------|
| Rule | `circular-dependency` |
| Category | architecture |
| Effort | refactor |
| Estimated fix time | ~30 min |

## Why it matters

Circular imports can cause undefined values at runtime, make the dependency graph fragile, and prevent effective tree-shaking.

## Before

```typescript
// a.ts imports b.ts, b.ts imports a.ts
```

## After

```typescript
// Extract shared logic into c.ts. Both a.ts and b.ts import from c.ts.
```

## Tags

`architecture`, `imports`
