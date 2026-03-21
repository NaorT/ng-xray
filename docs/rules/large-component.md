# Oversized Component

| Property | Value |
|----------|-------|
| Rule | `large-component` |
| Category | performance |
| Effort | refactor |
| Estimated fix time | ~60 min |

## Why it matters

Large components are hard to test, reason about, and maintain. They often indicate mixed concerns that should be split into child components.

## Before

```typescript
@Component({...})
export class MegaComponent { // 500+ lines of code }
```

## After

```typescript
// Split into smaller presentational child components.
// Extract business logic into services.
```

## Tags

`performance`, `maintainability`
