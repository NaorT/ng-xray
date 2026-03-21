# Unused Export (Generic)

| Property | Value |
|----------|-------|
| Rule | `dead-code-generic` |
| Category | dead-code |
| Effort | quick-fix |
| Estimated fix time | ~2 min |

## Why it matters

Dead exports increase bundle size and cognitive load. They make it harder to understand what code is actually used.

## Before

```typescript
export const legacyHelper = () => { /* never imported */ };
```

## After

```typescript
// Delete the unused export or mark it as @internal if planned for future use.
```

## Tags

`dead-code`, `bundle-size`
